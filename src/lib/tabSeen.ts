// When each tab was last on screen, for auto-archive (0.7.0 fix, 3 Nov 2026).
// Chrome's tab.lastAccessed moves only when a tab comes on screen, never when it leaves, so a tab
// that stayed on screen all day looked idle for hours the moment someone opened a new tab. The
// service worker records when each tab was left (tabs.onActivated) in chrome.storage.session,
// which outlives worker restarts and is cleared when the browser or the extension restarts.
// `since` is when this record began: a tab with no record may have been on screen until then.
//
// 0.8.0: the record is kept only while auto-archive is on (sync `proArchive`), so tab switches
// cost nothing for everyone else. Turning auto-archive on starts a fresh record (since = now), so
// nothing is archived until the chosen time has passed; turning it off drops the record.

import { parseArchiveAfter } from './archivePlan'

export interface TabSeen {
  /** when this record began, ms */
  since: number
  /** the tab on screen in each window */
  active: Record<string, number>
  /** when each tab was last left, ms */
  left: Record<string, number>
}

const KEY = 'tabSeen'
/** Keep in sync with KEY in src/lib/autoArchive.ts. */
const ARCHIVE_KEY = 'proArchive'
/** Tabs remembered at most; the oldest records go first. */
const MAX_LEFT = 2000

/** Whether tab switches are recorded: only while auto-archive is switched on. Pure, for tests. */
export function tracksTabs(archiveSetting: unknown): boolean {
  return parseArchiveAfter(archiveSetting) !== null
}

let queue: Promise<unknown> = Promise.resolve()

/** One read-modify-write at a time: tab events can arrive faster than storage answers. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

/** Auto-archive on or off, as this worker last read it; `known` resolves after the first read. */
let tracking = false
let known: Promise<void> | null = null

async function read(): Promise<TabSeen | null> {
  const got = (await chrome.storage.session.get(KEY))[KEY] as TabSeen | undefined
  return got && typeof got.since === 'number' ? got : null
}

async function readOrStart(now: number): Promise<TabSeen> {
  const got = await read()
  if (got) return got
  // A fresh record: note the tab on screen in every window, so leaving it can be timed.
  const active: Record<string, number> = {}
  for (const t of await chrome.tabs.query({ active: true })) {
    if (typeof t.id === 'number' && typeof t.windowId === 'number') active[t.windowId] = t.id
  }
  return { since: now, active, left: {} }
}

function trim(left: Record<string, number>): Record<string, number> {
  const entries = Object.entries(left)
  if (entries.length <= MAX_LEFT) return left
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_LEFT))
}

/** Starts the record if there is none, or drops it when auto-archive is off. */
function settle(on: boolean, now: number): Promise<void> {
  return serial(async () => {
    if (!on) {
      await chrome.storage.session.remove(KEY)
      return
    }
    if (await read()) return
    await chrome.storage.session.set({ [KEY]: await readOrStart(now) })
  })
}

/**
 * Call on every worker start, at the top level: reads whether auto-archive is on, starts or drops
 * the record to match, and follows the setting from then on.
 */
export function startTabSeen(): Promise<void> {
  if (known) return known
  known = chrome.storage.sync
    .get(ARCHIVE_KEY)
    .then((got) => {
      tracking = tracksTabs(got[ARCHIVE_KEY])
      return settle(tracking, Date.now())
    })
    .catch(() => {})
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(ARCHIVE_KEY in changes)) return
    const on = tracksTabs(changes[ARCHIVE_KEY].newValue)
    const was = tracksTabs(changes[ARCHIVE_KEY].oldValue)
    tracking = on
    // Switched on: a fresh record from now. Switched off: drop it. A new time: keep the record.
    if (on && !was) void serial(() => chrome.storage.session.remove(KEY)).then(() => settle(true, Date.now())).catch(() => {})
    else if (!on) void settle(false, Date.now()).catch(() => {})
  })
  return known
}

/** A tab came on screen in a window: the one that was there is left now. */
export async function noteActivated(tabId: number, windowId: number, now = Date.now()): Promise<void> {
  await (known ?? startTabSeen())
  if (!tracking) return
  return serial(async () => {
    const s = await readOrStart(now)
    const prev = s.active[windowId]
    if (typeof prev === 'number' && prev !== tabId) s.left[prev] = now
    s.active[windowId] = tabId
    s.left = trim(s.left)
    await chrome.storage.session.set({ [KEY]: s })
  })
}

/** A tab closed: forget it. */
export async function forgetTab(tabId: number): Promise<void> {
  await (known ?? startTabSeen())
  if (!tracking) return
  return serial(async () => {
    const s = await read()
    if (!s || !(tabId in s.left)) return
    delete s.left[tabId]
    await chrome.storage.session.set({ [KEY]: s })
  })
}

/**
 * What auto-archive needs: when the record began and when each tab was left. With no record yet
 * (auto-archive just switched on, or the browser just started) one starts now, so nothing counts
 * as idle until the chosen time has passed.
 */
export function tabSeen(now = Date.now()): Promise<Pick<TabSeen, 'since' | 'left'>> {
  return serial(async () => {
    let s = await read()
    if (!s) {
      s = await readOrStart(now)
      await chrome.storage.session.set({ [KEY]: s })
    }
    return { since: s.since, left: s.left }
  })
}
