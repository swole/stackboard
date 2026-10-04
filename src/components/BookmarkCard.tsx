import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import type { Bookmark } from '../lib/types'
import { parseBookmarkTitle } from '../lib/icon'
import { displayTitle, splitTitle } from '../lib/title'
import { findOpenTab } from '../lib/openTabs'
import { openHere } from '../lib/tabs'
import { glow } from '../lib/motion'
import { useStackableStore } from '../store/useStackableStore'
import { BookmarkIcon } from './BookmarkIcon'

const DAY = 24 * 60 * 60 * 1000
const JUST_SAVED = 2 * 60 * 1000

interface Props {
  bookmark: Bookmark
  /** Off in search results, where the card is only a launcher. */
  sortable?: boolean
  /** Marks the search result that Enter opens. */
  top?: boolean
}

export function BookmarkCard({ bookmark, sortable = true, top = false }: Props) {
  const openModal = useStackableStore((s) => s.openModal)
  const removeWithUndo = useStackableStore((s) => s.removeWithUndo)
  const isOpen = useStackableStore((s) => findOpenTab(s.openTabs, bookmark.url) !== null)
  const flashSeq = useStackableStore((s) => (s.flash?.id === bookmark.id ? s.flash.seq : 0))
  const [menuOpen, setMenuOpen] = useState(false)
  const nodeRef = useRef<HTMLDivElement | null>(null)

  // `attributes` (role="button", tabIndex=0) are deliberately not spread: the <a> below is
  // the focusable element, and only the pointer sensor drives dragging.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `bm:${bookmark.id}`,
    data: { type: 'bookmark', bookmark },
    disabled: !sortable,
  })

  const { emoji, text } = parseBookmarkTitle(bookmark.title)
  const shown = displayTitle(text, bookmark.url)
  const [head, tail] = splitTitle(shown)
  const age = bookmark.dateAdded ? Date.now() - bookmark.dateAdded : Infinity
  const isNew = age < DAY && !bookmark.batch

  // Glow after a drop or an undo, and once when a fresh save first shows up.
  useEffect(() => {
    if (flashSeq) glow(nodeRef.current, 120)
  }, [flashSeq])
  useEffect(() => {
    if (age < JUST_SAVED && !bookmark.batch) glow(nodeRef.current, 200)
  }, []) // on mount only

  // Already open somewhere: a plain click switches to that tab. Modified clicks mean
  // "open another copy", so the browser keeps them.
  const onLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isOpen || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void openHere(bookmark.url, useStackableStore.getState().openTabs)
  }

  const onEdit = () => {
    setMenuOpen(false)
    openModal({
      kind: 'bookmark-edit',
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      stackId: bookmark.parentStackId,
    })
  }

  const onDelete = () => {
    setMenuOpen(false)
    void removeWithUndo('bookmark', bookmark.id, shown)
  }

  const tooltip = [
    bookmark.title,
    bookmark.url,
    isOpen ? 'Already open in a tab. Click to switch to it.' : null,
    isNew ? 'Added in the last day.' : null,
  ]
    .filter(Boolean)
    .join('\n')

  const grab = sortable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'

  return (
    <div
      ref={(el) => {
        nodeRef.current = el
        setNodeRef(el)
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(sortable ? listeners : {})}
      className={`group/card relative rounded-lg border text-sm text-ink-700 ${grab} ${
        isDragging
          ? 'border-dashed border-peach-300 bg-peach-100/40' // the slot the card will drop into
          : `bg-white hover:border-ink-100 hover:bg-cream-50 ${top ? 'border-peach-300' : 'border-transparent'}`
      }`}
    >
      {isNew && !isDragging && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-peach-400"
        />
      )}
      {/* A real link, so the browser owns every open gesture: click (this tab), Ctrl/Cmd+click
          (background tab), Ctrl+Shift+click, middle-click, Shift+click (new window), the
          right-click link menu, Enter from the keyboard. draggable={false} keeps the native
          link drag from competing with dnd-kit. The kebab sits outside the link so opening
          the menu never navigates. */}
      <a
        href={bookmark.url}
        draggable={false}
        title={tooltip}
        onClick={onLinkClick}
        className={`flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-9.5 ${grab} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peach-300 ${
          isDragging ? 'invisible' : ''
        }`}
      >
        <span className="relative shrink-0">
          <BookmarkIcon emoji={emoji} title={shown} url={bookmark.url} />
          {isOpen && (
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-peach-500 ring-2 ring-white"
            />
          )}
        </span>
        {/* Middle truncation: the start gets the ellipsis, the last word or two stay. */}
        <span className="flex min-w-0">
          <span className="truncate">{head}</span>
          {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
        </span>
        {isOpen && <span className="sr-only"> (open in a tab)</span>}
      </a>
      {top && !isDragging && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-ink-100 bg-cream-50 px-1 font-sans text-[10px] leading-4 text-ink-400 group-hover/card:opacity-0"
        >
          ↵
        </kbd>
      )}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 opacity-0 hover:bg-ink-100 hover:text-ink-700 focus-visible:opacity-100 group-hover/card:opacity-100 ${
          isDragging ? 'invisible' : ''
        }`}
        aria-label="Bookmark options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div
          className="absolute right-1 top-9 z-30 w-32 overflow-hidden rounded-md border border-ink-100 bg-white shadow-md"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            onClick={onEdit}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-cream-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-peach-700 hover:bg-peach-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
