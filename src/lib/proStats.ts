import { STATS_KEY, addStat, readStats, type ProStats, type StatKey } from './statsPlan'

// What Pro did on this computer (0.9.0): chrome.storage.local `proStats`, bumped where Pro does the
// work (auto-archive in the service worker, the daily snapshot, to-dos checked off, clean-up, AI
// tidy) and read by the trial-end recap. Nothing here leaves the device. A count lost in a race or
// a storage error only makes the recap a little low, so failures stay quiet.

function storage(): typeof chrome.storage.local | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
}

export async function bumpStat(key: StatKey, n = 1): Promise<void> {
  const local = storage()
  if (!local || !(n > 0)) return
  const run = async () => {
    const got = await local.get(STATS_KEY)
    await local.set({ [STATS_KEY]: addStat(readStats(got[STATS_KEY]), key, n) })
  }
  try {
    // Tabs and the service worker can count at the same moment: one read-and-write at a time. A tab
    // Chrome froze in the background can hold the lock for good (the 0.5.2 root-lock bug), so wait
    // at most 2 s and count without it.
    if (typeof navigator !== 'undefined' && navigator.locks) {
      try {
        await navigator.locks.request('stackboard-stats', { signal: AbortSignal.timeout(2000) }, run)
      } catch (err) {
        if ((err as DOMException | null)?.name !== 'TimeoutError' && (err as DOMException | null)?.name !== 'AbortError') throw err
        await run()
      }
    } else await run()
  } catch {
    // the recap shows a little less; nothing else depends on it
  }
}

export async function loadStats(): Promise<ProStats> {
  const local = storage()
  if (!local) return readStats(null)
  try {
    return readStats((await local.get(STATS_KEY))[STATS_KEY])
  } catch {
    return readStats(null)
  }
}
