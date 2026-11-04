import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { parseArchiveAfter } from './archivePlan'

// Auto-archive on this page (Pro, 0.7.0): the setting and the ask. The rules are in
// archivePlan.ts; the run itself happens in the service worker (stash.ts archiveIdleTabs).
// The setting syncs, so turning it on once covers every computer on the Chrome profile.

const KEY = 'proArchive' // sync: { afterMs }

interface ArchiveStore {
  ready: boolean
  /** ms a tab must sit unseen before it's archived; null when auto-archive is off */
  afterMs: number | null
  set: (afterMs: number | null) => Promise<void>
}

export const useArchive = create<ArchiveStore>((set) => ({
  ready: !IS_EXTENSION,
  afterMs: null,
  set: async (afterMs) => {
    set({ afterMs })
    if (!IS_EXTENSION) return
    if (afterMs) await chrome.storage.sync.set({ [KEY]: { afterMs } })
    else await chrome.storage.sync.remove(KEY)
  },
}))

let started = false

/** Call once per new tab. Resolves once the setting is known. */
export function initArchive(): Promise<void> {
  if (started || !IS_EXTENSION) return Promise.resolve()
  started = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) useArchive.setState({ afterMs: parseArchiveAfter(changes[KEY].newValue) })
  })
  return chrome.storage.sync
    .get(KEY)
    .then((got) => useArchive.setState({ ready: true, afterMs: parseArchiveAfter(got[KEY]) }))
    .catch(() => useArchive.setState({ ready: true }))
}

/** Asks the service worker to archive idle tabs; resolves with how many closed (0 when nothing ran). */
export async function askToArchive(afterMs: number): Promise<number> {
  if (!IS_EXTENSION) return 0
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'archive', afterMs })) as { archived?: number } | undefined
    return typeof r?.archived === 'number' ? r.archived : 0
  } catch {
    return 0 // the worker was busy starting up; the next new tab asks again
  }
}
