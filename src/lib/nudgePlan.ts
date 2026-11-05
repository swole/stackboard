import { TRIAL_DAYS, type ProState } from './proPlan'

// The trial-end recap and the moment-of-need line (0.9.0, goal: "seamlessly convert free users
// to pro"): who sees which, and what it says. Pure, so tests/unit.test.ts covers the rules. The
// cards live in components/TrialEndCard.tsx and components/MomentLine.tsx; the corner they share
// with the what's-new notes is lib/corner.ts.
//
// - The recap shows in the trial's last two days and on the first tabs after it ends (within a
//   week), on at most TRIAL_CARD_SHOWS new tabs each, and retires when answered (counter -1).
//   Never for a paid key, and not while a checkout this computer opened is still pending.
// - The moment line shows to free users right after "Stash and close" lands and after a tab
//   bankruptcy certificate closes, on the first MOMENT_SHOWS occasions only.
// - School mode: neither ever shows while the company's pro lock is on (`lockPro`).

const DAY = 24 * 60 * 60 * 1000

export function trialEndsAt(startedAt: number): number {
  return startedAt + TRIAL_DAYS * DAY
}

export const TRIAL_CARD_SHOWS = 2
/** The ending card shows once the trial has this many days or fewer left (rounded up). */
export const TRIAL_ENDING_DAYS = 2
/** The ended card shows only this soon after the end, so an old trial never comes back as news. */
export const TRIAL_ENDED_WINDOW_MS = 7 * DAY
export const MOMENT_SHOWS = 3

export type TrialCard = 'ending' | 'ended'

/** A card that hasn't been answered and hasn't used up its new tabs. */
function pending(shows: number): boolean {
  return shows >= 0 && shows < TRIAL_CARD_SHOWS
}

export function pickTrialCard(p: {
  state: ProState
  trialStartedAt: number | null
  now: number
  endingShows: number
  endedShows: number
  checkoutPending: boolean
  lockPro?: boolean
}): TrialCard | null {
  if (!p.trialStartedAt || p.checkoutPending || p.lockPro) return null
  if (p.state.kind === 'trial') return p.state.daysLeft <= TRIAL_ENDING_DAYS && pending(p.endingShows) ? 'ending' : null
  if (p.state.kind !== 'free') return null
  const since = p.now - trialEndsAt(p.trialStartedAt)
  return since >= 0 && since <= TRIAL_ENDED_WINDOW_MS && pending(p.endedShows) ? 'ended' : null
}

/** Calendar days from `now` to `at` on the local clock: 0 today, 1 tomorrow. */
export function daysUntil(at: number, now: number): number {
  const a = new Date(at)
  const b = new Date(now)
  const ma = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const mb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((ma - mb) / DAY)
}

export function trialCardTitle(card: TrialCard, trialStartedAt: number, now: number): string {
  if (card === 'ended') return 'Your Pro trial has ended'
  const d = daysUntil(trialEndsAt(trialStartedAt), now)
  if (d <= 0) return 'Your Pro trial ends today'
  if (d === 1) return 'Your Pro trial ends tomorrow'
  return `Your Pro trial ends in ${d} days`
}

export interface MomentLine {
  text: string
  /** The last words, shown as the link to Settings > Stackboard Pro. */
  link: string
}

/** The line after a stash or a bankruptcy: free users only, the first MOMENT_SHOWS times. */
export function momentLine(p: { state: ProState; shown: number; lockPro?: boolean }): MomentLine | null {
  if (p.lockPro || p.state.kind !== 'free' || p.shown < 0 || p.shown >= MOMENT_SHOWS) return null
  return p.state.trialUsed
    ? { text: 'Auto-archive does this while you work.', link: "It's part of Pro." }
    : { text: 'Auto-archive can do this while you work: idle tabs save themselves.', link: 'Try Pro free for 14 days.' }
}

export type CornerCard = 'whatsNew' | 'trialEnd' | 'moment'

/** The bottom-right corner holds one card at a time; the holder can claim it again. */
export function claimable(holder: CornerCard | null, card: CornerCard): boolean {
  return holder === null || holder === card
}
