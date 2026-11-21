import type { KeyboardEvent } from 'react'
import { enterHit } from '../lib/search'
import { recordOpen } from '../lib/opens'
import { openHere, openInNewTab } from '../lib/tabs'
import { searchEnter, searchWeb, type WebDisposition } from '../lib/webSearch'
import { useStackableStore } from '../store/useStackableStore'

// One set of keys for both search boxes, the sidebar's and the board's search bar (0.9.7); they share
// the store's `search`, so they always show the same words and the same results.

/** Hands the words to the web (lib/webSearch.ts), and says so if Chrome refuses. */
export function runWebSearch(text: string, disposition: WebDisposition): void {
  void searchWeb(text, disposition).catch((err) => useStackableStore.getState().reportError('search the web', err))
}

/**
 * Esc clears; Enter opens the link marked ↵, the highest-ranked close match (Ctrl/Cmd+Enter in a
 * background tab, 0.2.0); with no close match Enter searches the web (Ctrl/Cmd+Enter in a new tab,
 * 0.9.7). The down arrow goes to the first result row.
 */
export function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
  const store = useStackableStore.getState()
  if (e.key === 'Escape') {
    store.setSearch('')
    e.currentTarget.blur()
    return
  }
  if (e.key === 'ArrowDown' && store.search.trim()) {
    const first = resultRows()[0]
    if (first) {
      e.preventDefault()
      first.focus()
    }
    return
  }
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  const action = searchEnter(enterHit(store.tree, store.search), store.search, e)
  if (!action) return
  e.preventDefault()
  if (action.kind === 'link') {
    recordOpen(action.url)
    if (action.newTab) void openInNewTab(action.url, action.active)
    else void openHere(action.url, store.openTabs)
    return
  }
  runWebSearch(action.text, action.disposition)
}

/** "/" (and Ctrl/Cmd+K without Pro) goes to the board's search bar while it shows. False when it doesn't. */
export function focusBoardSearch(): boolean {
  const el = document.querySelector<HTMLInputElement>('[data-board-search-input]')
  if (!el) return false
  el.focus()
  el.select()
  return true
}

/** Every result row in order: the listed links, then the web row (0.9.7). */
export function resultRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-search-results] section a[href], [data-search-results] [data-web-search]')]
}

/**
 * Arrow keys among the result rows (0.9.7): down and up move from row to row, up from the first row
 * goes back to the search box, Esc clears the search. Enter on a row opens it (a link opens as a
 * link does; the web row searches).
 */
export function onResultsKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (e.key === 'Escape') {
    useStackableStore.getState().setSearch('')
    return
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const rows = resultRows()
  const at = rows.indexOf(e.target as HTMLElement)
  if (at < 0) return
  e.preventDefault()
  if (e.key === 'ArrowDown') rows[Math.min(at + 1, rows.length - 1)]?.focus()
  else if (at > 0) rows[at - 1]?.focus()
  else (document.querySelector<HTMLInputElement>('[data-board-search-input]') ?? document.querySelector<HTMLInputElement>('input[aria-label="Search all spaces"]'))?.focus()
}
