import { useEffect } from 'react'
import { useStackableStore } from '../store/useStackableStore'

const BURST_MS = 80

/**
 * Mount once at the app root. Loads the tree, then subscribes to bookmark events
 * and refreshes on any change.
 */
export function useBookmarkTree(): void {
  const refresh = useStackableStore((s) => s.refresh)

  useEffect(() => {
    refresh()

    if (typeof chrome === 'undefined' || !chrome.bookmarks) return

    // A single change (a drop, a rename) refreshes at once so the UI never lags. A burst
    // (undoing a 40-link stack, an import) collapses into one trailing refresh.
    let last = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const handler = () => {
      const now = Date.now()
      clearTimeout(timer)
      if (now - last > BURST_MS) {
        last = now
        refresh()
      } else {
        timer = setTimeout(() => {
          last = Date.now()
          refresh()
        }, BURST_MS)
      }
    }

    chrome.bookmarks.onCreated.addListener(handler)
    chrome.bookmarks.onRemoved.addListener(handler)
    chrome.bookmarks.onChanged.addListener(handler)
    chrome.bookmarks.onMoved.addListener(handler)
    chrome.bookmarks.onChildrenReordered.addListener(handler)

    return () => {
      clearTimeout(timer)
      chrome.bookmarks.onCreated.removeListener(handler)
      chrome.bookmarks.onRemoved.removeListener(handler)
      chrome.bookmarks.onChanged.removeListener(handler)
      chrome.bookmarks.onMoved.removeListener(handler)
      chrome.bookmarks.onChildrenReordered.removeListener(handler)
    }
  }, [refresh])
}
