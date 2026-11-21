import { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { useAppearance } from '../store/useAppearance'
import { onSearchKeyDown } from './searchKeys'
import { WEB_SEARCH_COPY } from '../lib/webSearch'

/**
 * The search bar on the board (0.9.7), for people who want their old new tab back: a bigger box at the
 * top. It's the sidebar's search in a second place, with the same words (the store's `search`), the
 * same results and keys, and the web as the last row. Settings > Appearance > Search bar switches it;
 * it's on for new installs and off for boards from before 0.9.7 (lib/appearance.ts, background.ts).
 */
export function BoardSearch() {
  const on = useAppearance((s) => s.appearance.searchBar)
  const search = useStackableStore((s) => s.search)
  const setSearch = useStackableStore((s) => s.setSearch)
  const ref = useRef<HTMLInputElement | null>(null)
  if (!on) return null

  return (
    <div data-board-search className="px-8 pt-5 compact:px-6 compact:pt-3.5">
      <div className="relative mx-auto max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          ref={ref}
          data-board-search-input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={WEB_SEARCH_COPY.placeholder}
          aria-label={WEB_SEARCH_COPY.placeholder}
          autoComplete="off"
          spellCheck={false}
          className="peer h-11 w-full rounded-xl border border-line bg-card pl-11 pr-11 text-[15px] text-fg shadow-xs placeholder:text-faint focus:border-focus focus:outline-none wallpaper:bg-card/85 wallpaper:backdrop-blur-xl compact:h-10 compact:text-sm"
        />
        {search ? (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              ref.current?.focus()
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:bg-selected hover:text-fg"
            aria-label="Clear the search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded border border-line bg-sunken px-1.5 font-sans text-[11px] leading-5 text-faint peer-focus:hidden">
            /
          </kbd>
        )}
      </div>
    </div>
  )
}
