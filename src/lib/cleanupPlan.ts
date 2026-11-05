import { isImportableUrl, plural, PATH_SEPARATOR } from './importPlan'
import { parseSpaceTitle } from './icon'
import { todoIdFromUrl } from './todoPlan'
import { isStackMarker } from './stackStylePlan'

// "Clean up your board" (Pro, 0.7.1): which links are duplicates, which look unused, and how a
// failed reachability check reads. Pure, so tests/unit.test.ts covers every rule; the bookmark
// reads, the checks and the removals live in lib/cleanup.ts.

const DAY = 24 * 60 * 60 * 1000
/** "Unused" means no open for this long, on a link at least this old. */
export const UNUSED_MS = 183 * DAY
/** One reachability check gives up after this long. */
export const CHECK_TIMEOUT_MS = 8000
/** Checks running at once. */
export const CHECK_CONCURRENCY = 4

/** Query parameters that only say where a click came from; they never change the page. */
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|twclid|ttclid|li_fat_id|_hsenc|_hsmi)$/i

/**
 * The form two links are compared in: lowercase scheme and host, no trailing slash, no tracking
 * parameters. Path, the rest of the query and the hash stay, since they pick the page. Only used
 * for matching; the saved link is never changed.
 */
export function normalizeUrl(raw: string): string {
  const url = raw.trim()
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return url
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key)
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : ''
  const query = u.searchParams.toString()
  return `${u.protocol}//${u.host}${path}${query ? `?${query}` : ''}${u.hash}`
}

/** One link on the board as the clean-up sees it, in board order. */
export interface CleanLink {
  id: string
  url: string
  title: string
  spaceName: string
  spaceEmoji: string
  stackTitle: string
  parentId: string
  index: number
  dateAdded?: number
  /** Chrome's own record of the last open, when it has one (Chrome 114+). */
  dateLastUsed?: number
}

/** "⚡ Work › Dailies", or "⚡ Work › Dailies › Clients" for a link in a folder inside the stack. */
export function locationLabel(l: Pick<CleanLink, 'spaceEmoji' | 'spaceName' | 'stackTitle'>): string {
  return `${l.spaceEmoji} ${l.spaceName}${PATH_SEPARATOR}${l.stackTitle}`
}

/** The parts of a chrome.bookmarks node the clean-up reads (folderPlan's TreeNode plus Chrome's last open). */
interface LinkNode {
  id: string
  title: string
  url?: string
  index?: number
  dateAdded?: number
  dateLastUsed?: number
  children?: LinkNode[]
}

/**
 * Every link on the board, in board order: space, stack, the stack's own links, then the folders
 * inside it (0.8.0), whose links carry the folder path in `stackTitle`. A to-do stack is passed
 * over whole, as the board shows it (folderPlan's mapTree), and markers are never links, so a list
 * can never be removed from here.
 */
export function boardLinks(root: LinkNode): CleanLink[] {
  const out: CleanLink[] = []
  const byIndex = (a: LinkNode, b: LinkNode) => (a.index ?? 0) - (b.index ?? 0)
  const kids = (n: LinkNode, links: boolean) => (n.children ?? []).filter((c) => !!c.url === links).sort(byIndex)
  for (const space of kids(root, false)) {
    const { emoji, name } = parseSpaceTitle(space.title)
    const walk = (node: LinkNode, where: string) => {
      for (const b of kids(node, true)) {
        if (todoIdFromUrl(b.url) || isStackMarker(b.url)) continue // markers aren't links
        out.push({
          id: b.id,
          url: b.url!,
          title: b.title || b.url!,
          spaceName: name,
          spaceEmoji: emoji,
          stackTitle: where,
          parentId: node.id,
          index: b.index ?? 0,
          dateAdded: b.dateAdded,
          dateLastUsed: typeof b.dateLastUsed === 'number' && b.dateLastUsed > 0 ? b.dateLastUsed : undefined,
        })
      }
      for (const f of kids(node, false)) walk(f, `${where}${PATH_SEPARATOR}${f.title}`)
    }
    for (const stack of kids(space, false)) {
      if ((stack.children ?? []).some((c) => todoIdFromUrl(c.url))) continue // a to-do stack
      walk(stack, stack.title)
    }
  }
  return out
}

export interface DuplicateGroup {
  /** the normalised link every copy shares */
  key: string
  /** every copy in board order; the first one stays */
  links: CleanLink[]
}

/** Links saved more than once, grouped, in board order of their first copy. */
export function findDuplicates(links: CleanLink[]): DuplicateGroup[] {
  const groups = new Map<string, CleanLink[]>()
  for (const l of links) {
    const key = normalizeUrl(l.url)
    const g = groups.get(key)
    if (g) g.push(l)
    else groups.set(key, [l])
  }
  return [...groups.entries()].filter(([, g]) => g.length > 1).map(([key, g]) => ({ key, links: g }))
}

/** Every copy after the first: what the duplicates section ticks for you. */
export function extraCopies(groups: DuplicateGroup[]): string[] {
  return groups.flatMap((g) => g.links.slice(1).map((l) => l.id))
}

/** The last open we know of: Chrome's record or Stackboard's own, whichever is later. 0 = none. */
export function lastOpened(l: CleanLink, opens: ReadonlyMap<string, number>): number {
  return Math.max(l.dateLastUsed ?? 0, opens.get(normalizeUrl(l.url)) ?? 0)
}

/**
 * Added at least six months ago and not opened in six months, as far as either record knows.
 * `since` is when Stackboard started counting opens: every link counts as opened then, since a
 * click before that left no trace, so nothing shows until six months of real counting exist.
 */
export function isUnused(l: CleanLink, opens: ReadonlyMap<string, number>, now: number, ageMs = UNUSED_MS, since = 0): boolean {
  if (typeof l.dateAdded !== 'number' || now - l.dateAdded < ageMs) return false
  return now - Math.max(lastOpened(l, opens), since) >= ageMs
}

export function findUnused(links: CleanLink[], opens: ReadonlyMap<string, number>, now: number, ageMs = UNUSED_MS, since = 0): CleanLink[] {
  return links.filter((l) => isUnused(l, opens, now, ageMs, since))
}

/** True until opens have been counted for six months: the Unused list can't say anything yet. */
export function stillCounting(since: number, now: number, ageMs = UNUSED_MS): boolean {
  return now - since < ageMs
}

/** Only web pages get a reachability check; bookmarklets, data: and browser pages are skipped. */
export function isCheckable(url: string): boolean {
  return isImportableUrl(url)
}

/** One address per page to check (copies share a check), first copy's address as saved. */
export function checkTargets(links: CleanLink[]): string[] {
  const seen = new Map<string, string>()
  for (const l of links) {
    if (!isCheckable(l.url)) continue
    const key = normalizeUrl(l.url)
    if (!seen.has(key)) seen.set(key, l.url.trim())
  }
  return [...seen.values()]
}

export type CheckResult = 'ok' | 'timeout' | 'failed'

/**
 * What the check asks: the site's home page, once per site. A no-cors answer can't show the
 * status, so asking for the page itself adds nothing over the home page, and a page address can
 * carry one-time tokens or do something when loaded (unsubscribe, approve).
 */
export function siteOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}/` : null
  } catch {
    return null
  }
}

/** Each page's site, for the check: site -> the pages on it. */
export function groupBySite(urls: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const url of urls) {
    const site = siteOf(url)
    if (!site) continue
    const g = out.get(site)
    if (g) g.push(url)
    else out.set(site, [url])
  }
  return out
}

/**
 * The second try for a site that refused the first check. Some live sites refuse a request from
 * another site (2 of 30 popular sites tested on 2 Nov 2026: Google Fonts and x.com) but answer for
 * their icon, so a dead link has to fail both.
 */
export function secondProbe(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}/favicon.ico` : null
  } catch {
    return null
  }
}

/** A no-cors fetch either answers (opaque, whatever the status) or throws: this reads the throw. */
export function readCheckError(err: unknown): Exclude<CheckResult, 'ok'> {
  const name = (err as { name?: string } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'failed'
}

export const CHECK_WORDS: Record<Exclude<CheckResult, 'ok'>, string> = {
  failed: "Couldn't connect",
  timeout: 'No answer in 8 seconds',
}

/** When most checks fail at once, the connection is the likelier problem than the links. */
export function looksOffline(checked: number, failed: number): boolean {
  return checked >= 5 && failed / checked >= 0.8
}

/** The links whose page failed its check, in board order. */
export function unreachableLinks(links: CleanLink[], results: ReadonlyMap<string, CheckResult>): CleanLink[] {
  return links.filter((l) => {
    const r = isCheckable(l.url) ? results.get(normalizeUrl(l.url)) : undefined
    return r === 'failed' || r === 'timeout'
  })
}

// ---------- words ----------

export function duplicatesSummary(groups: DuplicateGroup[]): string {
  if (!groups.length) return 'No link is saved twice.'
  const extra = groups.reduce((n, g) => n + g.links.length - 1, 0)
  return `${plural(groups.length, 'link')} saved more than once, ${plural(extra, 'extra copy', 'extra copies')}.`
}

export function unusedSummary(n: number): string {
  return n ? `${plural(n, 'link')} not opened in six months.` : 'Nothing older than six months sits unopened.'
}

/** The Unused note while counting is under six months old: when the list can start to fill. */
export function countingNote(since: number, now: number, locale?: string, ageMs = UNUSED_MS): string {
  const fmt = (t: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t))
  return stillCounting(since, now, ageMs)
    ? `Stackboard counts opens from ${fmt(since)}. A link shows here after six months without an open, so this list starts on ${fmt(since + ageMs)}.`
    : `Stackboard has counted opens since ${fmt(since)}.`
}

/** "2 links had moved off the board and were left alone." for the removal toast. */
export function skippedNote(n: number): string | undefined {
  return n ? `${plural(n, 'link')} had moved off the board and ${n === 1 ? 'was' : 'were'} left alone.` : undefined
}

/** "Never opened", or "Last opened Mar 2025" in the browser's locale. */
export function openedWords(at: number): string {
  if (!at) return 'Never opened'
  return `Last opened ${new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(at))}`
}

export function removeButtonLabel(n: number): string {
  return n ? `Remove ${plural(n, 'link')}` : 'Remove selected'
}
