import { useMemo } from 'react'
import { ChevronRight, Globe, Search } from 'lucide-react'
import { isCloseMatch, searchTree } from '../lib/search'
import { WEB_SEARCH_COPY, webRowDisposition, webRowLabel, webSearchText } from '../lib/webSearch'
import { useStackableStore } from '../store/useStackableStore'
import { BookmarkCard } from './BookmarkCard'
import { onResultsKeyDown, runWebSearch } from './searchKeys'

const MOD = /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

/**
 * Replaces the space view while a search box has text. Covers every space, then the web (0.9.7).
 * The ↵ mark shows what Enter does: the highest-ranked close match (lib/search.ts enterHit), or, with
 * none, the web row. The arrow keys reach every row.
 */
export function SearchResults({ query }: { query: string }) {
  const tree = useStackableStore((s) => s.tree)
  const revealStack = useStackableStore((s) => s.revealStack)
  const unfoldFolders = useStackableStore((s) => s.unfoldFolders)
  const groups = useMemo(() => (tree ? searchTree(tree, query) : []), [tree, query])
  const total = groups.reduce((n, g) => n + g.hits.length, 0)
  // The same pick as enterHit, from the groups already here.
  const enterId = useMemo(() => {
    for (const g of groups) for (const b of g.hits) if (isCloseMatch(b, query)) return b.id
    return null
  }, [groups, query])
  const count = `${total} link${total === 1 ? '' : 's'}`

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="on-wallpaper px-8 py-5 compact:px-6 compact:py-3.5">
        <div className="flex items-center gap-2.5">
          <Search className="h-5 w-5 text-accent" />
          <h1 className="truncate text-2xl font-bold text-strong">“{query.trim()}”</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          {total === 0
            ? WEB_SEARCH_COPY.noMatch(MOD)
            : enterId
              ? WEB_SEARCH_COPY.linkHeader(count, MOD)
              : WEB_SEARCH_COPY.webHeader(count, MOD)}
        </p>
      </header>

      <div data-search-results onKeyDown={onResultsKeyDown} className="no-scrollbar flex-1 overflow-y-auto px-8 pb-8 compact:px-6">
        {groups.map((g) => (
          <section key={g.path.at(-1)?.id ?? g.stack.id} className="mb-6 max-w-4xl">
            {/* Space › Stack, then › each folder down to the links (0.8.0). A click opens those
                folders and shows the innermost one. */}
            <button
              onClick={() => {
                unfoldFolders(g.path.map((f) => f.id))
                revealStack(g.space.id, g.path.at(-1)?.id ?? g.stack.id)
              }}
              data-search-where
              className="on-wallpaper mb-2 flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs font-semibold text-muted hover:bg-card/60 hover:text-strong"
              title={g.path.length ? 'Show this folder' : 'Show this stack'}
            >
              <span className="text-sm leading-none">{g.space.emoji}</span>
              {g.space.name}
              {[g.stack.title, ...g.path.map((f) => f.title)].map((name, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1.5">
                  <ChevronRight className="h-3 w-3 shrink-0 text-ghost" />
                  <span className="truncate">{name}</span>
                </span>
              ))}
            </button>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1.5 compact:grid-cols-[repeat(auto-fill,minmax(212px,1fr))] compact:gap-1">
              {g.hits.map((b) => (
                <BookmarkCard key={b.id} bookmark={b} sortable={false} top={b.id === enterId} />
              ))}
            </div>
          </section>
        ))}

        <WebRow query={query} top={!enterId} />

        {total === 0 && (
          <p className="on-wallpaper mt-4 max-w-md text-sm text-muted">
            Search looks at link titles, addresses, and stack, folder and space names.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The last row (0.9.7): the words go to Chrome's default search engine. A click or Enter searches in
 * this tab, Ctrl/Cmd or a middle click in a new one. With no close match it's what Enter in the search
 * box runs, so it carries the ↵ mark.
 */
function WebRow({ query, top }: { query: string; top: boolean }) {
  const text = webSearchText(query)
  return (
    <div data-web-row className="max-w-4xl">
      <button
        type="button"
        data-web-search
        data-top={top ? '' : undefined}
        onClick={(e) => runWebSearch(text, webRowDisposition(e))}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault() // a middle click searches; it never starts autoscroll
        }}
        onAuxClick={(e) => {
          if (e.button !== 1) return
          e.preventDefault()
          runWebSearch(text, 'NEW_TAB')
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
          e.preventDefault()
          runWebSearch(text, 'NEW_TAB')
        }}
        className={`relative flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left text-sm text-fg hover:border-line-strong hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus wallpaper:bg-card/70 compact:py-2 ${
          top ? 'border-accent-line pr-10' : 'border-line'
        }`}
      >
        <Globe className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">{webRowLabel(query)}</span>
        <span className="ml-auto shrink-0 text-xs text-muted">{WEB_SEARCH_COPY.engine}</span>
        {top && (
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-sunken px-1 font-sans text-[10px] leading-4 text-faint"
          >
            ↵
          </kbd>
        )}
      </button>
    </div>
  )
}
