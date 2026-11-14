import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { WandSparkles } from 'lucide-react'
import type { Space } from '../lib/types'
import { dialogOnScreen, useCorner } from '../lib/corner'
import { prefs } from '../lib/prefs'
import { checkReady } from '../lib/tidy'
import { dropTidyCoach, useTidyCoach } from '../lib/tidyCoach'
import { TIDY_COACH, TIDY_COACH_DELAY_MS, coachBody, tidyCoach } from '../lib/tidyCoachPlan'
import { tidyInput } from '../lib/tidyPlan'
import { useStackableStore } from '../store/useStackableStore'
import { PRIMARY, QUIET } from './CornerCard'

/** How often a mark that's waiting looks again for a free screen. */
const POLL_MS = 400

/** Retires the mark on this page and lets the corner go. */
function retire(): void {
  dropTidyCoach()
  useCorner.getState().release('tidyCoach')
}

/**
 * The tidy coach mark (0.9.6): after an import lands a space of 15 to 600 links, a small card hangs
 * from that space's Tidy button, once per Chrome profile (the rules: tidyCoachPlan.ts). TidyButton
 * renders it beside the button, so it only exists while the button is offered. Right after the import
 * it asks whether Tidy is on (the check Settings and the space menus run) and shows nothing when it's
 * off or the server can't be reached. Then it waits until nothing else is on screen and the corner
 * cards let it take its turn. "Sort them for me" runs Tidy's own start, notice first; Not now, Esc or
 * a click anywhere else retires it.
 */
export function TidyCoach({ space, access, onSort }: { space: Space; access: 'paid' | 'free'; onSort: () => void }) {
  const mine = useTidyCoach((s) => s.spaceId === space.id)
  const showing = useTidyCoach((s) => s.showing && s.spaceId === space.id)
  const ratingOpen = useCorner((s) => s.ratingOpen)
  // The server said Tidy is on.
  const [on, setOn] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  // The space as the board has it now: its links are counted again when the mark is about to show.
  const spaceRef = useRef(space)
  spaceRef.current = space

  // Right after the import: is Tidy switched on? The last answer if it's under a day old, else one
  // GET with nothing about the person in it (checkReady in lib/tidy.ts).
  useEffect(() => {
    if (!mine) return
    let live = true
    void checkReady().then((ready) => {
      if (!ready) dropTidyCoach() // off or unreachable: nothing to show
      else if (live) setOn(true)
    })
    return () => {
      live = false
    }
  }, [mine])

  // Then it waits for its moment: the copy toast landed, no dialog or rating ask up, the tab in
  // front, and the corner free of the cards.
  useEffect(() => {
    if (!mine || !on || showing) return
    const tryShow = () => {
      if (Date.now() - useTidyCoach.getState().at < TIDY_COACH_DELAY_MS) return
      const s = useStackableStore.getState()
      const corner = useCorner.getState()
      // The company's locks are the policy's real answer (0.9.6): until it's in, the mark waits.
      const lock = corner.locks
      if (!lock || s.modal.kind !== 'none' || corner.ratingOpen || dialogOnScreen() || document.visibilityState !== 'visible') return
      // The rules once more with what holds now: the policy may say more than when the import began,
      // another tab may have shown it.
      const now = spaceRef.current
      const still = tidyCoach({
        spaces: [{ id: now.id, links: tidyInput(now).links.length }],
        access,
        shown: prefs.tidyCoachShown(),
        lockAi: lock.ai,
        lockPro: lock.pro,
      })
      if (!still) return dropTidyCoach()
      if (!corner.claim('tidyCoach')) return
      prefs.setTidyCoachShown()
      useTidyCoach.setState({ showing: true })
    }
    tryShow()
    const id = window.setInterval(tryShow, POLL_MS)
    return () => window.clearInterval(id)
  }, [mine, on, showing, access])

  // Gone with its button while on screen (another space picked with a number key, the free tidy used
  // in another tab): retired as well. It has shown, so it never comes back.
  useEffect(
    () => () => {
      if (useTidyCoach.getState().showing) retire()
    },
    [],
  )

  // Esc, or a click anywhere outside it, retires it like Not now. A click on the Tidy button itself
  // then goes on to start Tidy as usual. The rating ask, if it comes up over it, handles its own.
  useEffect(() => {
    if (!showing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useCorner.getState().ratingOpen) retire()
    }
    const onDown = (e: PointerEvent) => {
      if (!useCorner.getState().ratingOpen && !cardRef.current?.contains(e.target as Node)) retire()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [showing])

  const sort = useCallback(() => {
    retire()
    onSort()
  }, [onSort])

  if (!showing || ratingOpen) return null

  return (
    // Hangs from the button: the caret points at its middle, the card lines up with its right edge.
    <div className="coach-in absolute inset-x-0 top-full z-30">
      <div
        ref={cardRef}
        data-tidy-coach={access}
        role="note"
        aria-labelledby={titleId}
        className="absolute right-0 top-3 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-accent-line/70 bg-raised p-4 text-left text-sm shadow-float"
      >
        <h3 id={titleId} className="flex items-center gap-1.5 font-semibold text-strong">
          <WandSparkles className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
          {TIDY_COACH.title}
        </h3>
        <p className="mt-1.5 leading-relaxed text-muted">{coachBody(access)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={sort} className={PRIMARY} data-tidy-coach-sort>
            {TIDY_COACH.sort}
          </button>
          <button onClick={retire} className={QUIET} data-tidy-coach-later>
            {TIDY_COACH.later}
          </button>
        </div>
      </div>
      <span
        aria-hidden
        data-tidy-coach-caret
        className="absolute left-1/2 top-1.5 -ml-1.5 h-3 w-3 rotate-45 rounded-tl-[3px] border-l border-t border-accent-line/70 bg-raised"
      />
    </div>
  )
}
