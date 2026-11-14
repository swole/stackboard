import { create } from 'zustand'
import type { StackableTree } from '../lib/types'
import type { StackColor } from '../lib/stackStylePlan'
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
import { readCompany, readLocksSettled, withCompany } from '../lib/company'
import { useCorner } from '../lib/corner'
import { setFolderOpen } from '../lib/folderPlan'
import { appearanceSettled, setPolicyAccent } from './useAppearance'
import { mirroredRules } from '../lib/spaceSchedule'
import { scheduledSpace } from '../lib/schedulePlan'
import { setProLock } from '../lib/pro'

type ModalState =
  | { kind: 'none' }
  | { kind: 'space-add' }
  | { kind: 'space-edit'; id: string; name: string; emoji: string; focusField?: 'emoji' | 'name' }
  | { kind: 'stack-add'; spaceId: string }
  | { kind: 'stack-edit'; id: string; title: string }
  /** A folder inside a stack, or inside another folder (0.8.0). */
  | { kind: 'folder-add'; parentId: string }
  | { kind: 'folder-edit'; id: string; title: string }
  | { kind: 'stack-move'; id: string; title: string; currentSpaceId: string }
  /** A stack's colour and icon (Pro colours, 0.9.0). */
  | { kind: 'stack-style'; id: string; title: string; color: StackColor | null }
  | { kind: 'bookmark-add'; stackId: string }
  | { kind: 'bookmark-edit'; id: string; title: string; url: string; stackId: string }
  | { kind: 'confirm-delete'; targetKind: 'space' | 'stack' | 'bookmark'; id: string; name: string; childCount: number }
  | { kind: 'settings' }
  | { kind: 'import' }
  | { kind: 'packs' }
  | { kind: 'cleanup' }

export interface ToastState {
  id: number
  verb: string
  title: string
  detail?: string
  /** ms before it dismisses itself; the undo countdown pauses while hovered */
  duration: number
  undo?: () => Promise<void>
  /** 0.9.5: a second line ending on a link, as after the free tidy */
  note?: { text: string; link: string; onLink: () => void }
}

/** A one-shot cue for a single item: `seq` changes each time so effects replay. */
export interface Cue {
  id: string
  seq: number
}

type DeletableKind = 'space' | 'stack' | 'folder' | 'bookmark'

interface StackableState {
  tree: StackableTree | null
  loading: boolean
  error: string | null
  selectedSpaceId: string | null
  /** The Today list (Pro, 0.7.1) is on screen in place of the selected space. */
  todayView: boolean
  search: string
  modal: ModalState
  sidebarCollapsed: boolean
  /** Folders inside stacks that are open on this device (0.8.0); every other folder shows folded. */
  openFolders: ReadonlySet<string>
  toast: ToastState | null
  /** Glow an item (bookmark, folder, stack or space row) where it sits. */
  flash: Cue | null
  /** Scroll a stack into view, then glow it. */
  reveal: Cue | null
  openTabs: OpenTabIndex | null
  /** True while the welcome screen is filling an empty board, so it stays up until done. */
  onboarding: boolean
  /**
   * Someone with no spaces of their own picked a company space (or the company's start-here space
   * opened): show it in place of the welcome screen. Company spaces alone never skip the welcome.
   */
  companyChosen: boolean
  /** Bumped when something goes well (import, starter pack, stash): a good moment to ask for a rating (0.4.1). */
  wins: number
  /** Bumped at a rating milestone: the first saved certificate or the third stash (0.5.3). */
  milestones: number
  /**
   * Bumped when a tidy is applied (0.9.6): a rating milestone once nothing else is on screen
   * (RatingPrompt). The tidy is also kept in localStorage (prefs.tidyWin) until the ask takes it.
   */
  tidied: number

  refresh: () => Promise<void>
  selectSpace: (id: string | null) => void
  /** Shows the Today list; picking a space (or a jump to a stack) leaves it. */
  showToday: () => void
  setSearch: (q: string) => void
  openModal: (m: ModalState) => void
  closeModal: () => void
  toggleSidebar: () => void
  toggleFolder: (id: string) => void
  /** Opens these folders (a link landing in one, a search hit inside one). */
  unfoldFolders: (ids: string[]) => void
  showToast: (t: Omit<ToastState, 'id'>) => void
  /** "Couldn't <what> (<error>)": a failed write must never look like nothing happened. */
  reportError: (what: string, err: unknown) => void
  dismissToast: (id: number) => void
  flashItem: (id: string) => void
  /** Shows the space, then scrolls the stack (or a folder inside one, once it's open) into view and glows it. */
  revealStack: (spaceId: string, stackId: string) => void
  setOpenTabs: (index: OpenTabIndex) => void
  setOnboarding: (on: boolean) => void
  celebrate: () => void
  reachMilestone: () => void
  /** A tidy was applied (0.9.6); its Undo takes it back with prefs.clearTidyWin. */
  noteTidied: () => void
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
  todayView: false,
  search: '',
  modal: { kind: 'none' },
  sidebarCollapsed: prefs.sidebarCollapsed(),
  openFolders: new Set(prefs.openFolders()),
  toast: null,
  flash: null,
  reveal: null,
  openTabs: null,
  onboarding: false,
  companyChosen: false,
  wins: 0,
  milestones: 0,
  tidied: 0,

  refresh: async () => {
    try {
      set({ loading: true, error: null })
      // Teams (0.8.0): the company's read-only spaces from Chrome policy go first. The board also
      // waits for the saved settings when there was no boot copy, so it shows in its own layout.
      // 0.9.6: what a lock can veto (Pro's trial, the corner cards, the rating ask, the coach mark)
      // waits for the policy's real answer, however long managed storage takes; the paint below
      // doesn't, and goes ahead after 1.5 s with the locks the policy last had.
      void readLocksSettled().then((locks) => {
        setProLock(locks.pro)
        useCorner.getState().settle(locks)
      })
      const [own, company] = await Promise.all([readTree(), readCompany().catch(() => null), appearanceSettled])
      const tree = withCompany(own, company)
      // Teams T8: the company's accent shows for everyone while the policy sets it.
      setPolicyAccent(company?.config.brand?.accent ?? null)
      const has = (id: string | null) => !!id && tree.spaces.some((s) => s.id === id)
      const current = get().selectedSpaceId
      const remembered = prefs.lastSpaceId()
      // Teams T7: the first time this device shows company spaces, it opens on the onboarding space.
      const startHere = !!company?.startHereId && has(company.startHereId)
      // Pro (0.9.0): a new tab opens on the space its time rules name; only the first load, so
      // nothing switches under someone looking at the board. It doesn't become the remembered space.
      const scheduled = current === null ? scheduledSpace(mirroredRules(), tree.spaces, new Date()) : null
      const next = startHere
        ? company!.startHereId
        : has(current)
          ? current
          : scheduled
            ? scheduled
            : has(remembered)
              ? remembered
              : (tree.spaces[0]?.id ?? null)
      set({ tree, selectedSpaceId: next, loading: false, ...(startHere ? { companyChosen: true } : {}) })
    } catch (err) {
      console.error('Failed to load Stackboard tree', err)
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false })
    }
  },

  selectSpace: (id) => {
    prefs.setLastSpaceId(id)
    const company = !!id && !!get().tree?.spaces.find((s) => s.id === id)?.company
    set({ selectedSpaceId: id, todayView: false, ...(company ? { companyChosen: true } : {}) })
  },
  showToday: () => set({ todayView: true, search: '' }),
  setSearch: (q) => set({ search: q }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: { kind: 'none' } }),
  toggleSidebar: () =>
    set((s) => {
      prefs.setSidebarCollapsed(!s.sidebarCollapsed)
      return { sidebarCollapsed: !s.sidebarCollapsed }
    }),
  toggleFolder: (id) =>
    set((s) => {
      const list = setFolderOpen([...s.openFolders], id, !s.openFolders.has(id))
      prefs.setOpenFolders(list)
      return { openFolders: new Set(list) }
    }),
  unfoldFolders: (ids) =>
    set((s) => {
      if (ids.every((id) => s.openFolders.has(id))) return {}
      const list = ids.reduce((l, id) => setFolderOpen(l, id, true), [...s.openFolders])
      prefs.setOpenFolders(list)
      return { openFolders: new Set(list) }
    }),

  showToast: (t) => set({ toast: { ...t, id: ++cueSeq } }),
  reportError: (what, err) => {
    console.error(`Couldn't ${what}`, err)
    const detail = (err instanceof Error ? err.message : String(err ?? '')).trim().slice(0, 140)
    get().showToast({ verb: "Couldn't", title: what, detail: detail || undefined, duration: 10000 })
  },
  celebrate: () => set((s) => ({ wins: s.wins + 1 })),
  reachMilestone: () => set((s) => ({ milestones: s.milestones + 1 })),
  noteTidied: () => {
    prefs.setTidyWin(Date.now())
    set((s) => ({ tidied: s.tidied + 1 }))
  },
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
    set({ selectedSpaceId: spaceId, todayView: false, search: '', reveal: cue })
    setTimeout(() => set((s) => (s.reveal === cue ? { reveal: null } : {})), CUE_MS)
  },

  setOpenTabs: (index) => set({ openTabs: index }),
  setOnboarding: (on) => set({ onboarding: on }),

  removeWithUndo: async (kind, id, title, detail) => {
    let snapshot: Awaited<ReturnType<typeof snapshotNode>>
    try {
      snapshot = await snapshotNode(id) // the whole subtree: a stack's folders and their links come back too
      if (kind === 'space') await deleteSpace(id)
      else if (kind === 'stack' || kind === 'folder') await deleteStack(id)
      else await deleteBookmark(id)
    } catch (err) {
      get().reportError(`delete ${title}`, err)
      return
    }
    await get().refresh()

    const restore = async () => {
      try {
        const ids = new Map<string, string>()
        const newId = snapshot ? await restoreSnapshot(snapshot, ids) : null
        await get().refresh()
        // Folders that were open come back open under their new ids (0.8.0), the ones inside too.
        const open = get().openFolders
        get().unfoldFolders([...ids].filter(([was]) => open.has(was)).map(([, now]) => now))
        // Show what came back: select a space, scroll to a stack, glow a folder or a bookmark.
        if (newId && kind === 'space') get().selectSpace(newId)
        if (newId && kind === 'stack' && snapshot) get().revealStack(snapshot.parentId, newId)
        if (newId && (kind === 'bookmark' || kind === 'folder')) get().flashItem(newId)
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
