import { create } from 'zustand'
import { localDay } from './duePlan'

// The local calendar day, kept current (0.8.0). A new tab left open overnight moves its Today
// list, the sidebar count and the date chips to the new day at local midnight, and checks again
// whenever the tab comes back into view, since a sleeping computer skips timers.

interface TodayStore {
  /** 'YYYY-MM-DD', local */
  day: string
}

export const useToday = create<TodayStore>(() => ({ day: localDay() }))

let timer: ReturnType<typeof setTimeout> | undefined

function check(): void {
  const day = localDay()
  if (useToday.getState().day !== day) useToday.setState({ day })
  schedule()
}

/** Wakes a second after the next local midnight. */
function schedule(): void {
  clearTimeout(timer)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  timer = setTimeout(check, Math.max(1000, next.getTime() - now.getTime()))
}

let started = false

/** Call once per page. */
export function initToday(): void {
  if (started || typeof document === 'undefined') return
  started = true
  schedule()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
