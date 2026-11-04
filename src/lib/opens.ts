import { normalizeUrl } from './cleanupPlan'

// When each link was last opened from the board (0.7.1), for the clean-up's "Unused" list.
// Chrome's own dateLastUsed only counts opens from its bookmark menus, never a click on a page,
// so Stackboard keeps its own record from this version on. One chrome.storage.local key per link
// ("open:<normalised link>" -> ms), so a click costs one write and needs no read first: a plain
// click leaves the page straight away. Nothing here leaves the device.

const PREFIX = 'open:'
/** When this computer started counting opens (the first 0.7.1 page that recorded or read). */
const SINCE = 'opensSince'
/** At most this many links are remembered; the oldest go first. */
export const OPENS_CAP = 5000
/** localStorage: writes since the last prune. */
const WRITES = 'stackable:openWrites'

const HAS_STORAGE = typeof chrome !== 'undefined' && !!chrome.storage?.local
let sinceChecked = false

function bumpWrites(): number {
  try {
    const n = (Number(localStorage.getItem(WRITES)) || 0) + 1
    localStorage.setItem(WRITES, String(n))
    return n
  } catch {
    return 0
  }
}

/** Notes that these links were opened just now. Safe to call right before the page navigates. */
export function recordOpens(urls: string[], now = Date.now()): void {
  if (!HAS_STORAGE || !urls.length) return
  const entries: Record<string, number> = {}
  for (const u of urls) if (u) entries[PREFIX + normalizeUrl(u)] = now
  chrome.storage.local.set(entries).catch(() => {})
  if (!sinceChecked) {
    sinceChecked = true
    void markSince(now).catch(() => {})
  }
  if (bumpWrites() % 500 === 0) void prune().catch(() => {})
}

export function recordOpen(url: string): void {
  recordOpens([url])
}

async function markSince(now: number): Promise<number> {
  const got = (await chrome.storage.local.get(SINCE))[SINCE]
  if (typeof got === 'number' && got > 0) return got
  await chrome.storage.local.set({ [SINCE]: now })
  return now
}

/** Keeps the newest OPENS_CAP records. */
async function prune(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const opens = Object.entries(all).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === 'number') as [string, number][]
  if (opens.length <= OPENS_CAP) return
  opens.sort((a, b) => b[1] - a[1])
  await chrome.storage.local.remove(opens.slice(OPENS_CAP).map(([k]) => k))
  try {
    localStorage.setItem(WRITES, '0')
  } catch {
    // storage blocked: the next write tries again
  }
}

/** Every recorded open (normalised link -> ms) and the day counting started. */
export async function loadOpens(now = Date.now()): Promise<{ opens: Map<string, number>; since: number }> {
  if (!HAS_STORAGE) return { opens: new Map(), since: now }
  await prune().catch(() => {})
  const all = await chrome.storage.local.get(null)
  const opens = new Map<string, number>()
  for (const [k, v] of Object.entries(all)) if (k.startsWith(PREFIX) && typeof v === 'number') opens.set(k.slice(PREFIX.length), v)
  const since = typeof all[SINCE] === 'number' && all[SINCE] > 0 ? (all[SINCE] as number) : await markSince(now)
  return { opens, since }
}
