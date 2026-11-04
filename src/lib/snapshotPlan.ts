import { plural } from './importPlan'
import { countFolderLinks } from './folderPlan'
import type { BookmarkBackup } from './types'

// Daily snapshots (Pro, 0.7.0): one copy of the board a day, the newest 14 kept, on this computer
// only. Pure, so tests/unit.test.ts covers the day keys, pruning, names and counts; IndexedDB and
// the restore writes live in snapshots.ts.

export const SNAPSHOT_DAYS = 14
/** Days kept while today's board has under half the links of the fullest kept day (a wipe). */
export const SNAPSHOT_KEEP_SHRUNK = 30

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type BackupSpace = BookmarkBackup['spaces'][number]

export interface SnapshotCounts {
  spaces: number
  stacks: number
  links: number
  /** to-do stacks */
  lists: number
  /** items across every to-do stack */
  items: number
}

export interface Snapshot {
  /** The local calendar day, 'YYYY-MM-DD'. One snapshot a day: the first new tab of the day takes it. */
  day: string
  at: number
  counts: SnapshotCounts
  /** The same shape as Settings > Export JSON, so a downloaded snapshot imports like a backup. */
  backup: BookmarkBackup
}

/** 'YYYY-MM-DD' for the local calendar day (the user's midnight, so "today" matches their clock). */
export function dayKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayParts(day: string): { y: number; m: number; d: number } | null {
  if (!DAY_RE.test(day)) return null
  const [y, m, d] = day.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null
}

/** "2 Nov" */
export function shortDay(day: string): string {
  const p = dayParts(day)
  return p ? `${p.d} ${MONTHS[p.m - 1]}` : day
}

/** "Mon, 2 Nov" */
export function dayLabel(day: string): string {
  const p = dayParts(day)
  if (!p) return day
  return `${WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()]}, ${shortDay(day)}`
}

/**
 * The day keys to delete so only the newest `keep` stay. Keys that aren't days at all go too.
 * Returned oldest first.
 */
export function keysToPrune(keys: readonly string[], keep = SNAPSHOT_DAYS): string[] {
  const days = [...new Set(keys.filter((k) => DAY_RE.test(k)))].sort().reverse()
  const junk = keys.filter((k) => !DAY_RE.test(k))
  return [...junk, ...days.slice(Math.max(0, keep)).sort()]
}

/**
 * "Work (2 Nov)": what a restored copy is called, so it sits beside today's "Work" without being
 * mistaken for it. A copy restored again gets the new date in place of the old one.
 */
export function restoredName(name: string, day: string): string {
  const base = name.replace(/\s*\(\d{1,2} [A-Z][a-z]{2}\)$/, '').trim() || name.trim()
  return `${base} (${shortDay(day)})`
}

export function countSpace(space: BackupSpace): Omit<SnapshotCounts, 'spaces'> {
  let stacks = 0
  let links = 0
  let lists = 0
  let items = 0
  for (const st of space?.stacks ?? []) {
    stacks++
    if (Array.isArray(st?.todo)) {
      lists++
      items += st.todo.length
    } else links += (Array.isArray(st?.bookmarks) ? st.bookmarks.length : 0) + countFolderLinks(st?.folders) // folders inside count (0.8.0)
  }
  return { stacks, links, lists, items }
}

export function countBackup(backup: BookmarkBackup): SnapshotCounts {
  const total: SnapshotCounts = { spaces: 0, stacks: 0, links: 0, lists: 0, items: 0 }
  for (const space of backup?.spaces ?? []) {
    const c = countSpace(space)
    total.spaces++
    total.stacks += c.stacks
    total.links += c.links
    total.lists += c.lists
    total.items += c.items
  }
  return total
}

/** Nothing worth keeping: no spaces, or no links and no to-do items anywhere. */
export function isEmptyBoard(c: SnapshotCounts): boolean {
  return c.spaces === 0 || (c.links === 0 && c.items === 0)
}

/** "8 spaces, 214 links" plus ", 2 to-do lists" when there are any. */
export function countsText(c: Pick<SnapshotCounts, 'links' | 'lists'> & { spaces?: number }): string {
  const parts = [c.spaces === undefined ? '' : plural(c.spaces, 'space'), plural(c.links, 'link')]
  if (c.lists) parts.push(plural(c.lists, 'to-do list'))
  return parts.filter(Boolean).join(', ')
}

/** "Mon, 2 Nov: 8 spaces, 214 links" */
export function summaryLine(s: Pick<Snapshot, 'day' | 'counts'>): string {
  return `${dayLabel(s.day)}: ${countsText(s.counts)}`
}

/** A stored record read back: anything that isn't a whole snapshot is dropped, and counts are recomputed. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  const r = raw as Partial<Snapshot> | null
  if (!r || typeof r !== 'object' || typeof r.day !== 'string' || !dayParts(r.day)) return null
  const b = r.backup as BookmarkBackup | undefined
  if (!b || b.version !== 1 || !Array.isArray(b.spaces)) return null
  return { day: r.day, at: typeof r.at === 'number' ? r.at : 0, counts: countBackup(b), backup: b }
}

/** Newest first. */
export function sortSnapshots(list: Snapshot[]): Snapshot[] {
  return [...list].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
}
