import { useEffect, useRef, useState } from 'react'
import { Crown } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { IS_EXTENSION } from '../lib/bookmarks'
import { useCorner } from '../lib/corner'
import { REVERSE_CARD_DELAY_MS, reverseCardLine, reverseCardTitle, showReverseCard } from '../lib/nudgePlan'
import { visit } from '../lib/onboarding'
import { prefs } from '../lib/prefs'
import { usePro } from '../lib/pro'
import { checkoutPending } from '../lib/proPlan'
import { CornerCard, PRIMARY, openProSettings } from './CornerCard'

/**
 * The reverse-trial card (0.9.2): a new install starts with Pro for 14 days, and once they've settled
 * in, this corner card says so and points at Settings > Stackboard Pro (the rules: showReverseCard in
 * nudgePlan.ts). Decided once per tab, a beat after the board loads, so the cards that decide on load
 * go first; it waits while the rating ask is on screen. On two new tabs at most, retired when answered.
 */
export function ReverseTrialCard({ welcoming }: { welcoming: boolean }) {
  const loaded = useStackableStore((s) => !!s.tree)
  const ready = usePro((s) => s.ready)
  const ratingOpen = useCorner((s) => s.ratingOpen)
  const [card, setCard] = useState<{ title: string; line: string } | null>(null)
  const decided = useRef(false)
  // Read when the card decides: the welcome screen stays up while it fills the board.
  const welcome = useRef(welcoming)
  welcome.current = welcoming

  useEffect(() => {
    if (decided.current || !loaded || !ready || !IS_EXTENSION) return
    const id = setTimeout(() => {
      decided.current = true
      const { state, trialAuto, trialStartedAt, checkoutAt } = usePro.getState()
      const corner = useCorner.getState()
      const now = Date.now()
      const due = showReverseCard({
        state,
        trialAuto,
        trialStartedAt,
        firstSeen: visit.firstSeen,
        opens: visit.opens,
        shows: prefs.reverseTrialShows(),
        now,
        welcoming: welcome.current,
        checkoutPending: checkoutPending(checkoutAt, now),
        // School mode: the company's pro lock, read with the board that loaded.
        lockPro: !!useStackableStore.getState().tree?.company?.lock.pro,
      })
      // A tab where the rating ask or another card got there first goes without.
      if (!due || !trialStartedAt || corner.ratingOpen || !corner.claim('reverseTrial')) return
      prefs.setReverseTrialShows(prefs.reverseTrialShows() + 1)
      setCard({ title: reverseCardTitle(trialStartedAt), line: reverseCardLine(/Mac|iPhone|iPad/.test(navigator.platform)) })
    }, REVERSE_CARD_DELAY_MS)
    return () => clearTimeout(id)
  }, [loaded, ready])

  if (!card || welcoming || ratingOpen) return null

  const answer = () => {
    prefs.setReverseTrialShows(-1)
    setCard(null)
    useCorner.getState().release('reverseTrial')
  }
  const look = () => {
    answer()
    openProSettings()
  }

  return (
    <CornerCard data={{ 'data-reverse-trial': '' }} onClose={answer}>
      <h3 className="flex items-center gap-1.5 pr-6 font-semibold text-strong">
        <Crown className="h-4 w-4 text-accent-text" />
        {card.title}
      </h3>
      <p className="mt-1.5 leading-relaxed text-muted">{card.line}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={look} className={PRIMARY} data-reverse-trial-look>
          See what's in Pro
        </button>
      </div>
    </CornerCard>
  )
}
