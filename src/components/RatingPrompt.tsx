import { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { REVIEWS_URL, installedAt, linkCount, shouldAskForRating, visit } from '../lib/onboarding'
import { prefs } from '../lib/prefs'
import { openInNewTab } from '../lib/tabs'

/** Let the success toast land before the card slides in. */
const WIN_DELAY_MS = 1800

function eligible(trigger: 'load' | 'win'): boolean {
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
 */
export function RatingPrompt() {
  const tree = useStackableStore((s) => s.tree)
  const wins = useStackableStore((s) => s.wins)
  const [show, setShow] = useState(false)
  const loaded = !!tree

  // On a plain new tab, decide once when the board first loads, so it never pops up mid-task.
  useEffect(() => {
    if (!loaded) return
    setShow(eligible('load'))
  }, [loaded])

  // Right after a win, ask once the toast has had its moment.
  useEffect(() => {
    if (!wins || show || !eligible('win')) return
    const id = window.setTimeout(() => setShow(eligible('win')), WIN_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [wins, show])

  if (!show) return null

  const answer = (a: 'rated' | 'dismissed') => {
    prefs.setRating(a)
    setShow(false)
    if (a === 'rated') void openInNewTab(REVIEWS_URL, true)
  }

  return (
    <aside
      data-rating-prompt
      className="pop-in fixed bottom-6 right-6 z-40 w-[300px] rounded-2xl border border-line bg-raised p-4 shadow-float"
    >
      <button
        onClick={() => answer('dismissed')}
        className="absolute right-2.5 top-2.5 rounded p-1 text-faint hover:bg-hover hover:text-soft"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex gap-0.5 text-accent-mark" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="h-4 w-4 fill-current" />
        ))}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-strong">Enjoying Stackboard?</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        A rating on the Chrome Web Store helps other people find it. It takes a few seconds.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => answer('rated')}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          Rate Stackboard
        </button>
        <button
          onClick={() => answer('dismissed')}
          className="rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-hover hover:text-fg"
        >
          No thanks
        </button>
      </div>
    </aside>
  )
}
