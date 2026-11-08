import { TRIAL_DAYS, checkoutPlan, type CheckoutPlan, type ProState } from './proPlan'

// The trial-end recap and the moment-of-need line (0.9.0: "seamlessly convert free users
// to pro"): who sees which, and what it says. Pure, so tests/unit.test.ts covers the rules. The
// cards live in components/TrialEndCard.tsx and components/MomentLine.tsx; the corner they share
// with the what's-new notes is lib/corner.ts.
//
// - The recap shows in the trial's last two days and on the first tabs after it ends (within a
//   week), on at most TRIAL_CARD_SHOWS new tabs each, and retires when answered (counter -1).
//   Never for a paid key, and not while a checkout this computer opened is still pending.
// - The moment line shows to free users right after "Stash and close" lands and after a tab
//   bankruptcy certificate closes, on the first MOMENT_SHOWS occasions only.
// - The reverse-trial card (0.9.2) tells a new install that Pro is on for its first 14 days, once
//   they've settled in: from the board's third new tab and 20 hours after install, while at least
//   3 days are left, on two new tabs at most, retired when answered. Never on the welcome screen
//   or while a checkout this computer opened is pending.
// - "What stopped you?" (0.9.3) asks someone who opened the checkout on this computer 10 minutes
//   to 7 days ago and came back without buying, once per checkout and on three checkouts at most
//   (components/WhyNotCard.tsx). Only an answer they pick leaves the device (lib/whyNot.ts).
// - School mode: none of them ever shows while the company's pro lock is on (`lockPro`).

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

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

export const REVERSE_CARD_SHOWS = 2
/** The card waits for this many new tabs on this computer, the one it shows on included. */
export const REVERSE_CARD_OPENS = 3
/** ...and this long after install: the trial's start, or this computer's first new tab if that came later. */
export const REVERSE_CARD_WAIT_MS = 20 * HOUR
/** It stops once the trial has fewer days left than this; the trial-end recap takes over at 2. */
export const REVERSE_CARD_DAYS = 3
/** It decides this long after the board and Pro are ready, so the cards that decide on load go first. */
export const REVERSE_CARD_DELAY_MS = 1500

/** The reverse-trial card (0.9.2): only for a trial that started by itself on install. */
export function showReverseCard(p: {
  state: ProState
  /** sync proTrial.auto */
  trialAuto: boolean
  trialStartedAt: number | null
  /** This computer's first new tab. */
  firstSeen: number
  /** New tabs on this computer, this one included. */
  opens: number
  shows: number
  now: number
  /** The empty-board welcome screen is up. */
  welcoming: boolean
  checkoutPending: boolean
  lockPro?: boolean
}): boolean {
  if (!p.trialAuto || !p.trialStartedAt || p.welcoming || p.checkoutPending || p.lockPro) return false
  if (p.state.kind !== 'trial' || p.state.daysLeft < REVERSE_CARD_DAYS || p.opens < REVERSE_CARD_OPENS) return false
  if (p.now - Math.max(p.trialStartedAt, p.firstSeen) < REVERSE_CARD_WAIT_MS) return false
  return p.shows >= 0 && p.shows < REVERSE_CARD_SHOWS
}

/** "Pro is on, free until 20 Nov"; also the line once "what stopped you?" starts the trial (0.9.3). */
export function reverseCardTitle(trialStartedAt: number): string {
  return `Pro is on, free until ${new Date(trialEndsAt(trialStartedAt)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

/** `mac`: the command bar is ⌘K there, as in Settings > Keys. */
export function reverseCardLine(mac: boolean): string {
  return `Try ${mac ? '⌘K' : 'Ctrl+K'} to jump anywhere, a to-do list, or a colour on a stack. Everything you make stays when the trial ends.`
}

// ---------- "What stopped you?" (0.9.3) ----------
// one optional question for someone who opened the checkout on this computer and
// came back without buying, to learn why checkouts don't turn into purchases. Five one-tap answers,
// and a line to type with Something else. site/api/why.js keeps the answer with nothing that
// identifies the person.

/** It waits this long after the checkout opened, so it never asks someone who's still paying... */
export const WHY_NOT_AFTER_MS = 10 * 60 * 1000
/** ...and stops this long after it: an old checkout isn't news. */
export const WHY_NOT_WITHIN_MS = 7 * DAY
/** Checkouts it asks about on this computer, ever. */
export const WHY_NOT_MAX = 3
/** It decides this long after the board and Pro are ready: after the reverse-trial card, so it goes last. */
export const WHY_NOT_DELAY_MS = 2000
/** After an answer the thanks stays this long, then the card closes itself. */
export const WHY_NOT_THANKS_MS = 4000
/** The most Something else sends, as site/api/why.js keeps. */
export const WHY_NOTE_MAX = 300

export type WhyReason = 'looking' | 'try-first' | 'price' | 'payment' | 'other'

/** The answers in the card's order; the reasons are the words site/api/why.js accepts. */
export const WHY_REASONS: readonly { reason: WhyReason; label: string }[] = [
  { reason: 'looking', label: 'Just looking' },
  { reason: 'try-first', label: 'Want to try it first' },
  { reason: 'price', label: 'The price' },
  { reason: 'payment', label: 'Payment method' },
  { reason: 'other', label: 'Something else' },
]

/**
 * Whether this tab asks. Only where Settings sells Pro (free, the trial, a key whose plan ended): a
 * paid key means they bought, and so does a key that's still being checked or has a problem.
 */
export function showWhyNot(p: {
  state: ProState
  /** When this computer last opened the checkout (cleared once Pro is on). */
  checkoutAt: number | null
  now: number
  /** The checkout the card last asked about, by its checkoutAt; 0 for none. */
  askedAt: number
  /** Checkouts it has asked about on this computer. */
  asked: number
  /** The empty-board welcome screen is up. */
  welcoming: boolean
  /** The rating ask is on screen. */
  ratingOpen: boolean
  lockPro?: boolean
}): boolean {
  if (!p.checkoutAt || p.welcoming || p.ratingOpen || p.lockPro) return false
  const s = p.state
  if (!(s.kind === 'free' || s.kind === 'trial' || (s.kind === 'paused' && s.reason === 'ended'))) return false
  const since = p.now - p.checkoutAt
  if (since < WHY_NOT_AFTER_MS || since > WHY_NOT_WITHIN_MS) return false
  return p.askedAt !== p.checkoutAt && p.asked < WHY_NOT_MAX
}

/** What a picked answer sends, and nothing else (site/api/why.js). */
export interface WhyAnswer {
  reason: WhyReason
  /** What they typed with Something else; empty for the other answers. */
  note: string
  plan: CheckoutPlan
  /** The checkout they looked at: the yearly plan or Pro for life. */
  product: 'yearly' | 'lifetime'
  /** The Stackboard version. */
  v: string
}

export function whyAnswer(p: { reason: WhyReason; note?: string; state: ProState; trialAuto: boolean; lifetime: boolean; version: string }): WhyAnswer {
  return {
    reason: p.reason,
    note: p.reason === 'other' ? (p.note ?? '').trim().slice(0, WHY_NOTE_MAX) : '',
    plan: checkoutPlan(p.state, p.trialAuto),
    product: p.lifetime ? 'lifetime' : 'yearly',
    v: p.version,
  }
}

/** After Want to try it first: the trial, when it has never been used here and the company allows it. */
export function whyNotOffersTrial(p: { reason: WhyReason; trialStartedAt: number | null; lockPro?: boolean }): boolean {
  return p.reason === 'try-first' && !p.trialStartedAt && !p.lockPro
}

/**
 * When two are due on one tab, they go in this order: the what's-new notes and the trial recap
 * claim the corner as the board loads; the reverse-trial card decides REVERSE_CARD_DELAY_MS later,
 * so it steps aside for them, and skips a tab where the rating ask is up; "what stopped you?"
 * (0.9.3) decides WHY_NOT_DELAY_MS after load, the same way, and so goes last; the moment line
 * waits for a stash or a bankruptcy.
 */
export type CornerCard = 'whatsNew' | 'trialEnd' | 'reverseTrial' | 'whyNot' | 'moment'

/** The bottom-right corner holds one card at a time; the holder can claim it again. */
export function claimable(holder: CornerCard | null, card: CornerCard): boolean {
  return holder === null || holder === card
}
