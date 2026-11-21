// Web search from the board (0.9.7). The top uninstall reason Stackboard can fix is "wanted my old new
// tab": a new tab with a search box. The cross-space search now ends its results with "Search the web
// for ...", which hands the words to Chrome's default search engine through chrome.search (the
// `search` permission, there since 0.8.0 for go links), so the engine is the one the person picked in
// Chrome. Enter runs it when no bookmark matches; with a match, Enter still opens the top hit (0.2.0).
// Everything here is pure apart from searchWeb(), so tests/unit.test.ts covers the keys.

/** Where the results open: this tab, or a new one (Ctrl/Cmd, or a middle click on the web row). */
export type WebDisposition = 'CURRENT_TAB' | 'NEW_TAB'

/** What the board says about web search. Kept here so the unit tests hold the copy to the house rules. */
export const WEB_SEARCH_COPY = {
  engine: 'with your default search engine',
  placeholder: 'Search your links or the web',
  setting: 'A bigger search box at the top of the board. When no link matches, Enter searches the web.',
  /** The results header when nothing on the board matches; `mod` is "Ctrl+" or "⌘". */
  noMatch: (mod: string) => `No links match. Enter searches the web, ${mod}Enter in a new tab, Esc clears.`,
  /** Links listed, one of them a close match (lib/search.ts isCloseMatch): Enter opens it. `count` is "3 links". */
  linkHeader: (count: string, mod: string) => `${count}. Enter opens the link marked ↵, ${mod}Enter opens it in a new tab, Esc clears.`,
  /** Links listed, none a close match: Enter searches the web. */
  webHeader: (count: string, mod: string) => `${count}. Enter searches the web, ${mod}Enter in a new tab, Esc clears.`,
} as const

/** The words as they go to the search engine: one line, trimmed. Empty means nothing to search. */
export function webSearchText(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

/** What the web row says. */
export function webRowLabel(query: string): string {
  return `Search the web for “${webSearchText(query)}”`
}

/** Outside the extension (vite preview) there is no chrome.search: a Google search, by address. */
export function fallbackSearchUrl(text: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(webSearchText(text))}`
}

export interface KeyMods {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export type SearchEnter =
  /** Open the top bookmark hit: here, or with Ctrl/Cmd in a background tab (Shift brings it to the front). */
  | { kind: 'link'; url: string; newTab: boolean; active: boolean }
  /** No bookmark matches: the words go to the web, with Ctrl/Cmd in a new tab. */
  | { kind: 'web'; text: string; disposition: WebDisposition }

/** What Enter does in a search box (the sidebar's, or the board's search bar). Null: nothing to do. */
export function searchEnter(hit: { url: string } | null, query: string, mods: KeyMods): SearchEnter | null {
  const mod = mods.ctrlKey || mods.metaKey
  if (hit) return { kind: 'link', url: hit.url, newTab: mod, active: mod && mods.shiftKey }
  const text = webSearchText(query)
  return text ? { kind: 'web', text, disposition: mod ? 'NEW_TAB' : 'CURRENT_TAB' } : null
}

/** The web row itself: a click or Enter searches here; Ctrl/Cmd or a middle click, in a new tab. */
export function webRowDisposition(e: { ctrlKey: boolean; metaKey: boolean; button?: number }): WebDisposition {
  return e.ctrlKey || e.metaKey || e.button === 1 ? 'NEW_TAB' : 'CURRENT_TAB'
}

/**
 * Hands the words to Chrome's default search engine (the `search` permission). chrome.search is
 * read at the time of the call, so the e2e suite can stand in for it.
 */
export async function searchWeb(query: string, disposition: WebDisposition): Promise<void> {
  const text = webSearchText(query)
  if (!text) return
  const api = typeof chrome !== 'undefined' ? chrome.search : undefined
  if (api?.query) {
    await api.query({ text, disposition })
    return
  }
  if (disposition === 'NEW_TAB') window.open(fallbackSearchUrl(text), '_blank', 'noopener')
  else window.open(fallbackSearchUrl(text), '_self')
}
