import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { RATING_WIN_DELAY_MS, REVIEWS_URL, installedAt, linkCount, shouldAskForRating, tidyRatingStep, visit } from '../lib/onboarding'
import { prefs } from '../lib/prefs'
import { openInNewTab } from '../lib/tabs'
import { dialogOnScreen, useCorner } from '../lib/corner'

/** How often a tidy waiting for its ask looks again for a free screen (0.9.6). */
const TIDY_POLL_MS = 500

/** What the rules read, as of now. */
function inputs() {
  const { tree } = useStackableStore.getState()
  return {
    opens: visit.opens,
    firstSeen: installedAt(visit.firstSeen, tree?.rootDateAdded),
    now: Date.now(),
    answered: prefs.rating() !== null,
    links: linkCount(tree),
    // School mode: the company's rating lock, from the policy's real answer (0.9.6; nothing asks before it).
    lockRating: !!useCorner.getState().locks?.rating,
  }
}

function eligible(trigger: 'load' | 'win' | 'milestone'): boolean {
  return shouldAskForRating({ ...inputs(), trigger })
}

/** Nothing else on screen (0.9.6): no toast (a tidy's has its Undo), dialog or card, the tidy coach mark included. */
function screenFree(): boolean {
  const s = useStackableStore.getState()
  return !s.toast && s.modal.kind === 'none' && !useCorner.getState().holder && !dialogOnScreen()
}

/**
 * Asks once (0.4.0), sooner since 0.4.1: after 3 days, right after something went well (an
 * import, a starter pack, a stash), or on a plain new tab once it's been opened 25 times.
 * Either answer retires it for good on this device. Ratings are how the store decides who else
 * sees Stackboard.
 *
 * 0.5.3 (backlog R1): a centred card with no stars on it (nothing preselected, no reward), and a
 * milestone also asks after one day: the first saved bankruptcy certificate or the third stash.
 *
 * 0.9.6: an applied tidy is a milestone too (tidyRatingStep). It asks once nothing else is on screen,
 * so never over the sorted space while the Tidied toast offers Undo, and an Undo takes it back. A tidy
 * before the install is a day old is kept in localStorage and asks on the first new tab after that.
 */
export function RatingPrompt() {
  const tree = useStackableStore((s) => s.tree)
  const wins = useStackableStore((s) => s.wins)
  const milestones = useStackableStore((s) => s.milestones)
  const tidied = useStackableStore((s) => s.tidied)
  // 0.9.6: the company policy has answered; no trigger asks before that (corner.ts).
  const settled = useCorner((s) => s.locks !== null)
  const [show, setShow] = useState(false)
  // A tidy waiting for its ask: applied on this tab, or carried over from an earlier one.
  const [tidyDue, setTidyDue] = useState(() => prefs.tidyWin() !== null)
  const loaded = !!tree

  const answer = (a: 'rated' | 'dismissed') => {
    prefs.setRating(a)
    setShow(false)
    if (a === 'rated') void openInNewTab(REVIEWS_URL, true)
  }

  // On a plain new tab, decide once when the board first loads (and the policy has answered), so it
  // never pops up mid-task.
  useEffect(() => {
    if (!loaded || !settled) return
    setShow(eligible('load'))
  }, [loaded, settled])

  // Right after a win, ask once the toast has had its moment.
  useEffect(() => {
    if (!wins || show || !settled || !eligible('win')) return
    const id = window.setTimeout(() => eligible('win') && setShow(true), RATING_WIN_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [wins, show, settled])

  // At a milestone (the certificate has closed by now), ask straight away.
  useEffect(() => {
    if (!milestones || show || !settled) return
    setShow(eligible('milestone'))
  }, [milestones, show, settled])

  // 0.9.6: a tidy applied on this tab (TidyButton keeps it in prefs.tidyWin first).
  useEffect(() => {
    if (tidied) setTidyDue(true)
  }, [tidied])

  // ...asks once the screen is free: its toast gone, no dialog or card up. Before day one it stays
  // in localStorage for a later tab; answered or locked, it goes.
  useEffect(() => {
    if (!loaded || !tidyDue || show || !settled) return
    let done = false
    const tryAsk = () => {
      if (done) return
      // Gone already: undone, or another tab asked.
      if (prefs.tidyWin() === null) {
        done = true
        return setTidyDue(false)
      }
      if (!screenFree()) return
      const step = tidyRatingStep(inputs())
      if (step !== 'later') prefs.clearTidyWin()
      done = true
      setTidyDue(false)
      if (step === 'ask') setShow(true)
    }
    tryAsk()
    const id = window.setInterval(tryAsk, TIDY_POLL_MS)
    return () => window.clearInterval(id)
  }, [loaded, tidyDue, show, settled])

  // 0.9.0: corner cards (the auto-archive line) wait while the ask is on screen.
  useEffect(() => {
    useCorner.getState().setRatingOpen(show)
  }, [show])

  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && answer('dismissed')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!show) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 p-6" onClick={() => answer('dismissed')}>
      <aside
        data-rating-prompt
        role="dialog"
        aria-labelledby="rating-title"
        className="pop-in relative w-full max-w-[400px] rounded-2xl border border-line bg-raised p-6 text-center shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => answer('dismissed')}
          className="absolute right-3 top-3 rounded p-1 text-faint hover:bg-hover hover:text-soft"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 id="rating-title" className="text-base font-semibold text-strong">
          A small favour
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Stackboard is free, open source and made by one person. Ratings on the Chrome Web Store
          decide whether anyone else finds it. If it has been useful to you, a rating helps a lot.
        </p>
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            onClick={() => answer('rated')}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            Rate on the Chrome Web Store
          </button>
          <button
            onClick={() => answer('dismissed')}
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-fg"
          >
            No thanks
          </button>
        </div>
      </aside>
    </div>
  )
}
