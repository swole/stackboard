import { useMemo } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { searchTree } from '../lib/search'
import { useStackableStore } from '../store/useStackableStore'
import { BookmarkCard } from './BookmarkCard'

const MOD = /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** Replaces the space view while the sidebar search has text. Covers every space. */
export function SearchResults({ query }: { query: string }) {
  const tree = useStackableStore((s) => s.tree)
  const revealStack = useStackableStore((s) => s.revealStack)
  const unfoldFolders = useStackableStore((s) => s.unfoldFolders)
  const groups = useMemo(() => (tree ? searchTree(tree, query) : []), [tree, query])
  const total = groups.reduce((n, g) => n + g.hits.length, 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="on-wallpaper px-8 py-5 compact:px-6 compact:py-3.5">
        <div className="flex items-center gap-2.5">
          <Search className="h-5 w-5 text-accent" />
          <h1 className="truncate text-2xl font-bold text-strong">“{query.trim()}”</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          {total === 0
            ? 'No links match.'
            : `${total} link${total === 1 ? '' : 's'}. Enter opens the first, ${MOD}Enter opens it in a new tab, Esc clears.`}
        </p>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-8 pb-8 compact:px-6">
        {total === 0 ? (
          <p className="on-wallpaper max-w-md text-sm text-muted">
            Search looks at link titles, addresses, and stack, folder and space names.
          </p>
        ) : (
          groups.map((g, gi) => (
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
                {g.hits.map((b, i) => (
                  <BookmarkCard key={b.id} bookmark={b} sortable={false} top={gi === 0 && i === 0} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
