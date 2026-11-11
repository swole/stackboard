import { useEffect, useRef, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { IS_EXTENSION } from '../lib/bookmarks'
import { useCorner } from '../lib/corner'
import { FOUNDING_NOTE, FOUNDING_NOTE_DELAY_MS, foundingNote, type FoundingWindow } from '../lib/nudgePlan'
import { visit } from '../lib/onboarding'
import { prefs } from '../lib/prefs'
import { usePro } from '../lib/pro'
import { checkoutPending } from '../lib/proPlan'
import { CornerCard, PRIMARY, openProSettings } from './CornerCard'

/**
 * The December note (0.9.5): $2.99 a year, the founding price, ends on 31 Dec. A free or trial board
 * that isn't an early user's gets this corner card once from 1 Dec and once in the last four days (the
 * rules: foundingNote in nudgePlan.ts). Decided once per tab, a beat after "what stopped you?", so
 * every other card goes first, and not on a tab where the rating ask is up or a moment line waits.
 * See Pro opens Settings at Stackboard Pro, where the price and the buy buttons are.
 */
export function FoundingNote({ welcoming }: { welcoming: boolean }) {
  const loaded = useStackableStore((s) => !!s.tree)
  const ready = usePro((s) => s.ready)
  const paid = usePro((s) => s.state.kind === 'pro')
  const ratingOpen = useCorner((s) => s.ratingOpen)
  const [shown, setShown] = useState<FoundingWindow | null>(null)
  const decided = useRef(false)
  // Read when the card decides: the welcome screen stays up while it fills the board.
  const welcome = useRef(welcoming)
  welcome.current = welcoming

  useEffect(() => {
    if (decided.current || !loaded || !ready || !IS_EXTENSION) return
    const id = setTimeout(() => {
      decided.current = true
      const { state, early, checkoutAt } = usePro.getState()
      const corner = useCorner.getState()
      const now = Date.now()
      const due = foundingNote({
        state,
        early,
        now,
        shown: prefs.foundingNote(),
        opens: visit.opens,
        firstSeen: visit.firstSeen,
        welcoming: welcome.current,
        checkoutPending: checkoutPending(checkoutAt, now),
        // School mode: the company's pro lock, read with the board that loaded.
        lockPro: !!useStackableStore.getState().tree?.company?.lock.pro,
      })
      // A tab where another card got there first goes without; a later tab in the window can still show it.
      if (!due || corner.ratingOpen || corner.moment || !corner.claim('founding')) return
      prefs.setFoundingNote(due)
      setShown(due)
    }, FOUNDING_NOTE_DELAY_MS)
    return () => clearTimeout(id)
  }, [loaded, ready])

  const close = () => {
    setShown(null)
    useCorner.getState().release('founding')
  }

  // Pro switched on meanwhile (a key from the thanks page, say): nothing left to say.
  useEffect(() => {
    if (paid && shown) close()
  }, [paid, shown])

  if (!shown || welcoming || ratingOpen) return null

  const look = () => {
    close()
    openProSettings()
  }

  return (
    <CornerCard data={{ 'data-founding-note': shown }} onClose={close}>
      <h3 className="flex items-center gap-1.5 pr-6 font-semibold text-strong">
        <CalendarClock className="h-4 w-4 text-accent-text" />
        {FOUNDING_NOTE.title}
      </h3>
      <p className="mt-1.5 leading-relaxed text-muted">{FOUNDING_NOTE.line}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={look} className={PRIMARY} data-founding-see-pro>
          {FOUNDING_NOTE.button}
        </button>
      </div>
    </CornerCard>
  )
}
