// Per-device UI memory. localStorage is synchronous, so the first paint already shows the
// right space with no flicker. Bookmark ids are per-device too, so nothing here should sync.

const LAST_SPACE = 'stackable:lastSpaceId'
const SIDEBAR_COLLAPSED = 'stackable:sidebarCollapsed'
const OPENS = 'stackable:opens'
const FIRST_SEEN = 'stackable:firstSeen'
const RATING = 'stackable:rating'
const KEEP_HINT_SHOWN = 'stackable:keepHintShown'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked: the app still works, it just forgets
  }
}

export const prefs = {
  lastSpaceId: () => read(LAST_SPACE),
  setLastSpaceId: (id: string | null) => write(LAST_SPACE, id),
  sidebarCollapsed: () => read(SIDEBAR_COLLAPSED) === '1',
  setSidebarCollapsed: (collapsed: boolean) => write(SIDEBAR_COLLAPSED, collapsed ? '1' : null),

  /** Counts this new tab (call once per page load). Nothing here leaves the device. */
  countOpen: (now = Date.now()): { opens: number; firstSeen: number } => {
    const opens = (Number(read(OPENS)) || 0) + 1
    write(OPENS, String(opens))
    let firstSeen = Number(read(FIRST_SEEN)) || 0
    if (!firstSeen) {
      firstSeen = now
      write(FIRST_SEEN, String(now))
    }
    return { opens, firstSeen }
  },
  /** 'rated' or 'dismissed' once the one-time rating ask has been answered. */
  rating: () => read(RATING),
  setRating: (answer: 'rated' | 'dismissed') => write(RATING, answer),
  /** How many new tabs have shown the "Keep it" hint, including this one. */
  bumpKeepHint: (): number => {
    const n = (Number(read(KEEP_HINT_SHOWN)) || 0) + 1
    write(KEEP_HINT_SHOWN, String(n))
    return n
  },
}
