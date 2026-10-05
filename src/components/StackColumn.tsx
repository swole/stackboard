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
      inline: 'nearest',
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
      // Over a wallpaper each stack becomes a frosted tile, header included, so it reads on any photo.
      className={`group/stack flex min-w-0 flex-col wallpaper:rounded-2xl wallpaper:bg-panel/55 wallpaper:p-2 wallpaper:ring-1 wallpaper:ring-line/50 wallpaper:backdrop-blur-xl ${
        isDragging ? 'opacity-30' : ''
      }`}
      id={`stack-${stack.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="mb-3 flex items-center gap-1.5 cursor-grab active:cursor-grabbing compact:mb-2 wallpaper:mb-2 wallpaper:px-1"
        aria-label="Drag stack header"
      >
        <GripVertical className="h-4 w-4 shrink-0 text-ghost opacity-0 transition-opacity group-hover/stack:opacity-100" />
        <h3
          onDoubleClick={(e) => {
            e.stopPropagation()
            openModal({ kind: 'stack-edit', id: stack.id, title: stack.title })
          }}
          className="flex-1 truncate text-sm font-semibold text-fg cursor-text select-none"
          title="Double-click to rename"
        >
          {stack.title}
        </h3>
        <button
          onClick={onOpenAll}
          disabled={count === 0}
          className={`flex items-center gap-1 rounded p-0.5 disabled:opacity-30 ${
            openAll.armed
              ? 'bg-accent px-1.5 text-on-accent hover:bg-accent-hover'
              : 'text-faint opacity-0 hover:bg-card/60 hover:text-fg focus-visible:opacity-100 group-hover/stack:opacity-100'
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
            className={`rounded p-0.5 text-faint hover:bg-card/60 hover:text-fg focus-visible:opacity-100 group-hover/stack:opacity-100 ${
              menuOpen ? 'opacity-100' : 'opacity-0'
            }`}
            aria-label="Stack options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-30 w-32 overflow-hidden rounded-md border border-line bg-raised shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                onClick={() => {
                  setMenuOpen(false)
                  openModal({ kind: 'stack-edit', id: stack.id, title: stack.title })
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-danger-soft"
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
        className={`flex flex-col gap-1 rounded-xl border p-1.5 transition-colors compact:gap-0.5 compact:p-1 wallpaper:p-0 ${
          isOver ? 'border-accent-line bg-accent-soft/60' : 'border-transparent bg-well wallpaper:bg-transparent'
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
          // Quiet at rest: the dashed outline shows on hover, or always on an empty stack.
          className={`mt-1 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-xs text-muted hover:border-accent-line hover:bg-accent-soft/60 hover:text-accent-text compact:py-1.5 ${
            count === 0 ? 'border-line-strong' : 'border-transparent group-hover/stack:border-line-strong'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add bookmark
        </button>
      </div>
    </div>
  )
}
