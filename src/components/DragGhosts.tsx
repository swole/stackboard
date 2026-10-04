import type { Bookmark, Stack } from '../lib/types'
import { parseBookmarkTitle } from '../lib/icon'
import { displayTitle } from '../lib/title'
import { BookmarkIcon } from './BookmarkIcon'

// What follows the pointer during a drag. `data-lifted` gives the tilt and shadow; the drop
// animation in App.tsx flattens it again as it settles (see index.css).

export function BookmarkGhost({ bookmark }: { bookmark: Bookmark }) {
  const { emoji, text } = parseBookmarkTitle(bookmark.title)
  const shown = displayTitle(text, bookmark.url)
  return (
    <div
      data-lifted
      className="flex h-full w-full items-center gap-2 rounded-lg border border-peach-300 bg-white px-2.5 text-sm text-ink-700"
    >
      <BookmarkIcon emoji={emoji} title={shown} url={bookmark.url} />
      <span className="truncate">{shown}</span>
    </div>
  )
}

export function StackGhost({ stack }: { stack: Stack }) {
  const preview = stack.bookmarks.slice(0, 4)
  return (
    <div
      data-lifted
      className="flex w-[260px] items-center gap-2 rounded-xl border border-peach-300 bg-white px-3 py-2 text-sm"
    >
      <span className="flex-1 truncate font-semibold text-ink-700">{stack.title}</span>
      <span className="flex -space-x-1">
        {preview.map((b) => {
          const { emoji, text } = parseBookmarkTitle(b.title)
          return (
            <span key={b.id} className="rounded-[5px] bg-white ring-2 ring-white">
              <BookmarkIcon emoji={emoji} title={displayTitle(text, b.url)} url={b.url} />
            </span>
          )
        })}
      </span>
      <span className="rounded bg-ink-100 px-1.5 text-xs text-ink-600">{stack.bookmarks.length}</span>
    </div>
  )
}
