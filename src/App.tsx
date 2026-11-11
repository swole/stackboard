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
import { Certificate } from './components/Certificate'
import type { Bankruptcy } from './lib/stashPlan'
import { BookmarkGhost, StackGhost } from './components/DragGhosts'
import { Backdrop } from './components/Backdrop'
import { ModalHost } from './components/modals/ModalHost'
import { useStackableStore } from './store/useStackableStore'
import { useBookmarkTree } from './hooks/useBookmarkTree'
import { useOpenTabs } from './hooks/useOpenTabs'
import { IS_EXTENSION, moveSpace, moveStack, moveBookmark } from './lib/bookmarks'
import { takeOpenSpaceNote } from './lib/stash'
import { sweepOrphans } from './lib/todos'
import { usePro } from './lib/pro'
import { hasPro } from './lib/proPlan'
import { askToArchive, useArchive } from './lib/autoArchive'
import { archivedNote } from './lib/archivePlan'
import { maybeTakeDailySnapshot } from './lib/snapshots'
import { WhatsNew } from './components/WhatsNew'
import { TrialEndCard } from './components/TrialEndCard'
import { ReverseTrialCard } from './components/ReverseTrialCard'
import { WhyNotCard } from './components/WhyNotCard'
import { FoundingNote } from './components/FoundingNote'
import { MomentLine } from './components/MomentLine'
import { useCorner } from './lib/corner'
import { CommandBar } from './components/CommandBar'
import { ShareAddCard } from './components/ShareAddCard'
import { readSearchHash } from './lib/goLinks'
import { TodayView } from './components/TodayView'
import { useAllTodos } from './lib/allTodos'
import { AnnouncementBar } from './components/AnnouncementBar'
import { plural } from './lib/importPlan'
import { prefs } from './lib/prefs'
import { RATING_MILESTONE_STASHES } from './lib/onboarding'
import { holderOf, liveTodoIds, locate, moveIndex } from './lib/folderPlan'
import type { Bookmark, Space, Stack } from './lib/types'

type DragItem =
  | { type: 'space'; space: Space }
  | { type: 'stack'; stack: Stack }
  | { type: 'bookmark'; bookmark: Bookmark }

// sp: a sidebar space row, st: a stack, bm: a link, stack-drop: a stack's list, fd: the header of
// a folder inside a stack (0.8.0).
function parseId(id: string): { kind: 'sp' | 'st' | 'bm' | 'stack-drop' | 'fd'; rawId: string } | null {
  if (id.startsWith('sp:')) return { kind: 'sp', rawId: id.slice(3) }
  if (id.startsWith('st:')) return { kind: 'st', rawId: id.slice(3) }
  if (id.startsWith('bm:')) return { kind: 'bm', rawId: id.slice(3) }
  if (id.startsWith('stack-drop:')) return { kind: 'stack-drop', rawId: id.slice('stack-drop:'.length) }
  if (id.startsWith('fd:')) return { kind: 'fd', rawId: id.slice(3) }
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

  // A link let go over a folder's header goes into that folder, last, so a folded folder still
  // takes links (0.8.0). The pointer decides, as for the sidebar. The folder it already sits in
  // is left out: a reorder to the top of a folder would overshoot onto its header.
  if (activeId.startsWith('bm:')) {
    const own = (args.active.data.current as { bookmark?: Bookmark } | undefined)?.bookmark?.parentStackId
    const headers = args.droppableContainers.filter((c) => String(c.id).startsWith('fd:') && String(c.id) !== `fd:${own}`)
    const into = pointerWithin({ ...args, droppableContainers: headers })
    if (into.length > 0) return into
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
  const companyChosen = useStackableStore((s) => s.companyChosen)
  const flashItem = useStackableStore((s) => s.flashItem)

  const activeSpace = useMemo(
    () => tree?.spaces.find((s) => s.id === selectedId) ?? null,
    [tree, selectedId],
  )

  const [dragging, setDragging] = useState<DragItem | null>(null)

  // A tab opened by "Stash this window" lands on the Stash space and says what it saved.
  const loaded = !!tree
  const [certificate, setCertificate] = useState<Bankruptcy | null>(null)
  // Timing mark for the board's first paint; the e2e suite checks the wallpaper comes after it.
  useEffect(() => {
    if (loaded) performance.mark('sb:board')
  }, [loaded])
  // Go links (Teams T6): "go <words>" with no match opens a new tab that searches the board for them.
  useEffect(() => {
    if (!loaded) return
    const q = readSearchHash(location.hash)
    if (!q) return
    useStackableStore.getState().setSearch(q)
    history.replaceState(null, '', location.pathname + location.search)
  }, [loaded])
  useEffect(() => {
    if (!loaded || !IS_EXTENSION) return
    void takeOpenSpaceNote().then((note) => {
      if (!note) return
      const store = useStackableStore.getState()
      store.selectSpace(note.spaceId)
      if (note.bankruptcy) setCertificate(note.bankruptcy)
      store.showToast({ verb: 'Stashed', title: plural(note.saved, 'tab'), duration: 4000 })
      store.celebrate()
      // The third stash is a rating milestone; a bankruptcy waits for its certificate to close.
      if (prefs.bumpStashes() >= RATING_MILESTONE_STASHES && !note.bankruptcy) store.reachMilestone()
      // 0.9.0: free users hear once in a while that auto-archive does this by itself.
      if (!note.bankruptcy) useCorner.getState().requestMoment('stash')
    })
  }, [loaded])

  // A board made before Pro (0.7.0) marks an early user, for people the update marker missed.
  useEffect(() => {
    if (loaded) usePro.getState().seeBoard(useStackableStore.getState().tree?.rootDateAdded)
  }, [loaded])

  // 0.8.0: to-do lists joined Pro for early users too; one who already had a list keeps making
  // them free. Decided once per Chrome profile, on the first board 0.8.0 loads.
  const proReady = usePro((s) => s.ready)
  const early = usePro((s) => s.early)
  useEffect(() => {
    if (!loaded || !proReady || !early) return
    void usePro.getState().decideTodo((useStackableStore.getState().tree?.todoIds?.length ?? 0) > 0)
  }, [loaded, proReady, early])

  // Pro (0.7.0): a few seconds after the board loads, archive idle tabs (when switched on) and
  // take today's snapshot. Both wait for the license state, and neither runs without Pro.
  const proOn = usePro((s) => s.ready && hasPro(s.state))
  const archiveAfter = useArchive((s) => s.afterMs)
  useEffect(() => {
    if (!loaded || !IS_EXTENSION || !proOn || !archiveAfter) return
    const timer = setTimeout(() => {
      void askToArchive(archiveAfter).then(async (n) => {
        if (!n) return
        const store = useStackableStore.getState()
        await store.refresh()
        store.showToast({ verb: 'Archived', title: archivedNote(n), detail: 'Saved in your Stash space', duration: 4000 })
      })
    }, 2000)
    return () => clearTimeout(timer)
  }, [loaded, proOn, archiveAfter])
  useEffect(() => {
    if (!loaded || !IS_EXTENSION || !proOn) return
    const timer = setTimeout(() => {
      void maybeTakeDailySnapshot().catch((err) => console.warn('Stackboard: snapshot failed', err))
    }, 4000)
    return () => clearTimeout(timer)
  }, [loaded, proOn])

  // Today (Pro, 0.7.1) follows every to-do list on the board while Pro or the trial is on.
  const todayView = useStackableStore((s) => s.todayView)
  useEffect(() => {
    const ids = proOn && tree ? tree.spaces.flatMap((sp) => sp.stacks.flatMap((st) => (st.todo ? [st.todo.id] : []))) : []
    useAllTodos.getState().track(ids)
  }, [tree, proOn])

  // Lists whose to-do stack is gone get marked, then dropped a week later (todos.ts). Once per
  // new tab, a few seconds in, so it reads the tree after any sync burst has landed.
  useEffect(() => {
    if (!loaded || !IS_EXTENSION) return
    const timer = setTimeout(() => {
      const t = useStackableStore.getState().tree
      if (!t) return
      // A marker at any depth keeps its list, one moved inside another stack included (0.8.0).
      void sweepOrphans(liveTodoIds(t)).catch((err) => console.warn('Stackboard: to-do sweep failed', err))
    }, 5000)
    return () => clearTimeout(timer)
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

    // Teams (0.8.0): company spaces, stacks, folders and links never move, and nothing moves into
    // them. Their sortables are disabled; this guards anything that slips through.
    const companySpace = (id: string) => tree.spaces.some((s) => s.company && s.id === id)
    const locked = (id: string) => !!locate(tree, id)?.container.readOnly
    if (a.kind === 'sp' && companySpace(a.rawId)) return
    if (o.kind === 'sp' && companySpace(o.rawId)) return
    if (a.kind === 'st' && locked(a.rawId)) return
    if ((o.kind === 'st' || o.kind === 'stack-drop' || o.kind === 'fd') && locked(o.rawId)) return
    if (a.kind === 'bm' && holderOf(tree, a.rawId)?.container.readOnly) return
    if (o.kind === 'bm' && holderOf(tree, o.rawId)?.container.readOnly) return

    // --- Space reorder ---
    if (a.kind === 'sp' && o.kind === 'sp' && a.rawId !== o.rawId) {
      // Indexes count the person's own spaces only: those are the children of the root folder.
      const spaces = tree.spaces.filter((s) => !s.company)
      const fromIdx = spaces.findIndex((s) => s.id === a.rawId)
      const toIdx = spaces.findIndex((s) => s.id === o.rawId)
      if (fromIdx < 0 || toIdx < 0) return
      // Chrome counts every child of the folder, loose links included, so use the real indexes
      // (moveIndex adds the one-place shift Chrome applies when moving down in the same folder).
      const chromeIdx = moveIndex(spaces[fromIdx], fromIdx, spaces[toIdx], toIdx, true)
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
      const chromeIdx = moveIndex(space.stacks[fromIdx], fromIdx, space.stacks[toIdx], toIdx, true)
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
      await moveStack(a.rawId, toSpace.id)
      flashItem(toSpace.id) // the destination row in the sidebar glows
      return
    }

    // --- Bookmark dropped on a bookmark (reorder, possibly across stacks and folders) ---
    if (a.kind === 'bm' && o.kind === 'bm') {
      if (a.rawId === o.rawId) return
      const from = holderOf(tree, a.rawId)?.container
      const to = holderOf(tree, o.rawId)?.container
      if (!from || !to) return
      const fromIdx = from.bookmarks.findIndex((b) => b.id === a.rawId)
      const toIdx = to.bookmarks.findIndex((b) => b.id === o.rawId)
      if (fromIdx < 0 || toIdx < 0) return
      // Chrome's index counts the folders in a stack too, so it comes from the links themselves.
      const chromeIdx = moveIndex(from.bookmarks[fromIdx], fromIdx, to.bookmarks[toIdx], toIdx, from.id === to.id)
      await moveBookmark(a.rawId, to.id, chromeIdx)
      flashItem(a.rawId)
      return
    }

    // --- Bookmark dropped onto a stack's container, or onto a folder's header (0.8.0) ---
    // The container is only reachable when the target stack has no bookmarks near the
    // pointer: a non-empty stack has inner `bm:` cards whose centers win closestCenter, so
    // those drops are handled by the bm→bm branch above. Both append at the end: Chrome puts
    // the link after everything in the folder, so it shows last among the links.
    if (a.kind === 'bm' && (o.kind === 'stack-drop' || o.kind === 'fd')) {
      const target = locate(tree, o.rawId)
      if (!target || !holderOf(tree, a.rawId)) return
      await moveBookmark(a.rawId, target.container.id)
      // Into a folder: open it (and the folders around it) so the link is seen landing.
      if (o.kind === 'fd') useStackableStore.getState().unfoldFolders(target.path.map((f) => f.id))
      flashItem(a.rawId)
      return
    }
  }

  const searching = search.trim().length > 0
  // An empty board gets the welcome screen, which stays up while it fills the board. Only the
  // person's own spaces count: company spaces show once they pick one (or the start-here space opens).
  const ownSpaces = tree ? tree.spaces.filter((s) => !s.company).length : 0
  const welcoming = !!tree && !searching && (onboarding || (ownSpaces === 0 && !companyChosen))

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
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AnnouncementBar />
          <div className="min-h-0 flex-1">
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
            {proOn && todayView && !searching && !welcoming && <TodayView />}
            {activeSpace && !searching && !welcoming && !(proOn && todayView) && <SpaceView space={activeSpace} />}
          </div>
        </main>
        <ModalHost />
        <UndoToast />
        <KeepItHint />
        <RatingPrompt />
        <WhatsNew />
        <TrialEndCard />
        <ReverseTrialCard welcoming={welcoming} />
        <WhyNotCard welcoming={welcoming} />
        <FoundingNote welcoming={welcoming} />
        <MomentLine />
        <CommandBar />
        <ShareAddCard />
        {certificate && (
          <Certificate
            bankruptcy={certificate}
            onClose={(saved) => {
              setCertificate(null)
              if (saved || prefs.stashes() >= RATING_MILESTONE_STASHES) useStackableStore.getState().reachMilestone()
              useCorner.getState().requestMoment('bankruptcy')
            }}
          />
        )}
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
