import { useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import { useCorner } from '../lib/corner'
import { momentLine, type MomentLine as Line } from '../lib/nudgePlan'
import { prefs } from '../lib/prefs'
import { usePro } from '../lib/pro'
import { useStackableStore } from '../store/useStackableStore'
import { CornerCard, openProSettings } from './CornerCard'

/** Long enough for the stash toast and a rating ask (which waits 1.8 s) to go first. */
export const MOMENT_DELAY_MS = 2500
/** The line steps aside by itself after this long. */
const MOMENT_SHOW_MS = 30_000

/**
 * The moment-of-need line (0.9.0): right after "Stash and close" lands, and after a bankruptcy
 * certificate closes, free users see one line on what auto-archive would do, with a way into
 * Settings > Stackboard Pro. It waits its turn behind the rating ask and any other corner card,
 * and shows on the first three occasions only (nudgePlan.ts).
 */
export function MomentLine() {
  const moment = useCorner((s) => s.moment)
  const ratingOpen = useCorner((s) => s.ratingOpen)
  const holder = useCorner((s) => s.holder)
  const [due, setDue] = useState(false)
  const [line, setLine] = useState<Line | null>(null)

  useEffect(() => {
    setDue(false)
    if (!moment) return
    const id = setTimeout(() => setDue(true), MOMENT_DELAY_MS)
    return () => clearTimeout(id)
  }, [moment])

  useEffect(() => {
    if (!moment || !due || line || ratingOpen) return
    const corner = useCorner.getState()
    const { ready, state } = usePro.getState()
    const lockPro = !!useStackableStore.getState().tree?.company?.lock.pro
    const next = ready ? momentLine({ state, shown: prefs.moments(), lockPro }) : null
    if (!next) return corner.clearMoment()
    // Another card has the corner: this runs again when it lets go.
    if (!corner.claim('moment')) return
    prefs.setMoments(prefs.moments() + 1)
    corner.clearMoment()
    setLine(next)
  }, [moment, due, ratingOpen, holder, line])

  const close = () => {
    setLine(null)
    useCorner.getState().release('moment')
  }

  useEffect(() => {
    if (!line) return
    const id = setTimeout(close, MOMENT_SHOW_MS)
    return () => clearTimeout(id)
  }, [line])

  if (!line || ratingOpen) return null
  return (
    <CornerCard data={{ 'data-moment-line': '' }} onClose={close}>
      <p className="pr-6 leading-relaxed text-muted">
        <Archive className="mr-1.5 inline h-4 w-4 align-[-3px] text-accent-text" />
        {line.text}{' '}
        <button
          onClick={() => {
            close()
            openProSettings()
          }}
          className="font-medium text-accent-text underline-offset-2 hover:underline"
          data-moment-pro
        >
          {line.link}
        </button>
      </p>
    </CornerCard>
  )
}
