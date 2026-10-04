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
  const groups = useMemo(() => (tree ? searchTree(tree, query) : []), [tree, query])
  const total = groups.reduce((n, g) => n + g.hits.length, 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="px-8 py-5">
        <div className="flex items-center gap-2.5">
          <Search className="h-5 w-5 text-peach-500" />
          <h1 className="truncate text-2xl font-bold text-ink-800">“{query.trim()}”</h1>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          {total === 0
            ? 'No links match.'
            : `${total} link${total === 1 ? '' : 's'}. Enter opens the first, ${MOD}Enter opens it in a new tab, Esc clears.`}
        </p>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-8 pb-8">
        {total === 0 ? (
          <p className="max-w-md text-sm text-ink-400">
            Search looks at link titles, addresses, and stack and space names.
          </p>
        ) : (
          groups.map((g, gi) => (
            <section key={g.stack.id} className="mb-6 max-w-4xl">
              <button
                onClick={() => revealStack(g.space.id, g.stack.id)}
                className="mb-2 flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-semibold text-ink-500 hover:bg-white/60 hover:text-ink-800"
                title="Show this stack"
              >
                <span className="text-sm leading-none">{g.space.emoji}</span>
                {g.space.name}
                <ChevronRight className="h-3 w-3 text-ink-300" />
                {g.stack.title}
              </button>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1.5">
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
