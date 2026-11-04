import { useEffect } from 'react'
import { useStackableStore } from '../store/useStackableStore'
import { buildIndex, sameIndex } from '../lib/openTabs'

/**
 * Mount once at the app root. Keeps store.openTabs in step with the browser's tabs.
 * A hidden new tab only notes that something changed and syncs when it is shown again:
 * with several Stackboard tabs open and a big board, syncing all of them on every page
 * load elsewhere froze Edge for seconds (backlog B4).
 */
export function useOpenTabs(): void {
  const setOpenTabs = useStackableStore((s) => s.setOpenTabs)

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return

    let cancelled = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = async () => {
      dirty = false
      const tabs = await chrome.tabs.query({})
      if (cancelled) return
      const next = buildIndex(tabs)
      if (!sameIndex(useStackableStore.getState().openTabs, next)) setOpenTabs(next)
    }
    const soon = () => {
      clearTimeout(timer)
      if (document.hidden) {
        dirty = true
        return
      }
      timer = setTimeout(sync, 250)
    }
    const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.url || change.status === 'complete') soon()
    }
    const onVisible = () => {
      if (!document.hidden && dirty) void sync()
    }

    void sync()
    chrome.tabs.onCreated.addListener(soon)
    chrome.tabs.onRemoved.addListener(soon)
    chrome.tabs.onReplaced.addListener(soon)
    chrome.tabs.onUpdated.addListener(onUpdated)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(timer)
      chrome.tabs.onCreated.removeListener(soon)
      chrome.tabs.onRemoved.removeListener(soon)
      chrome.tabs.onReplaced.removeListener(soon)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [setOpenTabs])
}
