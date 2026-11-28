import { useEffect, useRef, useState } from 'react'
import { Gift } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { IS_EXTENSION } from '../lib/bookmarks'
import { useCorner } from '../lib/corner'
import { anyLock } from '../lib/managedPlan'
import { visit } from '../lib/onboarding'
import { prefs } from '../lib/prefs'
import { usePro } from '../lib/pro'
import { readWrappedMarker, updateWrappedMarker } from '../lib/wrapped'
import {
  WRAPPED_CARD_DELAY_MS,
  WRAPPED_COPY,
  WRAPPED_YEAR,
  cardFinished,
  localDay,
  markRetired,
  markShown,
  noteFoundingDay,
  wrappedCardDue,
  wrappedCardLine,
  wrappedOffered,
  wrappedSeason,
  wrappedStats,
} from '../lib/wrappedPlan'
import { CornerCard, PRIMARY, QUIET } from './CornerCard'

/**
 * "Your 2026 in Stackboard" (0.9.10): a corner card from 4 Dec that offers the year's picture, on two
 * new tabs at most and never twice in a day (the rules: wrappedCardDue in wrappedPlan.ts). It decides
 * once per tab, after the December note has had its turn, and keeps off any day that note shows; never
 * under a company lock. See your year opens the picture; Not now, or closing it, retires it. From 1 Dec
 * every new tab also notes the day the December note first shows, so the card knows to keep off it.
 */
export function WrappedCard({ welcoming }: { welcoming: boolean }) {
  const loaded = useStackableStore((s) => !!s.tree)
  const ready = usePro((s) => s.ready)
  const ratingOpen = useCorner((s) => s.ratingOpen)
  // The company policy has answered (corner.ts); the card doesn't decide before that.
  const settled = useCorner((s) => s.locks !== null)
  const opened = useStackableStore((s) => s.modal.kind === 'wrapped')
  const [line, setLine] = useState<string | null>(null)
  const decided = useRef(false)
  const welcome = useRef(welcoming)
  welcome.current = welcoming

  useEffect(() => {
    if (decided.current || !loaded || !ready || !settled || !IS_EXTENSION) return
    const id = setTimeout(() => {
      decided.current = true
      const now = Date.now()
      const tree = useStackableStore.getState().tree
      if (!tree || !wrappedSeason(now)) return
      const stats = wrappedStats({ spaces: tree.spaces, year: WRAPPED_YEAR })
      const stored = readWrappedMarker()
      if (!wrappedOffered(stats) || cardFinished(stored)) return
      const today = localDay(now)
      const noteShown = prefs.foundingNote()
      const marker = updateWrappedMarker((m) => noteFoundingDay(m, noteShown, today))
      const { state, early } = usePro.getState()
      const corner = useCorner.getState()
      const due = wrappedCardDue({
        now,
        offered: true,
        marker,
        opens: visit.opens,
        firstSeen: visit.firstSeen,
        locked: !corner.locks || anyLock(corner.locks),
        noteApplies: !early && (state.kind === 'free' || state.kind === 'trial'),
        noteShown,
        welcoming: welcome.current,
      })
      // A tab where the rating ask, a waiting moment line or another card got there first goes without.
      if (!due || corner.ratingOpen || corner.moment || !corner.claim('wrapped')) return
      updateWrappedMarker((m) => markShown(m, today))
      setLine(wrappedCardLine(stats))
    }, WRAPPED_CARD_DELAY_MS)
    return () => clearTimeout(id)
  }, [loaded, ready, settled])

  const answer = () => {
    updateWrappedMarker(markRetired)
    setLine(null)
    useCorner.getState().release('wrapped')
  }

  // Opened from Settings meanwhile: the card has done its job.
  useEffect(() => {
    if (opened && line) answer()
  }, [opened, line])

  if (!line || welcoming || ratingOpen) return null

  const open = () => {
    answer()
    useStackableStore.getState().openModal({ kind: 'wrapped' })
  }

  return (
    <CornerCard data={{ 'data-wrapped-card': '' }} onClose={answer}>
      <h3 className="flex items-center gap-1.5 pr-6 font-semibold text-strong">
        <Gift className="h-4 w-4 text-accent-text" />
        {WRAPPED_COPY.title}
      </h3>
      <p className="mt-1.5 leading-relaxed text-muted">{line}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={open} className={PRIMARY} data-wrapped-card-open>
          {WRAPPED_COPY.open}
        </button>
        <button onClick={answer} className={QUIET} data-wrapped-card-not-now>
          {WRAPPED_COPY.notNow}
        </button>
      </div>
    </CornerCard>
  )
}
