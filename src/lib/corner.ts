import { create } from 'zustand'
import { claimable, type CornerCard } from './nudgePlan'
import type { CompanyLocks } from './types'

// The bottom-right corner of a new tab (0.9.0): the what's-new notes, the trial-end recap, the
// reverse-trial card (0.9.2), "what stopped you?" (0.9.3), the December note (0.9.5) and the
// moment-of-need line take turns, one card at a time, and all of them wait while the rating ask is
// on screen. The tidy coach mark (0.9.6) takes its turn with them. The order is in nudgePlan.ts
// (CornerCard). Per page; nothing is stored.
//
// 0.9.6: the company's locks for these nudges, and for the rating ask, come from the policy's real
// answer (company.ts readLocksSettled, set here by the board's refresh), however long managed storage
// takes. The board's first paint can go ahead without it after 1.5 s; a nudge can't: until it's in,
// `locks` is null, the cards and the rating ask wait, and nothing can claim the corner.

export type MomentKind = 'stash' | 'bankruptcy'

interface Corner {
  holder: CornerCard | null
  /** The rating ask is showing (RatingPrompt): corner cards wait for it. */
  ratingOpen: boolean
  /** A moment line asked for by a stash or a bankruptcy on this tab, waiting to show. */
  moment: { kind: MomentKind; at: number } | null
  /** The policy's locks once it has answered (0.9.6); null until then. */
  locks: CompanyLocks | null
  claim: (card: CornerCard) => boolean
  release: (card: CornerCard) => void
  setRatingOpen: (open: boolean) => void
  requestMoment: (kind: MomentKind) => void
  clearMoment: () => void
  /** The policy answered (again, after a change). */
  settle: (locks: CompanyLocks) => void
}

export const useCorner = create<Corner>((set, get) => ({
  holder: null,
  ratingOpen: false,
  moment: null,
  locks: null,
  claim: (card) => {
    // Not before the policy has answered: a card deciding without it could miss a lock.
    if (!get().locks || !claimable(get().holder, card)) return false
    set({ holder: card })
    return true
  },
  release: (card) => {
    if (get().holder === card) set({ holder: null })
  },
  setRatingOpen: (open) => set({ ratingOpen: open }),
  requestMoment: (kind) => set({ moment: { kind, at: Date.now() } }),
  clearMoment: () => set({ moment: null }),
  settle: (locks) => {
    const now = get().locks
    // The same answer again (every refresh asks): no new object, so nothing re-renders for it.
    if (now && JSON.stringify(now) === JSON.stringify(locks)) return
    set({ locks })
  },
}))

/**
 * A dialog is up (0.9.6): a modal, the command bar, a shared stack to add, Tidy's notice or preview,
 * the rating ask, or the bankruptcy certificate. The tidy coach mark and the rating ask after a tidy
 * wait until there's none.
 */
export function dialogOnScreen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"], [data-certificate]')
}
