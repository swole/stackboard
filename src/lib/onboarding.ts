import { IS_EXTENSION } from './bookmarks'
import { prefs } from './prefs'
import type { StackableTree } from './types'

// First-run and later-life nudges (0.4.0). Everything is counted on this device only.

export const STORE_URL = 'https://chromewebstore.google.com/detail/bgcedhchngcopaefchpkbhioagknnpma'
export const REVIEWS_URL = `${STORE_URL}/reviews`
export const SHARE_URL = `${STORE_URL}?utm_source=extension&utm_medium=share&utm_campaign=settings-share`

const DAY = 24 * 60 * 60 * 1000

/** This page load, counted once when the module is first imported. */
export const visit = IS_EXTENSION ? prefs.countOpen() : { opens: 0, firstSeen: Date.now() }

// ---------- "Keep it" hint ----------
// Chrome asks "Change back to Google?" the first time an extension's new tab page shows up;
// one click on the wrong button quietly undoes the install. The background worker marks a
// fresh install (FRESH_KEY), and the first few new tabs explain the prompt.

export const FRESH_KEY = 'stackboardFresh'
const HINT_TABS = 3

export async function shouldShowKeepHint(now = Date.now()): Promise<boolean> {
  if (!IS_EXTENSION) return false
  const got = await chrome.storage.local.get(FRESH_KEY)
  const at = Number(got[FRESH_KEY]) || 0
  if (!at) return false
  if (now - at > DAY || prefs.bumpKeepHint() > HINT_TABS) {
    await chrome.storage.local.remove(FRESH_KEY)
    return false
  }
  return true
}

export async function dismissKeepHint(): Promise<void> {
  if (IS_EXTENSION) await chrome.storage.local.remove(FRESH_KEY)
}

// ---------- One-time rating ask ----------

// 0.4.1: ask sooner (3 days, 15 tabs) and at a happy moment: right after an import, a starter
// pack or a stash lands. Without one, a plain new tab asks after 25.
export const RATING_MIN_OPENS = 15
export const RATING_MIN_DAYS = 3
export const RATING_LOAD_OPENS = 25

export function linkCount(tree: StackableTree | null): number {
  return tree ? tree.spaces.reduce((n, s) => n + s.stacks.reduce((m, st) => m + st.bookmarks.length, 0), 0) : 0
}

/**
 * When this person started using Stackboard: the earlier of the first counted new tab and the
 * creation date of the Stackboard bookmarks folder. 0.4.0 only started counting, so long-time
 * users would otherwise wait out the whole period again after updating.
 */
export function installedAt(firstSeen: number, rootDateAdded?: number): number {
  return rootDateAdded && rootDateAdded > 0 && rootDateAdded < firstSeen ? rootDateAdded : firstSeen
}

/**
 * Ask once, on a board with links in it, after 3 days of use: right after something went well
 * ('win', from 15 new tabs) or on a plain new tab ('load', from 25).
 */
export function shouldAskForRating(p: {
  opens: number
  firstSeen: number
  now: number
  answered: boolean
  links: number
  trigger?: 'load' | 'win'
}): boolean {
  const minOpens = p.trigger === 'win' ? RATING_MIN_OPENS : RATING_LOAD_OPENS
  return (
    !p.answered &&
    p.links > 0 &&
    p.opens >= minOpens &&
    p.now - p.firstSeen >= RATING_MIN_DAYS * DAY
  )
}
