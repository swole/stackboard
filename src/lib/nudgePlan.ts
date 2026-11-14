import { ARCHIVE_AFTER } from './archivePlan'
import { FOUNDING_ENDS, LIFETIME_OFFER_PRICE, LIFETIME_PRICE, TRIAL_DAYS, checkoutPlan, type CheckoutPlan, type ProState } from './proPlan'
import { joinList } from './statsPlan'

// The trial-end recap and the moment-of-need line (0.9.0, the maintainer: "seamlessly convert free users
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
//   (components/WhyNotCard.tsx). Only an answer they pick leaves the device (lib/whyNot.ts). Since
//   0.9.4 The price brings the founding offer on Pro for life (whyNotOffersPrice).
// - The one-tap switches (0.9.4) turn on auto-archive and the Today strip from the reverse-trial
//   card and from Settings during any trial (trialSwitches), and the recap names what stops when
//   the trial ends (trialStopsLine).
// - The December note (0.9.5) says the $2.99 founding price ends on 31 Dec, to free and trial users
//   who aren't early users: once from 1 Dec and once in the last four days (foundingNote).
// - School mode: none of them ever shows while the company's pro lock is on (`lockPro`).

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export function trialEndsAt(startedAt: number): number {
  return startedAt + TRIAL_DAYS * DAY
}

/** "20 Nov": the trial's last day, as the reverse-trial card and the recap name it. */
function dayMonth(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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

/**
 * The recap's line after the numbers (0.9.4): what stops with the trial, from what's switched on.
 * Daily snapshots run whenever Pro or the trial is on; auto-archive and the Today strip are named
 * only while they're switched on. "When it ends on 20 Nov, auto-archive and daily snapshots stop.
 * Everything you made stays." Once it has ended: "Auto-archive and daily snapshots have stopped. ..."
 */
export function trialStopsLine(p: { card: TrialCard; trialStartedAt: number; archiveOn: boolean; stripOn: boolean }): string {
  const stops = joinList([...(p.archiveOn ? ['auto-archive'] : []), 'daily snapshots', ...(p.stripOn ? ['the Today strip'] : [])])
  if (p.card === 'ended') return `${stops[0].toUpperCase()}${stops.slice(1)} have stopped. Everything you made stays.`
  return `When it ends on ${dayMonth(trialEndsAt(p.trialStartedAt))}, ${stops} stop. Everything you made stays.`
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
  return `Pro is on, free until ${dayMonth(trialEndsAt(trialStartedAt))}`
}

/** `mac`: the command bar is ⌘K there, as in Settings > Keys. */
export function reverseCardLine(mac: boolean): string {
  return `Try ${mac ? '⌘K' : 'Ctrl+K'} to jump anywhere, a to-do list, or a colour on a stack. Everything you make stays when the trial ends.`
}

// ---------- One-tap switches during a trial (0.9.4) ----------
// Trial users buy at the end of a trial when Pro did something for them, but auto-archive and the
// Today strip stay off until someone finds them in Settings, so most trials end with little to
// show. The reverse-trial card and Settings > Stackboard Pro (during any trial) offer each in one
// tap, through the settings' own setters (components/TrialSwitches.tsx). Auto-archive goes to 12
// hours (DEFAULT_ARCHIVE_AFTER in archivePlan.ts, Arc's default).

export type TrialSwitch = 'archive' | 'strip'

export interface TrialSwitchView {
  key: TrialSwitch
  /** Switched on from here: the button says so now, and does nothing more. */
  on: boolean
  label: string
}

/**
 * The switches to show, auto-archive first: a button for each feature that's off, and once one is
 * switched on from here (`switched`), the same button saying it's on. A feature that was on already
 * gets none, so with both on there's nothing to show. `archiveAfter` is the auto-archive setting
 * (null when off); the line names its time, so it stays true when the time changes in Settings.
 */
export function trialSwitches(p: { archiveAfter: number | null; stripOn: boolean; switched: readonly TrialSwitch[] }): TrialSwitchView[] {
  const out: TrialSwitchView[] = []
  if (!p.archiveAfter) out.push({ key: 'archive', on: false, label: 'Turn on auto-archive' })
  else if (p.switched.includes('archive')) {
    // The setting only ever holds one of the choices in Settings (parseArchiveAfter).
    const after = ARCHIVE_AFTER.find((c) => c.ms === p.archiveAfter)?.label ?? '12 hours'
    out.push({ key: 'archive', on: true, label: `Auto-archive is on: idle tabs save themselves after ${after}` })
  }
  if (!p.stripOn) out.push({ key: 'strip', on: false, label: 'Show the Today strip' })
  else if (p.switched.includes('strip')) out.push({ key: 'strip', on: true, label: 'Today strip is on' })
  return out
}

// ---------- "What stopped you?" (0.9.3) ----------
// the maintainer, 8 Nov 2026: one optional question for someone who opened the checkout on this computer and
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
 * After The price (0.9.4; the maintainer, 10 Nov 2026: only someone who marks price as the issue sees the
 * discounted price): the founding offer, Pro for life for $9.99 on its own checkout link
 * (CHECKOUT.lifetimeOffer), until the founding price ends and never under the company's pro lock.
 * Nothing else offers it: Settings, the trial-end recap and the website keep $19.
 */
export function whyNotOffersPrice(p: { reason: WhyReason; now: number; lockPro?: boolean }): boolean {
  return p.reason === 'price' && p.now <= FOUNDING_ENDS && !p.lockPro
}

/** What the founding offer says under "Thanks, that helps." (0.9.4); 31 Dec is FOUNDING_ENDS in Singapore time. */
export const WHY_PRICE_OFFER = {
  line: `Here's a founding offer: Pro for life for ${LIFETIME_OFFER_PRICE} (usually ${LIFETIME_PRICE}), until 31 Dec.`,
  button: `Get Pro for life for ${LIFETIME_OFFER_PRICE}`,
} as const

// ---------- The December founding-price note (0.9.5) ----------
// the maintainer, 10 Nov 2026: $2.99 a year is the founding price for new buyers until 31 Dec 2026, 23:59
// Singapore time (FOUNDING_ENDS), and $4.99 after. A free or trial user who isn't an early user (they
// keep $2.99 whenever they buy, so never see it) gets one corner card from 1 Dec and one more in the
// last four days, on one new tab each, answered or not. Not on the welcome screen, not before a new
// install has settled in (the reverse-trial card's wait, so that card comes first), not while a
// checkout this computer opened is pending, and never under the company's pro lock. The card is
// components/FoundingNote.tsx; which windows it has shown in is kept on this computer.

/** 1 Dec 2026, 00:00 Singapore time: the first window opens. */
export const FOUNDING_NOTE_FROM = Date.parse('2026-11-30T16:00:00Z')
/** 28 Dec 2026, 00:00 Singapore time: the last four days before FOUNDING_ENDS, the second window. */
export const FOUNDING_LAST_DAYS_FROM = Date.parse('2026-12-27T16:00:00Z')
/** It decides this long after the board and Pro are ready: after "what stopped you?", so it goes last. */
export const FOUNDING_NOTE_DELAY_MS = 2500

export type FoundingWindow = 'december' | 'last-days'

/** The window `now` is in: from 1 Dec, then the last four days; null before 1 Dec and once the founding price ends. */
export function foundingWindow(now: number): FoundingWindow | null {
  if (now < FOUNDING_NOTE_FROM || now > FOUNDING_ENDS) return null
  return now >= FOUNDING_LAST_DAYS_FROM ? 'last-days' : 'december'
}

/** The window this tab shows the note for, or null. */
export function foundingNote(p: {
  state: ProState
  /** Installed before Pro: the early price, whenever they buy. */
  early: boolean
  now: number
  /** The window it last showed in on this computer. */
  shown: FoundingWindow | null
  /** New tabs on this computer, this one included. */
  opens: number
  /** This computer's first new tab. */
  firstSeen: number
  /** The empty-board welcome screen is up. */
  welcoming: boolean
  checkoutPending: boolean
  lockPro?: boolean
}): FoundingWindow | null {
  if (p.early || p.lockPro || p.welcoming || p.checkoutPending) return null
  if (p.state.kind !== 'free' && p.state.kind !== 'trial') return null
  if (p.opens < REVERSE_CARD_OPENS || p.now - p.firstSeen < REVERSE_CARD_WAIT_MS) return null
  const w = foundingWindow(p.now)
  return w && p.shown !== w && p.shown !== 'last-days' ? w : null
}

/** What the note says; See Pro opens Settings at Stackboard Pro. */
export const FOUNDING_NOTE = {
  title: '$2.99 a year ends on 31 Dec',
  line: 'After that Pro is $4.99 a year. If you join before then, it stays $2.99 while you keep Pro.',
  button: 'See Pro',
} as const

/**
 * When two are due on one tab, they go in this order: the what's-new notes and the trial recap
 * claim the corner as the board loads; the reverse-trial card decides REVERSE_CARD_DELAY_MS later,
 * so it steps aside for them, and skips a tab where the rating ask is up; "what stopped you?"
 * (0.9.3) decides WHY_NOT_DELAY_MS after load, the same way; the December note (0.9.5) decides
 * FOUNDING_NOTE_DELAY_MS after load and also steps aside for a moment line that's waiting, so it goes
 * last; the moment line waits for a stash or a bankruptcy. The tidy coach mark (0.9.6) sits on the
 * Tidy button rather than in the corner, but takes its turn the same way after an import: it waits
 * for the holder to let go, and the cards wait for it.
 */
export type CornerCard = 'whatsNew' | 'trialEnd' | 'reverseTrial' | 'whyNot' | 'founding' | 'moment' | 'tidyCoach'

/** The bottom-right corner holds one card at a time; the holder can claim it again. */
export function claimable(holder: CornerCard | null, card: CornerCard): boolean {
  return holder === null || holder === card
}
