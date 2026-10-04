import { useEffect, useMemo, useRef, useState } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Settings as SettingsIcon,
  SquareKanban,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import type { Space } from '../lib/types'
import { useStackableStore } from '../store/useStackableStore'
import { glow } from '../lib/motion'
import { topHit } from '../lib/search'
import { openHere, openInNewTab } from '../lib/tabs'

interface SortableSpaceProps {
  space: Space
  active: boolean
  onClick: () => void
}

function SortableSpaceRow({ space, active, onClick }: SortableSpaceProps) {
  const openModal = useStackableStore((s) => s.openModal)
  // A stack dropped onto this row glows it, so the move has somewhere visible to go.
  const flashSeq = useStackableStore((s) => (s.flash?.id === space.id ? s.flash.seq : 0))
  const [menuOpen, setMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active: dragActive,
  } = useSortable({
    id: `sp:${space.id}`,
    data: { type: 'space', space },
  })

  useEffect(() => {
    if (flashSeq) glow(rowRef.current, 80)
  }, [flashSeq])

  // A stack is being dragged over this space row — show it as a drop target.
  const stackIncoming = isOver && String(dragActive?.id ?? '').startsWith('st:')

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const openEditEmoji = (e: React.MouseEvent) => {
    e.stopPropagation()
    openModal({
      kind: 'space-edit',
      id: space.id,
      name: space.name,
      emoji: space.emoji,
      focusField: 'emoji',
    })
  }

  const openEditName = (e: React.MouseEvent) => {
    e.stopPropagation()
    openModal({
      kind: 'space-edit',
      id: space.id,
      name: space.name,
      emoji: space.emoji,
      focusField: 'name',
    })
  }

  const openEdit = () => {
    setMenuOpen(false)
    openModal({
      kind: 'space-edit',
      id: space.id,
      name: space.name,
      emoji: space.emoji,
    })
  }

  const openDelete = () => {
    setMenuOpen(false)
    openModal({
      kind: 'confirm-delete',
      targetKind: 'space',
      id: space.id,
      name: space.name,
      childCount: space.stacks.length,
    })
  }

  return (
    <div
      ref={(el) => {
        rowRef.current = el
        setNodeRef(el)
      }}
      style={style}
      className={`group flex items-center rounded-md transition-colors ${
        stackIncoming ? 'bg-peach-50 ring-2 ring-peach-300' : ''
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-ink-200 opacity-0 group-hover:opacity-100 hover:text-ink-500 active:cursor-grabbing"
        aria-label="Drag space"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onClick}
        className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
          active
            ? 'bg-cream-100 text-ink-800 font-medium'
            : 'text-ink-600 hover:bg-cream-50 hover:text-ink-800'
        }`}
      >
        <span
          onDoubleClick={openEditEmoji}
          className="text-base leading-none cursor-pointer select-none"
          title="Double-click to change icon"
        >
          {space.emoji}
        </span>
        <span
          onDoubleClick={openEditName}
          className="truncate cursor-text select-none"
          title="Double-click to rename"
        >
          {space.name || 'Untitled'}
        </span>
      </button>
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="rounded p-0.5 text-ink-300 opacity-0 group-hover:opacity-100 hover:bg-cream-50 hover:text-ink-700"
          aria-label="Space options"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-6 z-30 w-32 overflow-hidden rounded-md border border-ink-100 bg-white shadow-md"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              onClick={openEdit}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-cream-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={openDelete}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-peach-700 hover:bg-peach-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function Sidebar() {
  const tree = useStackableStore((s) => s.tree)
  const selectedId = useStackableStore((s) => s.selectedSpaceId)
  const selectSpace = useStackableStore((s) => s.selectSpace)
  const search = useStackableStore((s) => s.search)
  const setSearch = useStackableStore((s) => s.setSearch)
  const revealStack = useStackableStore((s) => s.revealStack)
  const openModal = useStackableStore((s) => s.openModal)
  const collapsed = useStackableStore((s) => s.sidebarCollapsed)
  const toggle = useStackableStore((s) => s.toggleSidebar)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [focusSearch, setFocusSearch] = useState(false)

  const spaces = tree?.spaces ?? []
  const activeSpace = spaces.find((s) => s.id === selectedId) ?? null

  const filteredStacks = useMemo(() => {
    if (!activeSpace) return []
    if (!search.trim()) return activeSpace.stacks
    const q = search.trim().toLowerCase()
    return activeSpace.stacks.filter(
      (st) =>
        st.title.toLowerCase().includes(q) ||
        st.bookmarks.some(
          (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q),
        ),
    )
  }, [activeSpace, search])

  // "/" from anywhere on the page jumps to search (expanding the sidebar if needed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typingInField()) return
      e.preventDefault()
      if (collapsed) toggle()
      setFocusSearch(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, toggle])

  useEffect(() => {
    if (!focusSearch || !searchRef.current) return
    searchRef.current.focus()
    setFocusSearch(false)
  })

  const goToSpace = (id: string) => {
    setSearch('')
    selectSpace(id)
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearch('')
      e.currentTarget.blur()
      return
    }
    if (e.key !== 'Enter') return
    const hit = topHit(tree, search)
    if (!hit) return
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) void openInNewTab(hit.url, e.shiftKey)
    else void openHere(hit.url, useStackableStore.getState().openTabs)
  }

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-ink-100 bg-white py-3">
        <button
          onClick={toggle}
          className="rounded p-1 text-ink-400 hover:bg-cream-50 hover:text-ink-700"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="mt-2 flex flex-col gap-1.5">
          {spaces.map((s) => (
            <button
              key={s.id}
              onClick={() => goToSpace(s.id)}
              title={s.name}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-base ${
                s.id === selectedId ? 'bg-cream-100' : 'hover:bg-cream-50'
              }`}
            >
              {s.emoji}
            </button>
          ))}
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-ink-100 bg-white">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <SquareKanban className="h-4 w-4 text-peach-500" />
          Stackboard
        </div>
        <button
          onClick={toggle}
          className="rounded p-1 text-ink-400 hover:bg-cream-50 hover:text-ink-700"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search all spaces"
            aria-label="Search all spaces"
            className="peer w-full rounded-md border border-ink-100 bg-cream-50 py-1.5 pl-7 pr-7 text-sm placeholder:text-ink-400 focus:border-peach-300 focus:bg-white focus:outline-none"
          />
          {search ? (
            <button
              onClick={() => {
                setSearch('')
                searchRef.current?.focus()
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:bg-cream-100 hover:text-ink-700"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-ink-100 bg-white px-1 font-sans text-[10px] leading-4 text-ink-400 peer-focus:hidden">
              /
            </kbd>
          )}
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => openModal({ kind: 'settings' })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-600 hover:bg-cream-50 hover:text-ink-800"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Spaces</span>
        <button
          onClick={() => openModal({ kind: 'space-add' })}
          className="rounded p-0.5 text-ink-400 hover:bg-cream-50 hover:text-ink-700"
          aria-label="Add space"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <SortableContext
          items={spaces.map((s) => `sp:${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-0.5">
            {spaces.map((s) => (
              <div key={s.id}>
                <SortableSpaceRow
                  space={s}
                  active={s.id === selectedId && !search.trim()}
                  onClick={() => goToSpace(s.id)}
                />
                {s.id === selectedId && (
                  <div className="ml-7 mt-0.5 flex flex-col gap-0.5">
                    {filteredStacks.map((st) => (
                      <a
                        key={st.id}
                        href={`#stack-${st.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          revealStack(s.id, st.id)
                        }}
                        className="truncate rounded px-2 py-1 text-xs text-ink-500 hover:bg-cream-50 hover:text-ink-700"
                      >
                        {st.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {spaces.length === 0 && (
              <button
                onClick={() => openModal({ kind: 'space-add' })}
                className="rounded-md border border-dashed border-ink-200 px-2 py-3 text-xs text-ink-400 hover:border-peach-300 hover:bg-peach-50 hover:text-peach-700"
              >
                + Create your first space
              </button>
            )}
          </div>
        </SortableContext>
      </div>
    </aside>
  )
}
