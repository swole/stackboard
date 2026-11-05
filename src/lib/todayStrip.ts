import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { localDay } from './duePlan'
import { cleanFocus, focusFor, stripOn } from './todayStripPlan'

// The Today strip on this page (Pro, 0.9.0): whether it's on and today's focus line. Both sync,
// so the switch and the focus follow the Chrome profile; the focus is empty again on a new day.
// Outside the extension (vite preview) they live in memory only.

const STRIP = 'todayStrip' // sync: { on: true }
const FOCUS = 'todayFocus' // sync: { day, text }

interface TodayStripStore {
  ready: boolean
  on: boolean
  /** The stored focus as written: `focusFor` decides whether it belongs to today. */
  focus: unknown
  setOn: (on: boolean) => Promise<void>
  /** Saves the focus for today; an empty line removes it. */
  setFocus: (text: string) => Promise<void>
}

export const useTodayStrip = create<TodayStripStore>((set) => ({
  ready: !IS_EXTENSION,
  on: false,
  focus: null,
  setOn: async (on) => {
    set({ on })
    if (!IS_EXTENSION) return
    if (on) await chrome.storage.sync.set({ [STRIP]: { on: true } })
    else await chrome.storage.sync.remove(STRIP)
  },
  setFocus: async (text) => {
    const clean = cleanFocus(text)
    const value = clean ? { day: localDay(), text: clean } : null
    set({ focus: value })
    if (!IS_EXTENSION) return
    if (value) await chrome.storage.sync.set({ [FOCUS]: value })
    else await chrome.storage.sync.remove(FOCUS)
  },
}))

/** Today's focus line, or '' (re-reads the day from the caller, so midnight empties it). */
export function useFocus(today: string): string {
  return focusFor(useTodayStrip((s) => s.focus), today)
}

let started = false

/** Call once per new tab. */
export function initTodayStrip(): void {
  if (started || !IS_EXTENSION) return
  started = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return
    if (STRIP in changes) useTodayStrip.setState({ on: stripOn(changes[STRIP].newValue) })
    if (FOCUS in changes) useTodayStrip.setState({ focus: changes[FOCUS].newValue ?? null })
  })
  void chrome.storage.sync
    .get([STRIP, FOCUS])
    .then((got) => useTodayStrip.setState({ ready: true, on: stripOn(got[STRIP]), focus: got[FOCUS] ?? null }))
    .catch(() => useTodayStrip.setState({ ready: true }))
}
