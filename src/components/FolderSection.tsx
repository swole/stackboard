import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronRight, ExternalLink, FolderPlus, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Folder } from '../lib/types'
import { allLinks, contentsLabel } from '../lib/folderPlan'
import { plural } from '../lib/importPlan'
import { openAllInTabs } from '../lib/tabs'
import { glow, reducedMotion } from '../lib/motion'
import { useTwoStep } from '../hooks/useTwoStep'
import { useStackableStore } from '../store/useStackableStore'
import { BookmarkCard } from './BookmarkCard'

interface Props {
  folder: Folder
  /** 1 for a folder straight inside the stack, 2 for one inside that, and so on. */
  depth: number
}

/**
 * A folder inside a stack (nested folders, 0.8.0): a header that folds it, then its links and the
 * folders inside it, indented. Folded until it is opened on this device. Links drag in and out
 * like any card, and a link dropped on the header goes in last, folded or not. A company folder
 * (Teams) opens, folds and opens its links in tabs; nothing that writes.
 */
export function FolderSection({ folder, depth }: Props) {
  const readOnly = !!folder.readOnly
  const open = useStackableStore((s) => s.openFolders.has(folder.id))
  const toggleFolder = useStackableStore((s) => s.toggleFolder)
  const openModal = useStackableStore((s) => s.openModal)
  const removeWithUndo = useStackableStore((s) => s.removeWithUndo)
  const flashSeq = useStackableStore((s) => (s.flash?.id === folder.id ? s.flash.seq : 0))
  const revealSeq = useStackableStore((s) => (s.reveal?.id === folder.id ? s.reveal.seq : 0))
  const [menuOpen, setMenuOpen] = useState(false)
  const openAll = useTwoStep()
  const headRef = useRef<HTMLDivElement | null>(null)
  const links = allLinks(folder)
  const count = links.length
  const empty = folder.bookmarks.length === 0 && folder.folders.length === 0
  const bodyId = `folder-body-${folder.id}`
  // The hover actions stay out while the confirm is armed or the menu is open.
  const pinned = openAll.armed || menuOpen

  const { setNodeRef, isOver } = useDroppable({
    id: `fd:${folder.id}`,
    data: { type: 'folder-drop', folderId: folder.id },
    disabled: readOnly,
  })

  // Glow after an undo or a new folder; scroll into view and glow for a search hit inside it.
  useEffect(() => {
    if (flashSeq) glow(headRef.current, 120)
  }, [flashSeq])
  useEffect(() => {
    if (!revealSeq) return
    headRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' })
    glow(headRef.current, 280)
  }, [revealSeq])

  const onOpenAll = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (count === 0) return
    if (count > 15 && !openAll.armed) {
      openAll.arm()
      return
    }
    openAll.disarm()
    await openAllInTabs(links, folder.title)
  }

  const menuItem = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover'
  const pick = (run: () => void) => () => {
    setMenuOpen(false)
    run()
  }

  return (
    <div id={`folder-${folder.id}`} data-folder={folder.title} data-depth={depth} className="flex min-w-0 flex-col">
      <div
        ref={(el) => {
          headRef.current = el
          setNodeRef(el)
        }}
        data-folder-head
        className={`group/folder relative flex items-center rounded-lg transition-colors ${
          isOver ? 'bg-accent-soft/60 ring-1 ring-accent-line' : 'hover:bg-hover wallpaper:hover:bg-hover/90'
        }`}
      >
        {/* The whole name folds and unfolds it; a double-click renames, so its second click is skipped. */}
        <button
          type="button"
          onClick={(e) => e.detail < 2 && toggleFolder(folder.id)}
          onDoubleClick={readOnly ? undefined : () => openModal({ kind: 'folder-edit', id: folder.id, title: folder.title })}
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          title={readOnly ? folder.title : 'Double-click to rename'}
          className="flex min-w-0 flex-1 select-none items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-2 text-left text-[13px] font-medium text-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus compact:py-1"
        >
          <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="min-w-0 flex-1 truncate">{folder.title || 'Untitled'}</span>
          <span data-folder-count aria-label={plural(count, 'link')} className="shrink-0 text-xs font-normal tabular-nums text-faint">
            {count}
          </span>
        </button>
        {/* Hover actions take room only while shown, so a folded row at rest ends on its count. */}
        <div
          className={`flex shrink-0 items-center gap-0.5 overflow-hidden ${
            pinned
              ? 'pr-1.5'
              : 'w-0 opacity-0 focus-within:w-auto focus-within:pr-1.5 focus-within:opacity-100 group-hover/folder:w-auto group-hover/folder:pr-1.5 group-hover/folder:opacity-100'
          }`}
        >
          {count > 0 && (
            <button
              type="button"
              onClick={onOpenAll}
              className={`flex items-center gap-1 rounded p-0.5 ${
                openAll.armed ? 'bg-accent px-1.5 text-on-accent hover:bg-accent-hover' : 'text-faint hover:bg-card/60 hover:text-fg'
              }`}
              aria-label={`Open all ${plural(count, 'bookmark')} in ${folder.title} as tabs`}
              title={openAll.armed ? 'Click again to open them all' : `Open all ${plural(count, 'bookmark')} as tabs`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {openAll.armed && <span className="text-xs font-medium">Open {count}?</span>}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-0.5 text-faint hover:bg-card/60 hover:text-fg"
              aria-label="Folder options"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {menuOpen && !readOnly && (
          <div
            className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-md border border-line bg-raised shadow-md"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button onClick={pick(() => openModal({ kind: 'folder-edit', id: folder.id, title: folder.title }))} className={menuItem}>
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <button onClick={pick(() => openModal({ kind: 'bookmark-add', stackId: folder.id }))} className={menuItem}>
              <Plus className="h-3.5 w-3.5" />
              Add bookmark
            </button>
            <button onClick={pick(() => openModal({ kind: 'folder-add', parentId: folder.id }))} className={menuItem}>
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </button>
            <button
              onClick={pick(() => void removeWithUndo('folder', folder.id, folder.title || 'Untitled', contentsLabel(folder)))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-danger-soft"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          id={bodyId}
          data-folder-body
          className="ml-[17px] mt-1 flex min-w-0 flex-col gap-1 border-l border-line pl-1.5 compact:mt-0.5 compact:gap-0.5"
        >
          <SortableContext items={folder.bookmarks.map((b) => `bm:${b.id}`)} strategy={verticalListSortingStrategy}>
            {folder.bookmarks.map((b) => (
              <BookmarkCard key={b.id} bookmark={b} />
            ))}
          </SortableContext>
          {folder.folders.map((f) => (
            <FolderSection key={f.id} folder={f} depth={depth + 1} />
          ))}
          {empty && !readOnly && (
            <button
              onClick={() => openModal({ kind: 'bookmark-add', stackId: folder.id })}
              className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-xs text-muted hover:border-accent-line hover:bg-accent-soft/60 hover:text-accent-text compact:py-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add bookmark
            </button>
          )}
        </div>
      )}
    </div>
  )
}
