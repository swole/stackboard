import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { useCorner } from './corner'
import { prefs } from './prefs'
import { usePro } from './pro'
import { useTidy } from './tidy'
import { coachAccess, tidyCoach, type ImportedSpace } from './tidyCoachPlan'

// The tidy coach mark on this page (0.9.6): which space's Tidy button it points at after an import,
// and whether it's on screen. The rules are in tidyCoachPlan.ts; the mark is components/TidyCoach.tsx.
// Nothing here is stored. The once-only marker is prefs.tidyCoachShown (localStorage), written when
// the mark shows, so a new tab never carries an offer over.

interface CoachState {
  /** The space whose Tidy button the mark points at, from the import that landed it; null for none. */
  spaceId: string | null
  /** When that import finished. */
  at: number
  /** The mark is on screen (its button gets a ring). */
  showing: boolean
}

export const useTidyCoach = create<CoachState>(() => ({ spaceId: null, at: 0, showing: false }))

/**
 * After an import lands: the space the mark will point at (the import selects it), or null. Who can
 * press Tidy may not be known yet on the welcome screen; the mark waits for that, then for the
 * server's readiness answer, then for a free screen (components/TidyCoach.tsx). The company's locks
 * are the policy's real answer (corner.ts); before it's in they count as unknown here, and the mark
 * checks them again before it shows.
 */
export function offerTidyCoach(spaces: readonly ImportedSpace[]): string | null {
  if (!IS_EXTENSION) return null
  const pro = usePro.getState()
  const locks = useCorner.getState().locks
  const lockAi = !!locks?.ai
  const lockPro = !!locks?.pro
  const access = coachAccess({
    proReady: pro.ready,
    state: pro.state,
    activated: !!pro.license?.activationId,
    freeUsed: useTidy.getState().freeUsed,
    lockAi,
    lockPro,
  })
  const spaceId = tidyCoach({ spaces, access, shown: prefs.tidyCoachShown(), lockAi, lockPro })
  if (spaceId) useTidyCoach.setState({ spaceId, at: Date.now(), showing: false })
  return spaceId
}

/** Retires it on this page: answered, gone with its button, or Tidy pressed on its own. */
export function dropTidyCoach(): void {
  const s = useTidyCoach.getState()
  if (s.spaceId !== null || s.showing) useTidyCoach.setState({ spaceId: null, showing: false })
}
