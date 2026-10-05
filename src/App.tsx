import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { Sidebar } from './components/Sidebar'
import { SpaceView } from './components/SpaceView'
import { SearchResults } from './components/SearchResults'
import { UndoToast } from './components/UndoToast'
import { Welcome } from './components/Welcome'
import { KeepItHint } from './components/KeepItHint'
import { RatingPrompt } from './components/RatingPrompt'
import { BookmarkGhost, StackGhost } from './components/DragGhosts'
import { Backdrop } from './components/Backdrop'
import { ModalHost } from './components/modals/ModalHost'
import { useStackableStore } from './store/useStackableStore'
import { useBookmarkTree } from './hooks/useBookmarkTree'
import { useOpenTabs } from './hooks/useOpenTabs'
import { IS_EXTENSION, moveSpace, moveStack, moveBookmark } from './lib/bookmarks'
import { takeOpenSpaceNote } from './lib/stash'
import { plural } from './lib/importPlan'
import type { Bookmark, Space, Stack } from './lib/types'

type DragItem =
  | { type: 'space'; space: Space }
  | { type: 'stack'; stack: Stack }
  | { type: 'bookmark'; bookmark: Bookmark }

function parseId(id: string): { kind: 'sp' | 'st' | 'bm' | 'stack-drop'; rawId: string } | null {
  if (id.startsWith('sp:')) return { kind: 'sp', rawId: id.slice(3) }
  if (id.startsWith('st:')) return { kind: 'st', rawId: id.slice(3) }
  if (id.startsWith('bm:')) return { kind: 'bm', rawId: id.slice(3) }
  if (id.startsWith('stack-drop:')) return { kind: 'stack-drop', rawId: id.slice('stack-drop:'.length) }
  return null
}

// Type-aware collision detection.
//
// A stack's sortable node wraps its whole column, which *also* contains the
// bookmark sortables (`bm:`) and a `stack-drop:` droppable. With a single
// closestCenter scanning every droppable, dragging a stack frequently resolves
// `over` to a bookmark or the drop-zone inside the target column rather than the
// `st:` stack node — so the reorder branch in onDragEnd silently no-ops and the
// stack appears un-draggable. Restricting the candidate droppables to the kind
// that matches what's being dragged makes every drag resolve to the right
// target: stacks snap to stacks, spaces to spaces, bookmarks to bookmarks (or an
// empty stack's drop-zone).
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const activeId = String(args.active.id)

  // A stack can either be reordered within its space (dropped on another `st:`)
  // or moved to a different space by dropping on a sidebar space row (`sp:`).
  // Detect the sidebar drop with the *pointer*, not closestCenter: the stack
  // DragOverlay is 260px wide, so its center can sit outside the 240px sidebar
  // even while the pointer is squarely over a space row — closestCenter would
  // then wrongly prefer a main-area stack. Pointer-within nails the sidebar
  // case; fall back to closestCenter among stacks for in-row reordering.
  if (activeId.startsWith('st:')) {
    const spaceRows = args.droppableContainers.filter((c) =>
      String(c.id).startsWith('sp:'),
    )
    const onSidebar = pointerWithin({ ...args, droppableContainers: spaceRows })
    if (onSidebar.length > 0) return onSidebar
    const stacks = args.droppableContainers.filter((c) => String(c.id).startsWith('st:'))
    return closestCenter({ ...args, droppableContainers: stacks })
  }

  const allowed = activeId.startsWith('sp:')
    ? ['sp:']
    : activeId.startsWith('bm:')
      ? ['bm:', 'stack-drop:']
      : []

  const droppableContainers =
    allowed.length === 0
      ? args.droppableContainers
      : args.droppableContainers.filter((c) =>
          allowed.some((prefix) => String(c.id).startsWith(prefix)),
        )

  return closestCenter({ ...args, droppableContainers })
}

// The dragged card flies to its slot and flattens out on the way (data-dropping switches
// off the tilt in index.css). The default side effect keeps the original hidden meanwhile.
const dropAnimation: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: (params) => {
    params.dragOverlay.node.querySelector('[data-lifted]')?.setAttribute('data-dropping', '')
    return defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } })(params)
  },
}

export default function App() {
  useBookmarkTree()
  useOpenTabs()
  const tree = useStackableStore((s) => s.tree)
  const loading = useStackableStore((s) => s.loading)
  const error = useStackableStore((s) => s.error)
  const selectedId = useStackableStore((s) => s.selectedSpaceId)
  const search = useStackableStore((s) => s.search)
  const onboarding = useStackableStore((s) => s.onboarding)
  const flashItem = useStackableStore((s) => s.flashItem)

  const activeSpace = useMemo(
    () => tree?.spaces.find((s) => s.id === selectedId) ?? null,
    [tree, selectedId],
  )

  const [dragging, setDragging] = useState<DragItem | null>(null)

  // A tab opened by "Stash this window" lands on the Stash space and says what it saved.
  const loaded = !!tree
  // Timing mark for the board's first paint; the e2e suite checks the wallpaper comes after it.
  useEffect(() => {
    if (loaded) performance.mark('sb:board')
  }, [loaded])
  useEffect(() => {
    if (!loaded || !IS_EXTENSION) return
    void takeOpenSpaceNote().then((note) => {
      if (!note) return
      const store = useStackableStore.getState()
      store.selectSpace(note.spaceId)
      store.showToast({ verb: 'Stashed', title: plural(note.saved, 'tab'), duration: 4000 })
      store.celebrate()
    })
  }, [loaded])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragItem | undefined
    if (data) setDragging(data)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null)
    const { active, over } = e
    if (!over || !tree) return

    const a = parseId(String(active.id))
    const o = parseId(String(over.id))
    if (!a || !o) return

    // --- Space reorder ---
    if (a.kind === 'sp' && o.kind === 'sp' && a.rawId !== o.rawId) {
      const spaces = tree.spaces
      const fromIdx = spaces.findIndex((s) => s.id === a.rawId)
      const toIdx = spaces.findIndex((s) => s.id === o.rawId)
      if (fromIdx < 0 || toIdx < 0) return
      // Index convention for chrome.bookmarks.move on same-parent reorder: pass the
      // target index as if the dragged item were still in the array (toIdx for a
      // leftward move, toIdx+1 for rightward); Chrome applies the self-removal shift.
      const chromeIdx = toIdx > fromIdx ? toIdx + 1 : toIdx
      await moveSpace(a.rawId, chromeIdx)
      flashItem(a.rawId)
      return
    }

    // --- Stack reorder (within same space only) ---
    if (a.kind === 'st' && o.kind === 'st' && a.rawId !== o.rawId) {
      const space = tree.spaces.find((s) => s.stacks.some((st) => st.id === a.rawId))
      const overSpace = tree.spaces.find((s) => s.stacks.some((st) => st.id === o.rawId))
      if (!space || !overSpace || space.id !== overSpace.id) return
      const fromIdx = space.stacks.findIndex((s) => s.id === a.rawId)
      const toIdx = space.stacks.findIndex((s) => s.id === o.rawId)
      if (fromIdx < 0 || toIdx < 0) return
      const chromeIdx = toIdx > fromIdx ? toIdx + 1 : toIdx
      await moveStack(a.rawId, space.id, chromeIdx)
      flashItem(a.rawId)
      return
    }

    // --- Stack moved to a DIFFERENT space (dropped on a sidebar space row) ---
    if (a.kind === 'st' && o.kind === 'sp') {
      const fromSpace = tree.spaces.find((s) => s.stacks.some((st) => st.id === a.rawId))
      const toSpace = tree.spaces.find((s) => s.id === o.rawId)
      if (!fromSpace || !toSpace || fromSpace.id === toSpace.id) return
      // Append to the end of the destination space's stack row — the row isn't
      // visible during the drop, so end-of-row is the only predictable target.
      await moveStack(a.rawId, toSpace.id, toSpace.stacks.length)
      flashItem(toSpace.id) // the destination row in the sidebar glows
      return
    }

    // --- Bookmark dropped on a bookmark (reorder, possibly across stacks) ---
    if (a.kind === 'bm' && o.kind === 'bm') {
      if (a.rawId === o.rawId) return
      const fromStack = findStackOf(tree, a.rawId, 'bookmark')
      const toStack = findStackOf(tree, o.rawId, 'bookmark')
      if (!fromStack || !toStack) return
      const fromIdx = fromStack.bookmarks.findIndex((b) => b.id === a.rawId)
      const toIdx = toStack.bookmarks.findIndex((b) => b.id === o.rawId)
      if (fromIdx < 0 || toIdx < 0) return
      const sameStack = fromStack.id === toStack.id
      const chromeIdx = sameStack && toIdx > fromIdx ? toIdx + 1 : toIdx
      await moveBookmark(a.rawId, toStack.id, chromeIdx)
      flashItem(a.rawId)
      return
    }

    // --- Bookmark dropped onto an EMPTY stack's container ---
    // Only reachable when the target stack has no bookmarks: a non-empty stack
    // always has an inner `bm:` card whose center wins closestCenter, so those
    // drops are handled by the bm→bm branch above. This branch appends to empties.
    if (a.kind === 'bm' && o.kind === 'stack-drop') {
      const targetStack = tree.spaces.flatMap((s) => s.stacks).find((s) => s.id === o.rawId)
      if (!targetStack) return
      const fromStack = findStackOf(tree, a.rawId, 'bookmark')
      if (!fromStack) return
      // Append at the end (index = current length; same-stack append needs +0 since item is removed first)
      const chromeIdx = targetStack.bookmarks.length
      await moveBookmark(a.rawId, targetStack.id, chromeIdx)
      flashItem(a.rawId)
      return
    }
  }

  const searching = search.trim().length > 0
  // An empty board gets the welcome screen, which stays up while it fills the board.
  const welcoming = !!tree && !searching && (tree.spaces.length === 0 || onboarding)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-screen text-fg">
        <Backdrop />
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {loading && !tree && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-danger">
              {error}
            </div>
          )}
          {welcoming && <Welcome />}
          {tree && searching && <SearchResults query={search} />}
          {activeSpace && !searching && !welcoming && <SpaceView space={activeSpace} />}
        </main>
        <ModalHost />
        <UndoToast />
        <KeepItHint />
        <RatingPrompt />
        <DragOverlay dropAnimation={dropAnimation}>
          {dragging?.type === 'bookmark' && <BookmarkGhost bookmark={dragging.bookmark} />}
          {dragging?.type === 'stack' && <StackGhost stack={dragging.stack} />}
          {dragging?.type === 'space' && (
            <div
              data-lifted
              className="rounded-md border border-accent-line bg-card px-2 py-1.5 text-sm text-fg"
            >
              {dragging.space.emoji} {dragging.space.name}
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  )
}

function findStackOf(
  tree: { spaces: Space[] },
  rawId: string,
  kind: 'bookmark' | 'stack',
): Stack | null {
  for (const space of tree.spaces) {
    for (const stack of space.stacks) {
      if (kind === 'stack' && stack.id === rawId) return stack
      if (kind === 'bookmark' && stack.bookmarks.some((b) => b.id === rawId)) return stack
    }
  }
  return null
}
