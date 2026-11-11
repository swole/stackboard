import { create } from 'zustand'
import { claimable, type CornerCard } from './nudgePlan'

// The bottom-right corner of a new tab (0.9.0): the what's-new notes, the trial-end recap, the
// reverse-trial card (0.9.2), "what stopped you?" (0.9.3), the December note (0.9.5) and the
// moment-of-need line take turns, one card at a time, and all of them wait while the rating ask is
// on screen. The order is in nudgePlan.ts (CornerCard).
// Per page; nothing is stored.

export type MomentKind = 'stash' | 'bankruptcy'

interface Corner {
  holder: CornerCard | null
  /** The rating ask is showing (RatingPrompt): corner cards wait for it. */
  ratingOpen: boolean
  /** A moment line asked for by a stash or a bankruptcy on this tab, waiting to show. */
  moment: { kind: MomentKind; at: number } | null
  claim: (card: CornerCard) => boolean
  release: (card: CornerCard) => void
  setRatingOpen: (open: boolean) => void
  requestMoment: (kind: MomentKind) => void
  clearMoment: () => void
}

export const useCorner = create<Corner>((set, get) => ({
  holder: null,
  ratingOpen: false,
  moment: null,
  claim: (card) => {
    if (!claimable(get().holder, card)) return false
    set({ holder: card })
    return true
  },
  release: (card) => {
    if (get().holder === card) set({ holder: null })
  },
  setRatingOpen: (open) => set({ ratingOpen: open }),
  requestMoment: (kind) => set({ moment: { kind, at: Date.now() } }),
  clearMoment: () => set({ moment: null }),
}))
