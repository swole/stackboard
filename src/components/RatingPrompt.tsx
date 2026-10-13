import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { REVIEWS_URL, installedAt, linkCount, shouldAskForRating, visit } from '../lib/onboarding'
import { prefs } from '../lib/prefs'
import { openInNewTab } from '../lib/tabs'

/** Let the success toast land before the card slides in. */
const WIN_DELAY_MS = 1800

function eligible(trigger: 'load' | 'win' | 'milestone'): boolean {
  const { tree } = useStackableStore.getState()
  return shouldAskForRating({
    opens: visit.opens,
    firstSeen: installedAt(visit.firstSeen, tree?.rootDateAdded),
    now: Date.now(),
    answered: prefs.rating() !== null,
    links: linkCount(tree),
    trigger,
  })
}

/**
 * Asks once (0.4.0), sooner since 0.4.1: after 3 days, right after something went well (an
 * import, a starter pack, a stash), or on a plain new tab once it's been opened 25 times.
 * Either answer retires it for good on this device. Ratings are how the store decides who else
 * sees Stackboard.
 *
 * 0.5.3 (backlog R1): a centred card with no stars on it (nothing preselected, no reward), and a
 * milestone also asks after one day: the first saved bankruptcy certificate or the third stash.
 */
export function RatingPrompt() {
  const tree = useStackableStore((s) => s.tree)
  const wins = useStackableStore((s) => s.wins)
  const milestones = useStackableStore((s) => s.milestones)
  const [show, setShow] = useState(false)
  const loaded = !!tree

  const answer = (a: 'rated' | 'dismissed') => {
    prefs.setRating(a)
    setShow(false)
    if (a === 'rated') void openInNewTab(REVIEWS_URL, true)
  }

  // On a plain new tab, decide once when the board first loads, so it never pops up mid-task.
  useEffect(() => {
    if (!loaded) return
    setShow(eligible('load'))
  }, [loaded])

  // Right after a win, ask once the toast has had its moment.
  useEffect(() => {
    if (!wins || show || !eligible('win')) return
    const id = window.setTimeout(() => eligible('win') && setShow(true), WIN_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [wins, show])

  // At a milestone (the certificate has closed by now), ask straight away.
  useEffect(() => {
    if (!milestones || show) return
    setShow(eligible('milestone'))
  }, [milestones, show])

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
