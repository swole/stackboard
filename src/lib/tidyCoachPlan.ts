import type { ProState } from './proPlan'
import { TIDY_MAX_LINKS, tidyAccess, type TidyAccess } from './tidyPlan'

// The tidy coach mark (0.9.6). The maintainer, 12 Nov 2026: hardly anyone finds the free tidy, so right after
// people bring their bookmarks in, point them at it, and the first minute shows a messy pile sorting
// itself. Pure, so tests/unit.test.ts covers the rules; the mark is components/TidyCoach.tsx, which
// TidyButton renders beside its button, and its page state is lib/tidyCoach.ts.
//
// - An import (the welcome screen's, or Settings > Copy from Chrome bookmarks: both are ImportPanel)
//   that lands a space holding TIDY_COACH_MIN_LINKS to TIDY_MAX_LINKS links points at that space's
//   Tidy button. Of several new spaces, the one with the most links (the first of equals), which the
//   import then selects.
// - Only for someone Tidy is open to (tidyAccess: the free tidy unused, or a paid key), and never
//   under the company's ai or pro lock, a paid key included: school mode keeps prompts away.
// - Once per Chrome profile: localStorage on each computer (prefs.tidyCoachShown), written when the
//   mark shows. Sync storage would add an item the privacy page's list of synced settings doesn't name.
// - It waits for the server's readiness answer (checkReady in lib/tidy.ts: the last answer if it's
//   under a day old, else one GET with nothing about the person in it) and shows nothing when Tidy is
//   off or the server can't be reached. Then it waits for a free screen: no dialog, no rating ask, and
//   the corner's turn (corner.ts), as the corner cards take theirs.

/** Below this many links an import gets no coach mark (Tidy itself starts at TIDY_MIN_LINKS). */
export const TIDY_COACH_MIN_LINKS = 15
/**
 * It shows this long after the import at the earliest, so the copy toast lands first and a rating
 * ask the import brings (RATING_WIN_DELAY_MS in onboarding.ts) is on screen before it, never after.
 */
export const TIDY_COACH_DELAY_MS = 2000

/** A space an import just made, with its links as Tidy counts them (tidyInput). */
export interface ImportedSpace {
  id: string
  links: number
}

/** The space to point at: the most links within the limits, the first of equals; null when none fits. */
export function coachSpace(spaces: readonly ImportedSpace[]): string | null {
  let best: ImportedSpace | null = null
  for (const s of spaces) {
    if (s.links < TIDY_COACH_MIN_LINKS || s.links > TIDY_MAX_LINKS) continue
    if (!best || s.links > best.links) best = s
  }
  return best?.id ?? null
}

/**
 * Who can press Tidy (tidyAccess), or undefined while that can't be told yet: Pro still loading, a
 * key on its first check, or the free tidy not read yet (on the welcome screen nothing has read it).
 */
export function coachAccess(p: {
  proReady: boolean
  state: ProState
  activated: boolean
  freeUsed: boolean | null
  lockAi: boolean
  lockPro: boolean
}): TidyAccess | undefined {
  if (p.lockAi) return null
  if (!p.proReady) return undefined
  if (p.state.kind === 'paused' && p.state.reason === 'checking') return undefined
  if (p.state.kind !== 'pro' && !p.lockPro && p.freeUsed === null) return undefined
  return tidyAccess(p)
}

/**
 * The space the coach mark points at after an import, or null. `access` undefined (not known yet)
 * still names the space, and the mark waits until it's known; null means nobody here can press Tidy.
 */
export function tidyCoach(p: {
  spaces: readonly ImportedSpace[]
  access: TidyAccess | undefined
  /** The mark has shown on this Chrome profile before. */
  shown: boolean
  lockAi: boolean
  lockPro: boolean
}): string | null {
  if (p.shown || p.lockAi || p.lockPro || p.access === null) return null
  return coachSpace(p.spaces)
}

/** What the mark says. */
export const TIDY_COACH = {
  title: 'Want these sorted?',
  body: 'Tidy reads the titles and links in this space and sorts them into stacks. You can undo it.',
  /** Only while the free tidy is what Tidy runs on. */
  free: 'Your first one is free.',
  sort: 'Sort them for me',
  later: 'Not now',
} as const

/** The body: a paid key drops the line about the free one. */
export function coachBody(access: 'paid' | 'free'): string {
  return access === 'free' ? `${TIDY_COACH.body} ${TIDY_COACH.free}` : TIDY_COACH.body
}
