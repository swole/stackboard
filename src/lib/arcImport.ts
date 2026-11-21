// Import from Arc (0.9.7). Arc stops working on 22 December 2026 and no browser imports its sidebar
// into Chrome, so its people bring their spaces here from one of two files: Arc's sidebar file,
// StorableSidebar.json, which Arc keeps on disk (it holds the names people gave their tabs), or Arc's
// own export, "Arc Data Export.md" (Settings > Advanced > Export Data).
//
// Ported from the website's converter, site/assets/tools/bm.js (BM.parseArc, BM.parseArcMarkdown;
// checks in scripts/seo/test_bm.mjs, format notes in scripts/seo/research-arc-export.md). Pure, with
// no chrome.* calls: tests/unit.test.ts covers the mapping, and the import panel previews it before
// anything is written. The file is read in the page and goes nowhere.
//
// The mapping: each Arc space becomes a space. Its loose pinned tabs become the first stack, each
// pinned folder a stack, and the folders inside those stay folders inside the stack (0.8.0).
// Unpinned (Today) tabs from the sidebar file become the last stack; Arc's export doesn't mark which
// tabs were pinned, so from that file the loose tabs share one "Pinned and open tabs" stack. Arc's
// Favorites row becomes a stack too, first in the first space copied in. Links that aren't web pages
// (Arc notes, browser pages) stay behind (isImportableUrl).
//
// The file's layout, as the Arc importers of Zen (ZenMigrationUtils.sys.mjs), ChromeSideBar and
// arcaeologist read it and blanc's notes on a measured Arc 1.170 file describe it: sidebar.containers
// pairs a { global } key with the container holding spaces, items and topAppsContainerIDs (Little Arc
// windows come after, as { littleBrowser } pairs); arrays alternate ids and objects. No real file was
// available to test against (16 Nov 2026), so tests/unit.test.ts builds one in that layout.
//
// Where this differs from the website's reader: Favorites are read from that main container (the
// website looks only in { global }, where Arc doesn't write them) and from { global } too; a space
// whose newContainerIDs doesn't name a container falls back to the older containerIDs, whose markers
// are strings; a Split View hands its tabs to the folder around it, named or not (the website made a
// folder); Arc's named space icons become emoji; and a file that loops can't hang the page.

import { isImportableUrl, type PlannedFolder, type PlannedLink, type PlannedSpace, type PlannedStack } from './importPlan'

export interface ArcLink {
  kind: 'link'
  title: string
  url: string
}

export interface ArcFolder {
  kind: 'folder'
  title: string
  children: ArcNode[]
}

export type ArcNode = ArcLink | ArcFolder

export interface ArcSpace {
  title: string
  /** The space's emoji from the sidebar file, when it has one. */
  emoji: string | null
  /** Pinned tabs and folders in Arc's order; from Arc's export, the space's open tabs too. */
  pinned: ArcNode[]
  /** Unpinned (Today) tabs, below Arc's divider. The sidebar file only. */
  unpinned: ArcNode[]
}

/** 'sidebar' is StorableSidebar.json, 'export' is Arc Data Export.md. */
export type ArcFormat = 'sidebar' | 'export'

export interface ArcData {
  format: ArcFormat
  /** Arc's Favorites row, the icons at the top of the sidebar that every space shares. */
  favorites: ArcLink[]
  spaces: ArcSpace[]
}

/** The file isn't one of Arc's, or holds nothing to bring in. The message is shown as it is. */
export class ArcFileError extends Error {}

/** What the import panel says. Kept here so the unit tests hold the copy to the house rules. */
export const ARC_COPY = {
  notSidebar: "This JSON file isn't Arc's StorableSidebar.json.",
  noSpaces: 'No spaces found in this Arc file.',
  brokenJson: "This file can't be read. If Arc was open when you copied it, quit Arc and copy it again.",
  notArc: "This isn't one of Arc's files. Pick StorableSidebar.json or Arc Data Export.md.",
  noLinks: 'No web links found in this file.',
  tooBig: "This file is too big to be one of Arc's.",
  intro: "Pick Arc's sidebar file, StorableSidebar.json. Each Arc space becomes a space here, and its folders become stacks.",
  find: 'In the file window, paste %LOCALAPPDATA%\\Packages on Windows, or press ⌘⇧G on a Mac and paste the path. On Windows, uninstalling Arc deletes this file, so do this first.',
  export: "Arc Data Export.md from Arc's Export Data (Settings > Advanced) works too, but it has no tab names, so links are named after their address.",
  local: 'Stackboard reads the file here, in your browser.',
  choose: 'Choose Arc file',
  another: 'Pick another file',
} as const

/** Where Arc keeps its sidebar file. The Windows folder name ends in letters that differ per computer. */
export const ARC_PATHS = {
  windows: '%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_*\\LocalCache\\Local\\Arc\\StorableSidebar.json',
  mac: '~/Library/Application Support/Arc/StorableSidebar.json',
} as const

/** Arc's sidebar file runs to a few megabytes; anything far bigger isn't it. */
export const ARC_FILE_MAX_BYTES = 50 * 1024 * 1024

/** Every Arc space without an emoji of its own gets this one. */
export const ARC_EMOJI = '🌈'

/** The stacks the import makes beside Arc's own folders. */
export const ARC_STACKS = {
  favorites: 'Favorites',
  pinned: 'Pinned tabs',
  pinnedAndOpen: 'Pinned and open tabs',
  unpinned: 'Unpinned tabs',
} as const

/** A sidebar of Favorites alone has no space to put them in: they get this one. */
export const ARC_FAVORITES_SPACE = { name: 'Arc favorites', emoji: '⭐' } as const

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
/** A title as Arc stored it, on one line. */
const words = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** Deeper than any sidebar a person builds; a file that loops stops here. */
const MAX_DEPTH = 40
/** Items one file may produce; a file whose folders share children over and over stops here. */
const MAX_NODES = 200_000

function firstGrapheme(s: string): string {
  try {
    const next = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next()
    return next.done ? '' : next.value.segment
  } catch {
    return [...s][0] ?? ''
  }
}

/** The emoji a string starts with, or null. */
export function leadingEmoji(s: string): string | null {
  const g = firstGrapheme(s.trim())
  return g && /\p{Extended_Pictographic}/u.test(g) ? g : null
}

/**
 * Arc's named space icons (customInfo.iconType.icon), as the closest emoji. The names are Arc's own
 * icon set, as ChromeSideBar's Arc importer lists them; a name not here gets the Arc emoji.
 */
const ARC_ICON_EMOJI: Readonly<Record<string, string>> = {
  airplane: '✈️', albums: '🖼️', apps: '📱', bag: '🛍️', bandage: '🩹', barbell: '🏋️', baseball: '⚾', bed: '🛏️',
  bonfire: '🔥', book: '📖', bookmark: '🔖', briefcase: '💼', bulb: '💡', calendar: '📅', chatbubbleellipses: '💬',
  checkbox: '✅', circle: '⚪', cloud: '☁️', cloudoutline: '☁️', code: '💻', colorpallete: '🎨', colorpalette: '🎨',
  construction: '🚧', controller: '🎮', ellipse: '⚪', envelope: '✉️', file: '📄', filetrayfull: '🗂️', flag: '🚩',
  flash: '⚡', folder: '📁', gift: '🎁', grid: '🔳', heart: '❤️', layers: '📚', leaf: '🍃', mail: '📧', medical: '🩺',
  moon: '🌙', musicalnote: '🎵', notifications: '🔔', paw: '🐾', people: '👥', pizza: '🍕', planet: '🪐',
  receipt: '🧾', restaurant: '🍽️', shapes: '🔷', skull: '💀', square: '🟧', star: '⭐', sunny: '☀️', terminal: '⌨️',
  thumbsup: '👍', train: '🚆', triangle: '🔺', video: '🎬',
}

/**
 * The emoji Arc shows for a space: customInfo.iconType.emoji_v2 (text), .emoji (a code point), or
 * .icon (one of Arc's named icons, as the closest emoji). Zen's and ChromeSideBar's Arc importers read
 * these same fields. Anything else counts as none.
 */
function spaceEmoji(sp: Obj): string | null {
  const icon = isObj(sp.customInfo) && isObj(sp.customInfo.iconType) ? sp.customInfo.iconType : null
  if (!icon) return null
  for (const v of Object.values(icon)) {
    const s = typeof v === 'string' ? v : typeof v === 'number' && Number.isInteger(v) && v > 0x2000 && v <= 0x10ffff ? String.fromCodePoint(v) : ''
    const e = s ? leadingEmoji(s) : null
    if (e) return e
  }
  return typeof icon.icon === 'string' ? (ARC_ICON_EMOJI[icon.icon.toLowerCase()] ?? null) : null
}

/**
 * A space's pinned and unpinned container ids from one of its container lists, [marker, id, marker,
 * id]. newContainerIDs marks them with objects ({ pinned: {} }, { unpinned: { _0: ... } }); the older
 * containerIDs, which files still carry and older Arc wrote alone, with strings ("pinned").
 */
function containerIdsOf(list: unknown): { pinned: string | null; unpinned: string | null } {
  const ids = arr(list)
  const found: { pinned: string | null; unpinned: string | null } = { pinned: null, unpinned: null }
  for (let j = 0; j < ids.length - 1; j++) {
    const marker = ids[j]
    const id = ids[j + 1]
    if (typeof id !== 'string') continue
    const kind = typeof marker === 'string' ? marker : isObj(marker) ? ('pinned' in marker ? 'pinned' : 'unpinned' in marker ? 'unpinned' : '') : ''
    if (kind === 'pinned' || kind === 'unpinned') found[kind] ??= id
  }
  return found
}

/** Reads StorableSidebar.json (already parsed). Its arrays alternate id strings and objects. */
export function readSidebarFile(data: unknown): ArcData {
  const containers = isObj(data) && isObj(data.sidebar) ? data.sidebar.containers : undefined
  if (!Array.isArray(containers)) throw new ArcFileError(ARC_COPY.notSidebar)
  // `{ global }`, then right after it the container with the spaces and items.
  const gi = containers.findIndex((c) => isObj(c) && 'global' in c)
  const holdsSpaces = (c: unknown): c is Obj => isObj(c) && Array.isArray(c.spaces) && Array.isArray(c.items)
  const next = gi >= 0 ? containers[gi + 1] : undefined
  const main = holdsSpaces(next) ? next : containers.find(holdsSpaces)
  if (!main) throw new ArcFileError(ARC_COPY.noSpaces)

  const items = new Map<string, Obj>()
  for (const it of arr(main.items)) if (isObj(it) && typeof it.id === 'string') items.set(it.id, it)
  const kidsOf = (id: string): Obj[] => {
    const parent = items.get(id)
    const ids: unknown[] = parent && Array.isArray(parent.childrenIds) ? parent.childrenIds : [...items.values()].filter((it) => it.parentID === id).map((it) => it.id)
    const kids: Obj[] = []
    for (const k of ids) {
      const it = typeof k === 'string' ? items.get(k) : undefined
      if (it) kids.push(it)
    }
    return kids
  }

  let budget = MAX_NODES
  // An item as nodes: a tab is a link (the name someone gave it in Arc first, then the page's title);
  // a container is a folder of what's in it, or just what's in it for a Split View (data.splitView)
  // or anything with no title. A live folder (data.list.automaticLiveFolderData) comes as the links it
  // holds now; an easel has no tabs, so nothing. `path` holds the containers above, so a loop ends.
  const conv = (it: Obj, path: ReadonlySet<string>): ArcNode[] => {
    if (--budget < 0) return []
    const data = isObj(it.data) ? it.data : {}
    if (isObj(data.tab)) {
      const url = typeof data.tab.savedURL === 'string' ? data.tab.savedURL.trim() : ''
      return url ? [{ kind: 'link', title: words(it.title) || words(data.tab.savedTitle) || url, url }] : []
    }
    if (typeof it.id !== 'string' || path.has(it.id) || path.size >= MAX_DEPTH) return []
    const inner = new Set(path).add(it.id)
    const children = kidsOf(it.id).flatMap((k) => conv(k, inner))
    if (!children.length) return []
    const title = words(it.title)
    return title && !('splitView' in data) ? [{ kind: 'folder', title, children }] : children
  }
  const contents = (containerId: string | null): ArcNode[] =>
    containerId ? kidsOf(containerId).flatMap((k) => conv(k, new Set([containerId]))) : []

  const spaces: ArcSpace[] = []
  let unnamed = 1
  for (const sp of arr(main.spaces)) {
    if (!isObj(sp)) continue
    const title = words(sp.title) || `Space ${unnamed++}`
    // newContainerIDs first; the older containerIDs fills in whatever it doesn't name.
    const fresh = containerIdsOf(sp.newContainerIDs)
    const older = containerIdsOf(sp.containerIDs)
    const pinned = fresh.pinned ?? older.pinned
    const unpinned = fresh.unpinned ?? older.unpinned
    spaces.push({ title, emoji: spaceEmoji(sp), pinned: contents(pinned), unpinned: contents(unpinned) })
  }

  // Favorites hang off topAppsContainerIDs ([{ default: true }, "<id>", ...], one id per profile).
  const global = gi >= 0 && isObj(containers[gi]) && isObj(containers[gi].global) ? containers[gi].global : {}
  const favIds = new Set([...arr(global.topAppsContainerIDs), ...arr(main.topAppsContainerIDs)].filter((x): x is string => typeof x === 'string'))
  const favorites = uniqueLinks([...favIds].flatMap((id) => linksIn(contents(id))))
  return { format: 'sidebar', favorites, spaces }
}

function linksIn(nodes: readonly ArcNode[]): ArcLink[] {
  return nodes.flatMap((n) => (n.kind === 'link' ? [n] : linksIn(n.children)))
}

function uniqueLinks(links: readonly ArcLink[]): ArcLink[] {
  const seen = new Set<string>()
  return links.filter((l) => !seen.has(l.url) && !!seen.add(l.url))
}

/** A readable name for a bare address: the host, and the last part of the path when there is one. */
export function prettyTitle(url: string): string {
  try {
    const u = new URL(url)
    const last = decodeURIComponent(u.pathname).replace(/\/+$/, '').split('/').pop()
    const host = u.hostname.replace(/^www\./, '')
    return (last ? `${host} › ${last.replace(/[-_]+/g, ' ').replace(/\.\w{2,5}$/, '')}` : host) || url
  } catch {
    return url
  }
}

/** An item line: "- https://...", "- [title](url)" or "- <url>" (Arc's "Copy All Links as Markdown"). */
const ARC_ITEM = /^\s*[-*+]\s+(<[^>\s]+>|\[[^\]]*\]\([^)\s]+\)|[a-z][a-z0-9+.-]*:\S+)\s*$/i

/** Arc's export: the first line with text is a "# " heading and at least one list item is a link. */
export function isArcMarkdown(text: string): boolean {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const first = lines.find((l) => l.trim()) ?? ''
  if (!/^#\s+\S/.test(first)) return false
  return lines.slice(0, 20000).some((l) => ARC_ITEM.test(l))
}

/**
 * Reads "Arc Data Export.md": "# Space" headings, folders as deeper headings ("##" at the top level,
 * "###" inside it...), items as "- url" lines with no titles. Each space's first "## Favorites" mixes
 * the profile's Favorites row (repeated in every space of that profile) with the space's pinned and
 * open tabs, so the run of links that opens that list in two or more spaces is the Favorites row,
 * kept once; the rest stays with its space. Bare links are named from their address.
 */
export function readArcMarkdown(text: string): ArcData {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  interface Building {
    root: ArcFolder
    favs: ArcLink[] | null
  }
  const spaces: Building[] = []
  let space: Building | null = null
  // stack[level] is the folder a heading of that level opened; stack[1] is the space itself.
  let stack: Array<ArcFolder | undefined> = []
  let cur: ArcFolder | null = null
  let inFav = false
  let titled = false
  let unnamed = 1

  const open = (title: string): Building => {
    const s: Building = { root: { kind: 'folder', title: title || `Space ${unnamed++}`, children: [] }, favs: null }
    spaces.push(s)
    stack = [undefined, s.root]
    cur = s.root
    inFav = false
    return s
  }

  for (const line of lines) {
    const h = /^(#+)\s+(.*?)\s*$/.exec(line) ?? (/^#+\s*$/.test(line) ? [line, line.trim(), ''] : null)
    if (h) {
      const level = h[1].length
      const title = h[2]
      if (level === 1) {
        space = open(title)
        continue
      }
      const sp: Building = space ?? (space = open('Arc'))
      if (level === 2 && sp.favs === null && /^favorites$/i.test(title)) {
        sp.favs = []
        inFav = true
        stack.length = 2
        cur = sp.root
        continue
      }
      inFav = false
      let parent: ArcFolder | undefined
      for (let k = Math.min(level - 1, stack.length - 1); k >= 1 && !parent; k--) parent = stack[k]
      const f: ArcFolder = { kind: 'folder', title: title || 'Untitled', children: [] }
      ;(parent ?? sp.root).children.push(f)
      stack.length = level + 1
      stack[level] = f
      cur = f
      continue
    }
    const m = ARC_ITEM.exec(line)
    if (!m) continue
    let url = m[1]
    let title = ''
    const md = /^\[([^\]]*)\]\(([^)\s]+)\)$/.exec(url)
    if (md) {
      title = md[1].trim()
      url = md[2]
      titled = true
    } else if (url.startsWith('<')) url = url.slice(1, -1)
    const link: ArcLink = { kind: 'link', title: title || prettyTitle(url), url }
    const sp: Building = space ?? (space = open('Arc'))
    if (inFav && sp.favs) sp.favs.push(link)
    else (cur ?? sp.root).children.push(link)
  }

  // Spaces whose Favorites lists start with the same link share a profile; their common opening run
  // is that profile's Favorites row. Lists with titles aren't Arc's raw export: each keeps its own.
  const groups = new Map<string, Building[]>()
  if (!titled) {
    for (const sp of spaces) {
      if (!sp.favs?.length) continue
      const key = sp.favs[0].url
      groups.set(key, [...(groups.get(key) ?? []), sp])
    }
  }
  const favorites: ArcLink[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const lead = group[0].favs ?? []
    let n = lead.length
    for (const sp of group) {
      const favs = sp.favs ?? []
      let i = 0
      while (i < n && i < favs.length && favs[i].url === lead[i].url) i++
      n = i
    }
    if (!n) continue
    favorites.push(...lead.slice(0, n))
    for (const sp of group) sp.favs = (sp.favs ?? []).slice(n)
  }

  return {
    format: 'export',
    favorites: uniqueLinks(favorites),
    spaces: spaces.map((sp) => ({ title: sp.root.title, emoji: null, pinned: [...(sp.favs ?? []), ...sp.root.children], unpinned: [] })),
  }
}

/** Either file, told apart by what's in it. Throws ArcFileError with a sentence for the person. */
export function readArcFile(text: string): ArcData {
  const t = text.replace(/^﻿/, '')
  const s = t.trim()
  if (s.startsWith('{') || s.startsWith('[')) {
    let data: unknown
    try {
      data = JSON.parse(s)
    } catch {
      throw new ArcFileError(ARC_COPY.brokenJson)
    }
    return readSidebarFile(data)
  }
  if (isArcMarkdown(t)) return readArcMarkdown(t)
  throw new ArcFileError(ARC_COPY.notArc)
}

/** One Arc space as the import panel lists it: the space it makes, its web links and what stays behind. */
export interface ArcSource {
  id: string
  space: PlannedSpace
  links: number
  skipped: number
}

export interface ArcPlan {
  format: ArcFormat
  /** Every Arc space with a web link in it, in Arc's order. */
  spaces: ArcSource[]
  /** The Favorites row as a stack, for the first space copied in; null when it has no web links. */
  favorites: PlannedStack | null
  /** Favorites that aren't web pages, left behind with them. */
  favoritesSkipped: number
}

interface Tally {
  links: number
  skipped: number
}

function keepLinks(nodes: readonly ArcNode[], tally: Tally): PlannedLink[] {
  const out: PlannedLink[] = []
  for (const n of nodes) {
    if (n.kind !== 'link') continue
    if (!isImportableUrl(n.url)) {
      tally.skipped++
      continue
    }
    out.push({ title: n.title.trim() || n.url, url: n.url.trim() })
  }
  tally.links += out.length
  return out
}

/** A folder with its links and the folders inside it; null when no web link is anywhere below it. */
function planFolder(title: string, nodes: readonly ArcNode[], tally: Tally): PlannedFolder | null {
  const links = keepLinks(nodes, tally)
  const folders = nodes.flatMap((n) => (n.kind === 'folder' ? (planFolder(n.title, n.children, tally) ?? []) : []))
  if (!links.length && !folders.length) return null
  return { title: title.trim() || 'Untitled', links, folders }
}

const toStack = (f: PlannedFolder): PlannedStack => ({ title: f.title, links: f.links, ...(f.folders.length ? { folders: f.folders } : {}) })

/** The space's name and emoji: an emoji its title starts with, else Arc's own icon, else the Arc emoji. */
function spaceName(sp: ArcSpace): { name: string; emoji: string } {
  const title = sp.title.trim()
  const lead = leadingEmoji(title)
  if (lead) return { emoji: lead, name: title.slice(lead.length).trim() || title }
  return { emoji: sp.emoji ?? ARC_EMOJI, name: title }
}

/** What the import makes of an Arc file: one space per Arc space, the Favorites row as a stack. */
export function planArc(data: ArcData): ArcPlan {
  const looseTitle = data.format === 'export' ? ARC_STACKS.pinnedAndOpen : ARC_STACKS.pinned
  const spaces: ArcSource[] = []
  data.spaces.forEach((sp, i) => {
    const tally: Tally = { links: 0, skipped: 0 }
    const stacks: PlannedStack[] = []
    const loose = keepLinks(sp.pinned, tally)
    if (loose.length) stacks.push({ title: looseTitle, links: loose })
    for (const n of sp.pinned) {
      const f = n.kind === 'folder' ? planFolder(n.title, n.children, tally) : null
      if (f) stacks.push(toStack(f))
    }
    const today = planFolder(ARC_STACKS.unpinned, sp.unpinned, tally)
    if (today) stacks.push(toStack(today))
    if (!tally.links) return
    spaces.push({ id: `arc-${i}`, space: { ...spaceName(sp), stacks }, links: tally.links, skipped: tally.skipped })
  })

  const favTally: Tally = { links: 0, skipped: 0 }
  const favLinks = keepLinks(uniqueLinks(data.favorites), favTally)
  const favorites: PlannedStack | null = favLinks.length ? { title: ARC_STACKS.favorites, links: favLinks } : null
  if (favorites && !spaces.length) {
    spaces.push({ id: 'arc-favorites', space: { ...ARC_FAVORITES_SPACE, stacks: [favorites] }, links: favTally.links, skipped: favTally.skipped })
    return { format: data.format, spaces, favorites: null, favoritesSkipped: 0 }
  }
  return { format: data.format, spaces, favorites, favoritesSkipped: favorites ? favTally.skipped : 0 }
}

/** "1 link", "2 links" (importPlan's plural, kept local so this module reads on its own). */
function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** The line under the list of Arc spaces: what the copy makes, where the Favorites go, what stays behind. */
export function arcSummary(p: { spaces: number; stacks: number; folders: number; favorites: number; firstSpace: string | null; skipped: number }): string {
  if (!p.spaces) return 'Tick a space to copy it in.'
  const made = `${p.spaces === 1 ? 'A new space' : `${p.spaces} new spaces`} with ${count(p.stacks, 'stack')}${p.folders ? `, and ${count(p.folders, 'folder')} inside them` : ''}.`
  const favs = p.favorites && p.firstSpace ? ` Your Favorites row (${count(p.favorites, 'link')}) becomes the first stack in ${p.firstSpace}.` : ''
  const left = p.skipped ? ` ${count(p.skipped, 'link')} that ${p.skipped === 1 ? "isn't a web page stays" : "aren't web pages stay"} behind.` : ''
  return made + favs + left
}
