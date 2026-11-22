import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { REVEAL_KEY, revealDue } from './revealPlan'

// The first-run reveal's state on this tab (0.9.9). 'show': the preview is up (Reveal.tsx), so the
// floating "Keep it" hint stays away; it says the same thing itself. 'finish': the board is written and
// the "Make it yours" sheet (looks, open tabs) sits over it until Done.

export type RevealPhase = 'off' | 'show' | 'finish'

interface RevealState {
  phase: RevealPhase
  /** The space the reveal wrote: Undo deletes it, Done points the tidy coach at it. */
  spaceId: string | null
  set: (patch: Partial<Pick<RevealState, 'phase' | 'spaceId'>>) => void
}

export const useReveal = create<RevealState>((set) => ({
  phase: 'off',
  spaceId: null,
  set: (patch) => set(patch),
}))

/** Whether this install still gets the reveal; an old mark is cleared on the way. */
export async function readRevealDue(): Promise<boolean> {
  if (!IS_EXTENSION) return false
  const got = await chrome.storage.local.get(REVEAL_KEY)
  const due = revealDue(got[REVEAL_KEY])
  if (!due && got[REVEAL_KEY] !== undefined) await chrome.storage.local.remove(REVEAL_KEY)
  return due
}

/** The reveal is over on this computer: kept, passed over, or nothing to show. */
export async function endReveal(): Promise<void> {
  if (IS_EXTENSION) await chrome.storage.local.remove(REVEAL_KEY).catch(() => {})
}

/** Undo after "Use this board": the empty board opens on the reveal again. */
export async function restartReveal(): Promise<void> {
  if (IS_EXTENSION) await chrome.storage.local.set({ [REVEAL_KEY]: Date.now() }).catch(() => {})
}
