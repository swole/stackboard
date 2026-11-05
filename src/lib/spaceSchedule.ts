import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { usePro } from './pro'
import { hasPro } from './proPlan'
import { parseRules, type SpaceRule } from './schedulePlan'

// Spaces that switch themselves on this page (Pro, 0.9.0); the rules are in schedulePlan.ts.
// The rules sync, so setting them once covers every computer on the Chrome profile. A copy sits in
// localStorage while Pro or the trial is on, because the board picks its first space before
// chrome.storage answers (useStackableStore.refresh reads it); without Pro the copy is removed.

const KEY = 'spaceSchedule' // sync: { v: 1, rules }
const MIRROR = 'stackable:spaceSchedule' // localStorage: the rules, only while Pro is on

interface ScheduleStore {
  ready: boolean
  rules: SpaceRule[]
  save: (rules: SpaceRule[]) => Promise<void>
}

export const useSchedule = create<ScheduleStore>((set) => ({
  ready: !IS_EXTENSION,
  rules: [],
  save: async (rules) => {
    set({ rules })
    if (!IS_EXTENSION) return
    if (rules.length) await chrome.storage.sync.set({ [KEY]: { v: 1, rules } })
    else await chrome.storage.sync.remove(KEY)
  },
}))

/** The rules as of the last page with Pro on; [] without Pro. Synchronous, for the first frame. */
export function mirroredRules(): SpaceRule[] {
  try {
    const raw = localStorage.getItem(MIRROR)
    return raw ? parseRules({ rules: JSON.parse(raw) }) : []
  } catch {
    return []
  }
}

function writeMirror(): void {
  const pro = usePro.getState()
  if (!pro.ready) return // not known yet: leave the copy as the last page saw it
  const { ready, rules } = useSchedule.getState()
  if (!ready) return
  try {
    if (hasPro(pro.state) && rules.length) localStorage.setItem(MIRROR, JSON.stringify(rules))
    else localStorage.removeItem(MIRROR)
  } catch {
    // storage blocked: the rules still work from the next page that can write
  }
}

let started = false

/** Call once per new tab. */
export function initSchedule(): void {
  if (started || !IS_EXTENSION) return
  started = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) useSchedule.setState({ rules: parseRules(changes[KEY].newValue) })
  })
  void chrome.storage.sync
    .get(KEY)
    .then((got) => useSchedule.setState({ ready: true, rules: parseRules(got[KEY]) }))
    .catch(() => useSchedule.setState({ ready: true }))
  useSchedule.subscribe(writeMirror)
  usePro.subscribe(writeMirror)
}
