import { create } from 'zustand'
import type { StackableTree } from '../lib/types'
import {
  deleteBookmark,
  deleteSpace,
  deleteStack,
  readTree,
  restoreSnapshot,
  snapshotNode,
} from '../lib/bookmarks'
import type { OpenTabIndex } from '../lib/openTabs'
import { prefs } from '../lib/prefs'

type ModalState =
  | { kind: 'none' }
  | { kind: 'space-add' }
  | { kind: 'space-edit'; id: string; name: string; emoji: string; focusField?: 'emoji' | 'name' }
  | { kind: 'stack-add'; spaceId: string }
  | { kind: 'stack-edit'; id: string; title: string }
  | { kind: 'stack-move'; id: string; title: string; currentSpaceId: string }
  | { kind: 'bookmark-add'; stackId: string }
  | { kind: 'bookmark-edit'; id: string; title: string; url: string; stackId: string }
  | { kind: 'confirm-delete'; targetKind: 'space' | 'stack' | 'bookmark'; id: string; name: string; childCount: number }
  | { kind: 'settings' }
  | { kind: 'import' }
  | { kind: 'packs' }

export interface ToastState {
  id: number
  verb: string
  title: string
  detail?: string
  /** ms before it dismisses itself; the undo countdown pauses while hovered */
  duration: number
  undo?: () => Promise<void>
}

/** A one-shot cue for a single item: `seq` changes each time so effects replay. */
export interface Cue {
  id: string
  seq: number
}

type DeletableKind = 'space' | 'stack' | 'bookmark'

interface StackableState {
  tree: StackableTree | null
  loading: boolean
  error: string | null
  selectedSpaceId: string | null
  search: string
  modal: ModalState
  sidebarCollapsed: boolean
  toast: ToastState | null
  /** Glow an item (bookmark, stack or space row) where it sits. */
  flash: Cue | null
  /** Scroll a stack into view, then glow it. */
  reveal: Cue | null
  openTabs: OpenTabIndex | null
  /** True while the welcome screen is filling an empty board, so it stays up until done. */
  onboarding: boolean
  /** Bumped when something goes well (import, starter pack, stash): a good moment to ask for a rating (0.4.1). */
  wins: number

  refresh: () => Promise<void>
  selectSpace: (id: string | null) => void
  setSearch: (q: string) => void
  openModal: (m: ModalState) => void
  closeModal: () => void
  toggleSidebar: () => void
  showToast: (t: Omit<ToastState, 'id'>) => void
  dismissToast: (id: number) => void
  flashItem: (id: string) => void
  revealStack: (spaceId: string, stackId: string) => void
  setOpenTabs: (index: OpenTabIndex) => void
  setOnboarding: (on: boolean) => void
  celebrate: () => void
  removeWithUndo: (kind: DeletableKind, id: string, title: string, detail?: string) => Promise<void>
}

const UNDO_MS = 7000
const NOTE_MS = 2200
const CUE_MS = 1600

let cueSeq = 0

export const useStackableStore = create<StackableState>((set, get) => ({
  tree: null,
  loading: true,
  error: null,
  selectedSpaceId: null,
  search: '',
  modal: { kind: 'none' },
  sidebarCollapsed: prefs.sidebarCollapsed(),
  toast: null,
  flash: null,
  reveal: null,
  openTabs: null,
  onboarding: false,
  wins: 0,

  refresh: async () => {
    try {
      set({ loading: true, error: null })
      const tree = await readTree()
      const has = (id: string | null) => !!id && tree.spaces.some((s) => s.id === id)
      const current = get().selectedSpaceId
      const remembered = prefs.lastSpaceId()
      const next = has(current)
        ? current
        : has(remembered)
          ? remembered
          : (tree.spaces[0]?.id ?? null)
      set({ tree, selectedSpaceId: next, loading: false })
    } catch (err) {
      console.error('Failed to load Stackboard tree', err)
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false })
    }
  },

  selectSpace: (id) => {
    prefs.setLastSpaceId(id)
    set({ selectedSpaceId: id })
  },
  setSearch: (q) => set({ search: q }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: { kind: 'none' } }),
  toggleSidebar: () =>
    set((s) => {
      prefs.setSidebarCollapsed(!s.sidebarCollapsed)
      return { sidebarCollapsed: !s.sidebarCollapsed }
    }),

  showToast: (t) => set({ toast: { ...t, id: ++cueSeq } }),
  celebrate: () => set((s) => ({ wins: s.wins + 1 })),
  dismissToast: (id) => set((s) => (s.toast?.id === id ? { toast: null } : {})),

  flashItem: (id) => {
    const cue = { id, seq: ++cueSeq }
    set({ flash: cue })
    // Clear it so a later remount (switching spaces and back) doesn't replay the glow.
    setTimeout(() => set((s) => (s.flash === cue ? { flash: null } : {})), CUE_MS)
  },

  revealStack: (spaceId, stackId) => {
    prefs.setLastSpaceId(spaceId)
    const cue = { id: stackId, seq: ++cueSeq }
    set({ selectedSpaceId: spaceId, search: '', reveal: cue })
    setTimeout(() => set((s) => (s.reveal === cue ? { reveal: null } : {})), CUE_MS)
  },

  setOpenTabs: (index) => set({ openTabs: index }),
  setOnboarding: (on) => set({ onboarding: on }),

  removeWithUndo: async (kind, id, title, detail) => {
    const snapshot = await snapshotNode(id)
    if (kind === 'space') await deleteSpace(id)
    else if (kind === 'stack') await deleteStack(id)
    else await deleteBookmark(id)
    await get().refresh()

    const restore = async () => {
      try {
        const newId = snapshot ? await restoreSnapshot(snapshot) : null
        await get().refresh()
        // Show what came back: select a space, scroll to a stack, glow a bookmark.
        if (newId && kind === 'space') get().selectSpace(newId)
        if (newId && kind === 'stack' && snapshot) get().revealStack(snapshot.parentId, newId)
        if (newId && kind === 'bookmark') get().flashItem(newId)
        get().showToast({ verb: 'Restored', title, detail, duration: NOTE_MS })
      } catch (err) {
        console.error('Undo failed', err)
        get().showToast({ verb: "Couldn't restore", title, duration: NOTE_MS * 2 })
      }
    }

    get().showToast({
      verb: 'Deleted',
      title,
      detail,
      duration: UNDO_MS,
      undo: snapshot ? restore : undefined,
    })
  },
}))

export type { ModalState }
