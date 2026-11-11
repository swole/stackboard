import type { Space } from './types'
import type { ProState } from './proPlan'
import { allLinks, walkFolders } from './folderPlan'
import { plural } from './importPlan'

// AI tidy (Pro, 0.7.1): the pure half, unit-tested in tests/unit.test.ts. Which links a "Tidy this
// space" run sends, how the server's answer is checked and read, which planned stacks match a stack
// the space already has, and the bookmark moves that turn a plan into stacks and back again (Undo).
// The moves run against any object shaped like chrome.bookmarks, so the tests use an in-memory one.
// The network calls live in lib/tidy.ts; the server is site/api/tidy.js. 0.9.5: who gets the one free
// tidy (tidyAccess).

export const TIDY_API = 'https://getstackboard.com/api/tidy'
/** The server takes up to this many links a run (MAX_LINKS in site/api/_lib/tidy.js). */
export const TIDY_MAX_LINKS = 600
/** Below this many links there's nothing worth sorting. */
export const TIDY_MIN_LINKS = 4
/** How long the server's "ready" or "not ready" answer is trusted. */
export const READY_TTL_MS = 24 * 60 * 60 * 1000

const NAME_MAX = 40
const FALLBACK_NAME = 'Links'
const LEFTOVER_NAME = 'To sort'

export interface TidyLink {
  title: string
  url: string
}

/**
 * One space, ready to send: its links in board order, the bookmark behind each, and its link stacks.
 * Links in folders inside a stack (0.8.0) count as the stack's, after its own.
 */
export interface TidyInput {
  links: TidyLink[]
  ids: string[]
  /** link stacks as they are now, to-do stacks left out; `folders` counts the folders inside holding links */
  stacks: { id: string; title: string; ids: string[]; folders: number }[]
}

export function tidyInput(space: Space): TidyInput {
  const links: TidyLink[] = []
  const ids: string[] = []
  const stacks: TidyInput['stacks'] = []
  for (const st of space.stacks) {
    if (st.todo) continue
    const all = allLinks(st)
    const folders = walkFolders(st).filter((f) => allLinks(f).length > 0).length
    stacks.push({ id: st.id, title: st.title, ids: all.map((b) => b.id), folders })
    for (const b of all) {
      // readTree shows the address when a bookmark has no title; the server reads a bare address better.
      links.push({ title: b.title === b.url ? '' : b.title, url: b.url })
      ids.push(b.id)
    }
  }
  return { links, ids, stacks }
}

/** Why a space can't be tidied, or null when it can. */
export function tidyBlock(input: TidyInput): 'few' | 'many' | null {
  if (input.links.length < TIDY_MIN_LINKS) return 'few'
  if (input.links.length > TIDY_MAX_LINKS) return 'many'
  return null
}

export interface TidyLicense {
  key: string
  activationId: string
}

export interface TidyBody {
  scope: 'space'
  space: string
  links: TidyLink[]
  license?: TidyLicense
  /** 0.9.5: the one free tidy, sent with no key; the server counts it in a daily budget for everyone. */
  free?: true
}

/** The POST body: one space, so the server answers with stacks for that space only. No license: the free tidy (0.9.5). */
export function tidyBody(spaceName: string, input: TidyInput, license: TidyLicense | null): TidyBody {
  const body: TidyBody = { scope: 'space', space: Array.from(spaceName).slice(0, 60).join(''), links: input.links }
  if (license) body.license = { key: license.key, activationId: license.activationId }
  else body.free = true
  return body
}

// ---------- One free tidy per person (0.9.5) ----------
// the maintainer, 10 Nov 2026: Tidy needs a paid key, so the trial can't use it and almost nobody had seen
// it. Free and trial users, and a key that's paused, now get one tidy per Chrome profile. It sends
// the same space with `free: true` and no key, and the server runs it within a daily budget all
// free runs share (site/api/_lib/freeTidy.js). Once used (sync storage, lib/tidy.ts) only a paid key
// gets Tidy, as before, and there's no locked button. Never under the company's ai lock, nor its pro
// lock: the free tidy ends on a word about Pro, and school mode has none.

/** Who can press Tidy: a paid key, the one free tidy, or nobody. */
export type TidyAccess = 'paid' | 'free' | null

export function tidyAccess(p: {
  state: ProState
  /** This computer holds an activation for the key. */
  activated: boolean
  /** The Chrome profile has used its free tidy; null until read. */
  freeUsed: boolean | null
  lockAi: boolean
  lockPro: boolean
}): TidyAccess {
  if (p.lockAi) return null
  if (p.state.kind === 'pro') return p.activated ? 'paid' : null
  // A key on its first check (a new computer, for a few seconds) is a paid key on its way in.
  if (p.state.kind === 'paused' && p.state.reason === 'checking') return null
  return !p.lockPro && p.freeUsed === false ? 'free' : null
}

/** The button's words. */
export const TIDY_LABEL = { paid: 'Tidy', free: 'Tidy (free once)' } as const

/** After the free tidy, in its toast: the line, then the link to Settings > Stackboard Pro. */
export const FREE_TIDY_NOTE = { text: 'That was your free tidy. Pro tidies any space, any time.', link: 'See Pro' } as const

/** A stack name as it may be saved: one line, at most 40 characters, never empty. */
export function cleanName(raw: unknown, fallback = FALLBACK_NAME): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  const cut = Array.from(s).slice(0, NAME_MAX).join('').trim()
  return cut || fallback
}

export interface PlannedStack {
  name: string
  /** positions in TidyInput.links / ids */
  links: number[]
  /** the stack that already holds exactly these links, if one does: it stays and only moves or renames */
  sameAs?: string
}

/**
 * Reads the server's answer ({ spaces: [{ stacks: [{ name, links }] }] }) into stacks for one space:
 * spaces are flattened in order, stacks with the same name merge, each link is kept once (the first
 * stack that names it), numbers out of range are dropped, and anything left over goes into
 * "To sort". Null when the answer isn't a board at all.
 */
export function readPlan(raw: unknown, count: number): PlannedStack[] | null {
  const spaces = (raw as { spaces?: unknown } | null | undefined)?.spaces
  if (!Array.isArray(spaces)) return null
  const seen = new Set<number>()
  const byName = new Map<string, PlannedStack>()
  const out: PlannedStack[] = []
  const add = (name: string, links: number[]) => {
    if (!links.length) return
    const key = name.toLocaleLowerCase()
    const had = byName.get(key)
    if (had) had.links.push(...links)
    else {
      const st = { name, links }
      byName.set(key, st)
      out.push(st)
    }
  }
  for (const space of spaces) {
    const stacks = (space as { stacks?: unknown } | null)?.stacks
    if (!Array.isArray(stacks)) continue
    for (const st of stacks) {
      const rawLinks = (st as { links?: unknown } | null)?.links
      const links: number[] = []
      for (const i of Array.isArray(rawLinks) ? rawLinks : []) {
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= count || seen.has(i)) continue
        seen.add(i)
        links.push(i)
      }
      add(cleanName((st as { name?: unknown } | null)?.name), links)
    }
  }
  const left: number[] = []
  for (let i = 0; i < count; i++) if (!seen.has(i)) left.push(i)
  add(LEFTOVER_NAME, left)
  return out
}

/** Marks each planned stack that holds exactly the links of a stack the space already has. */
export function markSame(plan: PlannedStack[], input: TidyInput): PlannedStack[] {
  const setOf = (ids: string[]) => [...ids].sort().join('\u0000')
  const used = new Set<string>()
  return plan.map((p) => {
    const want = setOf(p.links.map((i) => input.ids[i]))
    const match = input.stacks.find((s) => !used.has(s.id) && s.ids.length === p.links.length && setOf(s.ids) === want)
    if (match) used.add(match.id)
    return { name: p.name, links: p.links, sameAs: match?.id }
  })
}

/** True when applying the plan would change nothing: the same stacks, names and order as now. */
export function isNoop(plan: PlannedStack[], input: TidyInput): boolean {
  const now = input.stacks.filter((s) => s.ids.length > 0)
  if (plan.length !== now.length) return false
  return plan.every((p, k) => p.sameAs === now[k].id && p.name === now[k].title)
}

/**
 * Folders inside stacks (0.8.0) that Apply empties into the new stacks: those holding links in every
 * stack the plan doesn't keep whole. A kept stack keeps its folders.
 */
export function flattenedFolders(plan: PlannedStack[], input: TidyInput): number {
  const kept = new Set(plan.map((p) => p.sameAs).filter(Boolean))
  return input.stacks.reduce((n, s) => n + (kept.has(s.id) ? 0 : s.folders), 0)
}

/** The preview's line about them, or null when no folder is flattened. */
export function flattenNote(n: number): string | null {
  if (!n) return null
  return n === 1
    ? '1 folder inside a stack gets flattened into the new stacks; Undo puts it back.'
    : `${plural(n, 'folder')} inside stacks get flattened into the new stacks; Undo puts them back.`
}

export type TidyError = 'pro' | 'cap' | 'free-cap' | 'busy' | 'not-ready' | 'refused' | 'too-many' | 'answer'

/** What went wrong, in words for the toast. */
export const TIDY_ERRORS: Record<TidyError, string> = {
  pro: 'Your Pro key needs attention',
  cap: "That's today's limit, try again tomorrow",
  'free-cap': 'Free tidies are used up for today. Try again tomorrow.',
  busy: "Couldn't reach Stackboard, try again in a moment",
  'not-ready': 'Tidy is switched off for now',
  refused: "Tidy couldn't sort this space",
  'too-many': 'Tidy works on up to 600 links at a time',
  answer: "Couldn't read the answer, try again in a moment",
}

/**
 * Reads the server's response into a plan or an error (status codes from site/api/tidy.js). `free`:
 * the free tidy (0.9.5), which a server from before it answers as a run with no Pro key, so for that
 * one Tidy is switched off.
 */
export function readAnswer(status: number, body: unknown, count: number, free = false): { plan: PlannedStack[] } | { error: TidyError } {
  const reason = (body as { reason?: unknown } | null)?.reason
  if (status === 200) {
    const plan = readPlan((body as { board?: unknown } | null)?.board, count)
    return plan && plan.length ? { plan } : { error: 'answer' }
  }
  if (status === 402) return { error: free ? 'not-ready' : 'pro' }
  if (status === 429) return { error: reason === 'busy' ? 'busy' : reason === 'free-cap' ? 'free-cap' : 'cap' }
  if (status === 503 && reason === 'not-ready') return { error: 'not-ready' }
  if (status === 422) return { error: 'refused' }
  if (status === 400 && reason === 'count') return { error: 'too-many' }
  return { error: 'busy' }
}

// ---------- Applying a plan, and Undo ----------

/** What the moves need from chrome.bookmarks (its promise API). */
export interface BookmarksApi {
  /** the node, as a list of one; Chrome throws for an id that's gone */
  get(id: string): Promise<{ id: string; parentId?: string }[]>
  getChildren(id: string): Promise<{ id: string; title: string; url?: string }[]>
  create(arg: { parentId: string; index?: number; title: string; url?: string }): Promise<{ id: string }>
  move(id: string, dest: { parentId: string; index?: number }): Promise<unknown>
  update(id: string, changes: { title?: string }): Promise<unknown>
  /** removes a bookmark or an empty folder; Chrome refuses a folder that still has children */
  remove(id: string): Promise<unknown>
}

/** Everything Undo needs to put the space back the way it was. */
export interface TidyRecord {
  spaceId: string
  /** the space's children before, in order (stacks, to-do stacks, anything else) */
  children: string[]
  /**
   * each link stack that had links, then the folders inside it (0.8.0, with the folder it sits in),
   * outer first: its title and its children before, in order
   */
  stacks: { id: string; title: string; children: string[]; parentId?: string }[]
  /** stacks the plan reused under a new name */
  renamed: { id: string; from: string }[]
  /** stacks made for the plan */
  created: string[]
  /** emptied stacks and folders that were removed */
  removed: string[]
  /** links (and reused stacks) that left the space between the preview and Apply: left alone */
  skipped?: string[]
}

/**
 * Turns a plan into stacks: planned stacks go in plan order where the first stack with links was,
 * a reused stack only moves (and renames), links move into new stacks in plan order (links in
 * folders inside a stack too), and the stacks and folders the moves emptied are removed; a stack
 * left with nothing but empty folders goes with them. Empty stacks, to-do stacks, anything that
 * isn't a link stack, and an empty folder in a stack that still holds something, stay.
 * Only same-parent moves to the left happen, so Chrome's index quirk never applies.
 * The record fills in as it goes, so a run that stops halfway can still be undone.
 * Everything is read again at Apply: a link or stack that left the space since the preview (another
 * tab, Chrome's bookmark manager, sync) is skipped, never pulled back in, and each link's stack or
 * folder is checked again right before the link moves.
 */
export async function runApply(api: BookmarksApi, spaceId: string, plan: PlannedStack[], input: TidyInput, record?: TidyRecord): Promise<TidyRecord> {
  const rec: TidyRecord = record ?? { spaceId, children: [], stacks: [], renamed: [], created: [], removed: [] }
  rec.children = (await api.getChildren(spaceId)).map((c) => c.id)
  const here = new Set(rec.children)
  const linkStacks = input.stacks.filter((s) => s.ids.length > 0 && here.has(s.id))
  // Each link stack and every folder inside it (0.8.0), outer first, with their children as they are now.
  const note = async (id: string, title: string, parentId?: string): Promise<void> => {
    const kids = await api.getChildren(id)
    rec.stacks.push({ id, title, children: kids.map((c) => c.id), ...(parentId ? { parentId } : {}) })
    for (const k of kids) if (!k.url) await note(k.id, k.title, id)
  }
  for (const s of linkStacks) await note(s.id, s.title)
  // Where each link sat when Apply began. It is looked for there again right before it moves.
  const parentOf = new Map<string, string>()
  for (const s of rec.stacks) for (const c of s.children) parentOf.set(c, s.id)
  const stillThere = async (id: string): Promise<boolean> => {
    const parent = parentOf.get(id)
    if (!parent) return false
    try {
      const [node] = await api.get(id)
      return node?.parentId === parent
    } catch {
      return false // the link is gone
    }
  }
  const skip = (id: string) => (rec.skipped ??= []).push(id)
  const base = Math.min(...linkStacks.map((s) => rec.children.indexOf(s.id)).filter((i) => i >= 0))
  if (!Number.isFinite(base)) return rec

  const targets: (string | null)[] = []
  let at = base
  for (let k = 0; k < plan.length; k++) {
    const p = plan[k]
    const title = cleanName(p.name)
    if (p.sameAs) {
      if (!here.has(p.sameAs)) {
        skip(p.sameAs)
        targets.push(null)
        continue
      }
      await api.move(p.sameAs, { parentId: spaceId, index: at++ })
      const was = input.stacks.find((s) => s.id === p.sameAs)?.title
      if (was !== undefined && was !== title) {
        await api.update(p.sameAs, { title })
        rec.renamed.push({ id: p.sameAs, from: was })
      }
      targets.push(p.sameAs)
    } else {
      const made = await api.create({ parentId: spaceId, index: at++, title })
      rec.created.push(made.id)
      targets.push(made.id)
    }
  }
  for (let k = 0; k < plan.length; k++) {
    const target = targets[k]
    if (plan[k].sameAs || !target) continue
    let j = 0
    for (const n of plan[k].links) {
      const id = input.ids[n]
      if (!(await stillThere(id))) {
        skip(id)
        continue
      }
      await api.move(id, { parentId: target, index: j++ })
    }
  }
  const reused = new Set(plan.map((p) => p.sameAs).filter(Boolean))
  // Innermost first: a folder the moves emptied goes, then its stack if nothing is left in it.
  const had = new Map(rec.stacks.map((s) => [s.id, s.children.length]))
  const prune = async (id: string): Promise<void> => {
    for (const k of await api.getChildren(id)) if (!k.url && had.get(k.id)) await prune(k.id)
    if ((await api.getChildren(id)).length) return // something is still in it, maybe something Stackboard doesn't show
    await api.remove(id)
    rec.removed.push(id)
  }
  // True when all that's left below is folders recorded at the start, with no bookmark in them.
  const onlyEmptyFolders = async (id: string): Promise<boolean> => {
    for (const k of await api.getChildren(id)) if (k.url || !had.has(k.id) || !(await onlyEmptyFolders(k.id))) return false
    return true
  }
  // A stack the moves emptied of every link goes, along with the empty folders left in it (those
  // that were empty before too), innermost first and recorded, so Undo makes them again.
  const removeAll = async (id: string): Promise<void> => {
    for (const k of await api.getChildren(id)) if (!k.url) await removeAll(k.id)
    await api.remove(id)
    rec.removed.push(id)
  }
  for (const s of linkStacks) {
    if (reused.has(s.id)) continue
    if (await onlyEmptyFolders(s.id)) await removeAll(s.id)
    else await prune(s.id)
  }
  return rec
}

/**
 * Puts the space back: removed stacks and folders come back under their old names, every link
 * returns to its old stack or folder and place, the stacks Tidy made are removed once empty, names
 * come back, and the space's children return to their old order. Bookmarks keep their ids
 * throughout; only a re-made stack or folder gets a new one. Returns the new id of each.
 */
export async function runUndo(api: BookmarksApi, rec: TidyRecord): Promise<Map<string, string>> {
  const remade = new Map<string, string>()
  const now = (id: string) => remade.get(id) ?? id
  // Outer first (the record's order), so a re-made folder's stack or folder is there to hold it.
  const removed = new Set(rec.removed)
  for (const s of rec.stacks) {
    if (!removed.has(s.id)) continue
    remade.set(s.id, (await api.create({ parentId: s.parentId ? now(s.parentId) : rec.spaceId, title: s.title })).id)
  }
  // Each child goes back after the ones already placed. A link Apply left alone (it moved away while
  // the run went on) stays where it went, and one deleted since is passed over; neither leaves a gap.
  const leftAlone = new Set(rec.skipped ?? [])
  for (const s of rec.stacks) {
    let at = 0
    for (const child of s.children) {
      if (leftAlone.has(child)) continue
      try {
        await api.move(now(child), { parentId: now(s.id), index: at })
        at++
      } catch {
        // deleted since: the rest still go back
      }
    }
  }
  for (const id of rec.created) {
    try {
      if (!(await api.getChildren(id)).length) await api.remove(id)
    } catch {
      // already gone
    }
  }
  for (const r of rec.renamed) await api.update(r.id, { title: r.from }).catch(() => {})
  let at = 0
  for (const child of rec.children) {
    try {
      await api.move(now(child), { parentId: rec.spaceId, index: at })
      at++
    } catch {
      // deleted since
    }
  }
  return remade
}
