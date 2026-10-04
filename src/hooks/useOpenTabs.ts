import { useEffect } from 'react'
import { useStackableStore } from '../store/useStackableStore'
import { buildIndex } from '../lib/openTabs'

/** Mount once at the app root. Keeps store.openTabs in step with the browser's tabs. */
export function useOpenTabs(): void {
  const setOpenTabs = useStackableStore((s) => s.setOpenTabs)

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = async () => {
      const tabs = await chrome.tabs.query({})
      if (!cancelled) setOpenTabs(buildIndex(tabs))
    }
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(sync, 150)
    }
    const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.url || change.status === 'complete') soon()
    }

    void sync()
    chrome.tabs.onCreated.addListener(soon)
    chrome.tabs.onRemoved.addListener(soon)
    chrome.tabs.onReplaced.addListener(soon)
    chrome.tabs.onUpdated.addListener(onUpdated)

    return () => {
      cancelled = true
      clearTimeout(timer)
      chrome.tabs.onCreated.removeListener(soon)
      chrome.tabs.onRemoved.removeListener(soon)
      chrome.tabs.onReplaced.removeListener(soon)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [setOpenTabs])
}
