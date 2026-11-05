import { useEffect, useRef, useState } from 'react'
import { Crown } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { IS_EXTENSION } from '../lib/bookmarks'
import { useCorner } from '../lib/corner'
import { pickTrialCard, trialCardTitle, type TrialCard } from '../lib/nudgePlan'
import { prefs } from '../lib/prefs'
import { usePro } from '../lib/pro'
import { checkoutPending, checkoutUrl, priceLabel } from '../lib/proPlan'
import { loadStats } from '../lib/proStats'
import { statsLine } from '../lib/statsPlan'
import { openInNewTab } from '../lib/tabs'
import { CornerCard, PRIMARY, QUIET } from './CornerCard'

/**
 * The trial-end recap (0.9.0): in the trial's last two days and on the first tabs after it ends,
 * one corner card with what Pro did on this computer and Keep Pro. Decided once, when this tab
 * loads, so a trial starting or ending in another tab never wakes a tab that's already open. On at
 * most two new tabs each, retired when answered.
 */
export function TrialEndCard() {
  const loaded = useStackableStore((s) => !!s.tree)
  const ready = usePro((s) => s.ready)
  const early = usePro((s) => s.early)
  const [card, setCard] = useState<{ kind: TrialCard; title: string; line: string | null } | null>(null)
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current || !loaded || !ready || !IS_EXTENSION) return
    decided.current = true
    const { state, trialStartedAt, checkoutAt } = usePro.getState()
    const now = Date.now()
    const kind = pickTrialCard({
      state,
      trialStartedAt,
      now,
      endingShows: prefs.trialCardShows('ending'),
      endedShows: prefs.trialCardShows('ended'),
      checkoutPending: checkoutPending(checkoutAt, now),
      lockPro: !!useStackableStore.getState().tree?.company?.lock.pro,
    })
    if (!kind || !trialStartedAt || !useCorner.getState().claim('trialEnd')) return
    prefs.setTrialCardShows(kind, prefs.trialCardShows(kind) + 1)
    void loadStats().then((stats) => setCard({ kind, title: trialCardTitle(kind, trialStartedAt, now), line: statsLine(stats) }))
  }, [loaded, ready])

  if (!card) return null

  const answer = () => {
    prefs.setTrialCardShows(card.kind, -1)
    setCard(null)
    useCorner.getState().release('trialEnd')
  }
  const keep = () => {
    answer()
    usePro.getState().markCheckout()
    void openInNewTab(checkoutUrl(early, Date.now()), true)
  }

  return (
    <CornerCard data={{ 'data-trial-end': card.kind }} onClose={answer}>
      <h3 className="flex items-center gap-1.5 pr-6 font-semibold text-strong">
        <Crown className="h-4 w-4 text-accent-text" />
        {card.title}
      </h3>
      {card.line && (
        <p className="mt-1.5 leading-relaxed text-muted" data-trial-end-stats>
          {card.line}
        </p>
      )}
      {card.kind === 'ended' && <p className="mt-1.5 leading-relaxed text-muted">Pro features are paused. Everything you made is still here.</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={keep} className={PRIMARY} data-trial-keep>
          Keep Pro for {priceLabel(early, Date.now())}
        </button>
        <button onClick={answer} className={QUIET}>
          Not now
        </button>
      </div>
    </CornerCard>
  )
}
