import type { Bookmark } from './types'
import { findOpenTab, switchToTab, type OpenTabIndex } from './openTabs'

/** Open a URL in a new tab next to this one, the way Ctrl+click on a link does. */
export async function openInNewTab(url: string, active = false): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.create) {
    window.open(url, '_blank', 'noopener')
    return
  }
  const current = await chrome.tabs.getCurrent()
  await chrome.tabs.create({
    url,
    active,
    index: current ? current.index + 1 : undefined,
    openerTabId: current?.id,
  })
}

/** Plain-click semantics: switch to the tab already showing it, else open it here. */
export async function openHere(url: string, openTabs: OpenTabIndex | null): Promise<void> {
  const tab = findOpenTab(openTabs, url)
  if (tab) {
    try {
      await switchToTab(tab)
      return
    } catch {
      // the tab closed in the meantime: fall through and open it here
    }
  }
  window.location.href = url
}

/**
 * Open every bookmark in the list as a new tab.
 * If the tabGroups permission is granted, group them under a single tab group titled `groupTitle`.
 */
export async function openAllInTabs(bookmarks: Bookmark[], groupTitle?: string): Promise<void> {
  if (bookmarks.length === 0) return

  const created: chrome.tabs.Tab[] = []
  for (const bm of bookmarks) {
    const t = await chrome.tabs.create({ url: bm.url, active: false })
    created.push(t)
  }

  // Group them if possible.
  if (chrome.tabs.group && groupTitle) {
    try {
      const tabIds = created.map((t) => t.id).filter((id): id is number => typeof id === 'number')
      if (tabIds.length > 0) {
        const groupId = await chrome.tabs.group({ tabIds })
        if (chrome.tabGroups?.update) {
          await chrome.tabGroups.update(groupId, { title: groupTitle, collapsed: false })
        }
      }
    } catch (err) {
      console.warn('Tab grouping failed:', err)
    }
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function pickJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('No file selected'))
        return
      }
      try {
        const text = await file.text()
        resolve(JSON.parse(text))
      } catch (err) {
        reject(err)
      }
    }
    input.click()
  })
}
