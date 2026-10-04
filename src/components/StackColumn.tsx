import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, FolderInput, GripVertical, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Stack } from '../lib/types'
import { useStackableStore } from '../store/useStackableStore'
import { openAllInTabs } from '../lib/tabs'
import { glow, reducedMotion } from '../lib/motion'
import { useTwoStep } from '../hooks/useTwoStep'
import { BookmarkCard } from './BookmarkCard'

interface Props {
  stack: Stack
}

export function StackColumn({ stack }: Props) {
  const openModal = useStackableStore((s) => s.openModal)
  const removeWithUndo = useStackableStore((s) => s.removeWithUndo)
  const flashSeq = useStackableStore((s) => (s.flash?.id === stack.id ? s.flash.seq : 0))
  const revealSeq = useStackableStore((s) => (s.reveal?.id === stack.id ? s.reveal.seq : 0))
  const [menuOpen, setMenuOpen] = useState(false)
  const openAll = useTwoStep()
  const columnRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const count = stack.bookmarks.length

  const { attributes, listeners, setNodeRef: setSortNode, transform, transition, isDragging } =
    useSortable({
      id: `st:${stack.id}`,
      data: { type: 'stack', stack },
    })

  const { setNodeRef: setDropNode, isOver } = useDroppable({
    id: `stack-drop:${stack.id}`,
    data: { type: 'stack-drop', stackId: stack.id },
  })

  useEffect(() => {
    if (flashSeq) glow(listRef.current, 120)
  }, [flashSeq])

  // Sidebar jump, search-result header, or undo: bring the stack into view, then glow it.
  useEffect(() => {
    if (!revealSeq) return
    columnRef.current?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
    glow(listRef.current, 280)
  }, [revealSeq])

  const onOpenAll = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (count === 0) return
    if (count > 15 && !openAll.armed) {
      openAll.arm()
      return
    }
    openAll.disarm()
    await openAllInTabs(stack.bookmarks, stack.title)
  }

  return (
    <div
      ref={(el) => {
        columnRef.current = el
        setSortNode(el)
      }}
      // Opacity as a class, never inline: the drop animation hides the original through
      // inline style, and a re-render mustn't overwrite that mid-drop.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group/stack flex w-[260px] shrink-0 flex-col ${isDragging ? 'opacity-30' : ''}`}
      id={`stack-${stack.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="mb-3 flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
        aria-label="Drag stack header"
      >
        <GripVertical className="h-4 w-4 text-ink-300" />
        <h3
          onDoubleClick={(e) => {
            e.stopPropagation()
            openModal({ kind: 'stack-edit', id: stack.id, title: stack.title })
          }}
          className="flex-1 truncate text-sm font-semibold text-ink-700 cursor-text select-none"
          title="Double-click to rename"
        >
          {stack.title}
        </h3>
        <button
          onClick={onOpenAll}
          disabled={count === 0}
          className={`flex items-center gap-1 rounded p-0.5 disabled:opacity-30 ${
            openAll.armed
              ? 'bg-peach-500 px-1.5 text-white hover:bg-peach-600'
              : 'text-ink-400 opacity-0 hover:bg-white/60 hover:text-ink-700 focus-visible:opacity-100 group-hover/stack:opacity-100'
          }`}
          aria-label={`Open all ${count} bookmark${count === 1 ? '' : 's'} as tabs`}
          title={openAll.armed ? 'Click again to open them all' : `Open all ${count} bookmarks as tabs`}
        >
          <ExternalLink className="h-4 w-4" />
          {openAll.armed && <span className="text-xs font-medium">Open {count}?</span>}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-0.5 text-ink-400 hover:bg-white/60 hover:text-ink-700"
            aria-label="Stack options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-30 w-32 overflow-hidden rounded-md border border-ink-100 bg-white shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                onClick={() => {
                  setMenuOpen(false)
                  openModal({ kind: 'stack-edit', id: stack.id, title: stack.title })
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-cream-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  openModal({
                    kind: 'stack-move',
                    id: stack.id,
                    title: stack.title,
                    currentSpaceId: stack.parentSpaceId,
                  })
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-cream-50"
              >
                <FolderInput className="h-3.5 w-3.5" />
                Move to…
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void removeWithUndo(
                    'stack',
                    stack.id,
                    stack.title,
                    `${count} link${count === 1 ? '' : 's'}`,
                  )
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-peach-700 hover:bg-peach-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={(el) => {
          listRef.current = el
          setDropNode(el)
        }}
        className={`flex flex-col gap-1 rounded-xl border p-1.5 transition-colors ${
          isOver ? 'border-peach-300 bg-peach-50/50' : 'border-transparent bg-white/40'
        }`}
      >
        <SortableContext
          items={stack.bookmarks.map((b) => `bm:${b.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {stack.bookmarks.map((b) => (
            <BookmarkCard key={b.id} bookmark={b} />
          ))}
        </SortableContext>

        <button
          onClick={() => openModal({ kind: 'bookmark-add', stackId: stack.id })}
          className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-ink-200 px-2.5 py-2 text-xs text-ink-400 hover:border-peach-300 hover:bg-peach-50/60 hover:text-peach-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Add bookmark
        </button>
      </div>
    </div>
  )
}
