// Which bookmarks are already open in a tab, so a click can switch to it instead of loading
// a duplicate. Uses the "tabs" permission the extension already has.

export interface OpenTab {
  id: number
  windowId: number
  lastAccessed: number
}

export interface OpenTabIndex {
  /** Normalised URL → most recently used tab showing it. */
  exact: Map<string, OpenTab>
  /** Host → most recently used tab on that host. Only consulted for root bookmarks. */
  byHost: Map<string, OpenTab>
}

// Parameters that change without changing the page: trackers, Figma's share token.
const NOISE_PARAMS = /^(utm_\w+|fbclid|gclid|mc_eid|t)$/i

// Apps whose path alone names the document; the query is view state (Figma's node-id,
// Google Docs' tab, Jira's focused comment). Never add a site whose query names the page
// (SharePoint's sourcedoc, YouTube's v).
const PATH_NAMES_THE_PAGE = /(^|\.)(figma\.com|docs\.google\.com|atlassian\.net|notion\.so|github\.com|miro\.com)$/

interface UrlKey {
  key: string
  host: string
  /** Bookmark points at a site's front door ("https://app.slack.com/"). */
  isRoot: boolean
}

export function urlKey(raw: string): UrlKey | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.host.toLowerCase().replace(/^www\./, '')
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !NOISE_PARAMS.test(k) && !PATH_NAMES_THE_PAGE.test(host))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''
  const path = u.pathname.replace(/\/+$/, '')
  return { key: host + path + query, host, isRoot: path === '' && query === '' }
}

export function buildIndex(tabs: chrome.tabs.Tab[]): OpenTabIndex {
  const exact = new Map<string, OpenTab>()
  const byHost = new Map<string, OpenTab>()
  for (const t of tabs) {
    const url = t.url || t.pendingUrl
    if (t.id == null || !url) continue
    const k = urlKey(url)
    if (!k) continue
    const tab: OpenTab = { id: t.id, windowId: t.windowId, lastAccessed: t.lastAccessed ?? 0 }
    const e = exact.get(k.key)
    if (!e || tab.lastAccessed > e.lastAccessed) exact.set(k.key, tab)
    const h = byHost.get(k.host)
    if (!h || tab.lastAccessed > h.lastAccessed) byHost.set(k.host, tab)
  }
  return { exact, byHost }
}

/**
 * The tab already showing this bookmark, if any. Deep links need an exact match (a
 * SharePoint doc must never switch you to a different doc); a root bookmark like
 * "Slack" matches any tab on that site.
 */
export function findOpenTab(index: OpenTabIndex | null, url: string): OpenTab | null {
  if (!index) return null
  const k = urlKey(url)
  if (!k) return null
  return index.exact.get(k.key) ?? (k.isRoot ? (index.byHost.get(k.host) ?? null) : null)
}

/** Focus the tab, then close this new-tab page if it was only opened to get there. */
export async function switchToTab(tab: OpenTab): Promise<void> {
  await chrome.tabs.update(tab.id, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
  if (history.length <= 1) {
    const current = await chrome.tabs.getCurrent()
    if (current?.id != null && current.id !== tab.id) await chrome.tabs.remove(current.id)
  }
}
