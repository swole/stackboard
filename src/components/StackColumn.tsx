import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, FolderInput, FolderPlus, GripVertical, Link2, ListChecks, Lock, MoreVertical, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { shareStack } from '../lib/share'
import type { Stack } from '../lib/types'
import { useStackableStore } from '../store/useStackableStore'
import { openAllInTabs } from '../lib/tabs'
import { glow, reducedMotion } from '../lib/motion'
import { useTwoStep } from '../hooks/useTwoStep'
import { BookmarkCard } from './BookmarkCard'
import { FolderSection } from './FolderSection'
import { TodoItems } from './TodoItems'
import { useTodoList } from '../hooks/useTodoList'
import { clearDone, countOpen } from '../lib/todoPlan'
import { plural } from '../lib/importPlan'
import { allLinks, contentsLabel } from '../lib/folderPlan'
import { chipColors } from '../lib/stackStylePlan'
import { useStackPreview } from '../lib/stackStyle'
import { useAppearance } from '../store/useAppearance'

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
  // Links in the folders inside it count too (0.8.0): open-all, its confirm and the delete toast.
  const folders = stack.folders ?? []
  const links = allLinks(stack)
  const count = links.length
  // A to-do stack (0.6.0) keeps the header, drag and menu; its body is a checklist.
  const todo = stack.todo
  // A company stack (Teams, 0.8.0) keeps open-all and nothing that writes: no drag, menu or add.
  const readOnly = !!stack.readOnly
  // Teams T8: the import and export lock also covers sharing a stack as a link.
  const shareLocked = useStackableStore((s) => !!s.tree?.company?.lock.importExport)
  const { list, change } = useTodoList(todo?.id ?? null)
  // Stack colours (Pro, 0.9.0) show while Pro or the trial is on; the "Colour and icon" dialog
  // shows its pick on its stack while it's open, which is how a free user tries one.
  const coloursOn = useAppearance((s) => s.proOn)
  // School mode: under the company's pro lock there's no colour try-on, so the dialog is the icon alone.
  const iconOnly = useStackableStore((s) => !!s.tree?.company?.lock.pro) && !coloursOn
  const scheme = useAppearance((s) => s.scheme)
  const preview = useStackPreview((p) => (p.id === stack.id ? p : null))
  const color = preview ? preview.color : coloursOn ? (stack.color ?? null) : null
  const chip = color ? chipColors(color, scheme) : null
  const open = countOpen(list)
  const done = list ? list.items.length - open : 0

  const { attributes, listeners, setNodeRef: setSortNode, transform, transition, isDragging } =
    useSortable({
      id: `st:${stack.id}`,
      data: { type: 'stack', stack },
      disabled: readOnly,
    })

  const { setNodeRef: setDropNode, isOver } = useDroppable({
    id: `stack-drop:${stack.id}`,
    data: { type: 'stack-drop', stackId: stack.id },
    disabled: !!todo || readOnly, // links can't be dropped into a checklist or a company stack
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
    await openAllInTabs(links, stack.title, coloursOn ? stack.color : undefined)
  }

  // Share a stack (0.8.0, T4): the link carries the stack itself, so it works for anyone.
  const onShare = async () => {
    const { showToast, reportError } = useStackableStore.getState()
    try {
      const made = await shareStack(stack)
      if (!made) {
        showToast({ verb: 'Nothing to share:', title: stack.title, detail: 'Only web links can go in a share link.', duration: 4000 })
        return
      }
      if (!made.copied) {
        showToast({ verb: "Couldn't copy", title: 'the share link', detail: 'Click the page first, then try again.', duration: 6000 })
        return
      }
      showToast({ verb: 'Link copied:', title: made.title, detail: made.detail, duration: 7000 })
    } catch (err) {
      reportError(`share ${stack.title}`, err)
    }
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
      data-readonly-stack={readOnly ? '' : undefined}
    >
      <div
        {...(readOnly ? {} : attributes)}
        {...(readOnly ? {} : listeners)}
        className={`mb-3 flex items-center gap-1.5 compact:mb-2 wallpaper:mb-2 wallpaper:px-1 ${
          readOnly ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        aria-label={readOnly ? undefined : 'Drag stack header'}
      >
        {readOnly ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-faint" aria-label="From your company, read-only" />
        ) : (
          <GripVertical className="h-4 w-4 shrink-0 text-ghost opacity-0 transition-opacity group-hover/stack:opacity-100" />
        )}
        <h3
          onDoubleClick={(e) => {
            if (readOnly) return
            e.stopPropagation()
            openModal({ kind: 'stack-edit', id: stack.id, title: stack.title })
          }}
          className={`flex-1 truncate text-sm font-semibold text-fg select-none ${readOnly ? '' : 'cursor-text'}`}
          title={readOnly ? stack.title : 'Double-click to rename'}
        >
          {chip ? (
            <span
              data-stack-color={color ?? undefined}
              className="inline-block max-w-full truncate rounded-md px-1.5 align-top"
              style={{ backgroundColor: chip.bg, color: chip.fg }}
            >
              {stack.title}
            </span>
          ) : (
            stack.title
          )}
        </h3>
        {todo && open > 0 && (
          <span className="text-xs text-faint" aria-label={plural(open, 'to-do') + ' left'}>
            {open}
          </span>
        )}
        {!todo && (
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
        )}
        {!readOnly && (
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
              className="absolute right-0 top-7 z-30 w-44 overflow-hidden rounded-md border border-line bg-raised shadow-md"
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
                  openModal({ kind: 'stack-style', id: stack.id, title: stack.title, color: stack.color ?? null })
                }}
                data-stack-style
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
              >
                <Palette className="h-3.5 w-3.5" />
                {iconOnly ? 'Icon' : 'Colour and icon'}
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
              {!todo && (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    openModal({ kind: 'folder-add', parentId: stack.id })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  New folder
                </button>
              )}
              {/* `count` takes in the folders' links: a stack holding only folders can be shared too. */}
              {!todo && count > 0 && !shareLocked && (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    void onShare()
                  }}
                  data-share-stack
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Share as a link
                </button>
              )}
              {todo && done > 0 && (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    void change('clear the done to-dos', clearDone)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Clear {done} done
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void removeWithUndo('stack', stack.id, stack.title, todo ? plural(open, 'to-do') : contentsLabel(stack))
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-danger-soft"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
        )}
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
        {todo ? (
          <TodoItems stack={stack} list={list} change={change} revealSeq={revealSeq} />
        ) : (
          <>
            <SortableContext
              items={stack.bookmarks.map((b) => `bm:${b.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {stack.bookmarks.map((b) => (
                <BookmarkCard key={b.id} bookmark={b} />
              ))}
            </SortableContext>

            {/* Folders inside the stack (0.8.0), after its own links, folded until opened. */}
            {folders.map((f) => (
              <FolderSection key={f.id} folder={f} depth={1} />
            ))}

            {!readOnly && (
            <button
              onClick={() => openModal({ kind: 'bookmark-add', stackId: stack.id })}
              // Quiet at rest: the dashed outline shows on hover, or always on an empty stack.
              className={`mt-1 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-xs text-muted hover:border-accent-line hover:bg-accent-soft/60 hover:text-accent-text compact:py-1.5 ${
                count === 0 && folders.length === 0 ? 'border-line-strong' : 'border-transparent group-hover/stack:border-line-strong'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              Add bookmark
            </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
