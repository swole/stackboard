import { isImportableUrl, plural, type PlannedLink } from './importPlan'
import type { TabLike } from './stashPlan'

// Auto-archive (Pro, 0.7.0, backlog M6): tabs nobody has looked at for a while save themselves
// into a dated stack in the Stash space, then close. Off until someone picks a time in
// Settings > Stackboard Pro. It runs when a new tab opens, so it needs no `alarms` permission.
// Pure, so tests/unit.test.ts covers which tabs go.
//
// What stays open: pinned tabs, tabs in a tab group, tabs playing sound, the tab on screen in
// each window (so a window never closes), browser pages, tabs Chrome can't date, and incognito
// windows (their tabs would land in synced bookmarks).

export interface ArchiveTab extends TabLike {
  active?: boolean
  audible?: boolean
  /** When the tab was last on screen, ms since epoch (Chrome 121+). */
  lastAccessed?: number
}

const HOUR = 60 * 60 * 1000

/** The choices in Settings; 12 hours is Arc's default and the one a first switch-on picks. */
export const ARCHIVE_AFTER = [
  { ms: 6 * HOUR, label: '6 hours' },
  { ms: 12 * HOUR, label: '12 hours' },
  { ms: 24 * HOUR, label: '1 day' },
  { ms: 7 * 24 * HOUR, label: '1 week' },
] as const

export const DEFAULT_ARCHIVE_AFTER = 12 * HOUR

/** A new tab asks for a run at most this often. */
export const ARCHIVE_EVERY_MS = 15 * 60 * 1000

/** A stored setting, or null (off) when it isn't one of the choices. */
export function parseArchiveAfter(raw: unknown): number | null {
  const ms = (raw as { afterMs?: unknown } | null | undefined)?.afterMs
  return ARCHIVE_AFTER.some((c) => c.ms === ms) ? (ms as number) : null
}

export interface ArchivePlan {
  links: PlannedLink[]
  /** every tab to close, duplicates included */
  tabIds: number[]
}

/**
 * When each tab was last left (tabSeen.ts). lastAccessed only moves when a tab comes on screen, so
 * without this a tab that stayed on screen all day would look idle the moment it was left. A tab
 * with no record counts as left when the record began (`since`), never earlier.
 */
export interface LeftTimes {
  since: number
  left: Record<string, number>
}

export function isIdle(tab: ArchiveTab, afterMs: number, now: number, seen?: LeftTimes): boolean {
  if (tab.pinned || tab.active || tab.audible) return false
  if (typeof tab.groupId === 'number' && tab.groupId >= 0) return false
  if (!isImportableUrl(tab.url || tab.pendingUrl || '')) return false
  if (typeof tab.lastAccessed !== 'number' || tab.lastAccessed <= 0) return false
  const left = seen ? (typeof tab.id === 'number' ? seen.left[tab.id] : undefined) ?? seen.since : 0
  return now - Math.max(tab.lastAccessed, left) >= afterMs
}

/** Idle tabs in strip order, a URL saved once. */
export function planArchive(tabs: ArchiveTab[], afterMs: number, now: number, seen?: LeftTimes): ArchivePlan {
  const urls = new Set<string>()
  const links: PlannedLink[] = []
  const tabIds: number[] = []
  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || !isIdle(tab, afterMs, now, seen)) continue
    tabIds.push(tab.id)
    const url = tab.url || tab.pendingUrl || ''
    if (urls.has(url)) continue
    urls.add(url)
    links.push({ title: (tab.title ?? '').trim() || url, url })
  }
  return { links, tabIds }
}

/** "Archived Nov 2" in the browser's locale: one stack a day, later runs add to it. */
export function archiveStackTitle(now = new Date()): string {
  return `Archived ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(now)}`
}

/** "3 idle tabs" for the toast. */
export function archivedNote(n: number): string {
  return plural(n, 'idle tab')
}
