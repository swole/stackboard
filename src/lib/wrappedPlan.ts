import { allLinks } from './folderPlan'
import { foundingWindow, type FoundingWindow } from './nudgePlan'
import type { TodoItem } from './todoPlan'
import type { Space } from './types'

// "Your 2026 in Stackboard" (0.9.10): a year-in-review worked out on this
// computer from the person's own board, with a picture they can share (components/Wrapped.tsx draws
// it with lib/wrappedArt.ts). Pure, so tests/unit.test.ts covers the numbers, the words and when the
// corner card shows.
//
// What it reads: the board (each link's site and the day Chrome says it was saved), the stash counter
// this computer keeps (prefs.ts), and the board's to-do items (done, and the day they were added).
// Nothing about tabs or browsing history, and nothing leaves the computer: the picture and the text
// are made here, and only the person shares them.
//
// Times are this computer's clock: a link saved at 23:30 on 31 Dec counts for that year.

export const WRAPPED_YEAR = 2026
/** Below this many links saved in the year there's no year to show: no card, no Settings row. */
export const WRAPPED_MIN_SAVED = 5
/** New tabs the corner card can show on, on different days. */
export const WRAPPED_CARD_SHOWS = 2
/** It decides this long after the board and Pro are ready: after the December note (2.5 s), so that goes first. */
export const WRAPPED_CARD_DELAY_MS = 3000
/** The card waits for a new install to settle in, as the December note does (nudgePlan.ts). */
export const WRAPPED_CARD_OPENS = 3
export const WRAPPED_CARD_WAIT_MS = 20 * 60 * 60 * 1000
export const WRAPPED_URL = 'getstackboard.com/wrapped'
export const WRAPPED_TAGLINE = 'Stackboard, a free new tab for Chrome'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "1,248": the picture and its text are in English, so the numbers are too. */
export function count(n: number): string {
  return n.toLocaleString('en-US')
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`
}

/** "3 Jun 2026", on this computer's clock. */
export function fullDay(at: number): string {
  const d = new Date(at)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

/** "YYYY-MM-DD" on this computer's clock, the day the card's marker counts in. */
export function localDay(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A link's site as people say it: "github.com" for https://www.github.com/x. Web links only. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

// ---------- The numbers ----------

export interface WrappedStats {
  year: number
  /** Links on the board saved in the year. */
  saved: number
  /** Links on the board now, in the person's own spaces (folders inside stacks included). */
  links: number
  spaces: number
  stacks: number
  /** The stack with the most links, folders inside it included; the first on the board wins a tie. */
  busiestStack: { name: string; links: number } | null
  /** The site most of the year's links came from; of two with as many, the one that got there first. */
  topSite: { host: string; links: number } | null
  /** The oldest link on the board, any year: its site and the day it was saved, nothing else. */
  oldest: { host: string; at: number } | null
  /** The month (0 for January) the most links were saved in; the earlier month wins a tie. */
  busiestMonth: { month: number; links: number } | null
  /** Stashes this computer has counted (prefs.ts); null when it has never counted one. */
  stashes: number | null
  /**
   * To-dos ticked off that were added in the year (an item keeps the day it was added and whether
   * it's done, and no date for the tick); null when the lists haven't been read.
   */
  todosDone: number | null
}

export function wrappedStats(p: {
  spaces: readonly Space[]
  year: number
  stashes?: number | null
  todos?: readonly TodoItem[] | null
}): WrappedStats {
  // The company's spaces (Teams) aren't the person's own.
  const own = p.spaces.filter((s) => !s.company)
  const from = new Date(p.year, 0, 1).getTime()
  const to = new Date(p.year + 1, 0, 1).getTime()
  const inYear = (at: number | undefined): at is number => typeof at === 'number' && at >= from && at < to

  let links = 0
  let stacks = 0
  let busiestStack: WrappedStats['busiestStack'] = null
  let oldest: WrappedStats['oldest'] = null
  const saved: Array<{ host: string | null; at: number; order: number }> = []
  for (const space of own) {
    for (const stack of space.stacks) {
      stacks++
      const all = allLinks(stack)
      links += all.length
      if (all.length > (busiestStack?.links ?? 0)) busiestStack = { name: stack.title, links: all.length }
      for (const b of all) {
        const host = hostOf(b.url)
        const at = b.dateAdded
        if (host && typeof at === 'number' && at > 0 && (!oldest || at < oldest.at)) oldest = { host, at }
        if (inYear(at)) saved.push({ host, at, order: saved.length })
      }
    }
  }

  // In the order they were saved: a site leads once it has more links than the leader, so of two
  // sites with as many, the one that got there first keeps it.
  saved.sort((a, b) => a.at - b.at || a.order - b.order)
  const perHost = new Map<string, number>()
  const months = new Array<number>(12).fill(0)
  let topSite: WrappedStats['topSite'] = null
  for (const l of saved) {
    months[new Date(l.at).getMonth()]++
    if (!l.host) continue
    const n = (perHost.get(l.host) ?? 0) + 1
    perHost.set(l.host, n)
    if (!topSite || n > topSite.links) topSite = { host: l.host, links: n }
  }
  let busiestMonth: WrappedStats['busiestMonth'] = null
  months.forEach((n, month) => {
    if (n > (busiestMonth?.links ?? 0)) busiestMonth = { month, links: n }
  })

  return {
    year: p.year,
    saved: saved.length,
    links,
    spaces: own.length,
    stacks,
    busiestStack,
    topSite,
    oldest,
    busiestMonth,
    stashes: typeof p.stashes === 'number' && p.stashes >= 0 ? p.stashes : null,
    todosDone: p.todos ? p.todos.filter((t) => t.done && inYear(t.at)).length : null,
  }
}

/** Enough of a year to show: the card and the Settings row are offered from WRAPPED_MIN_SAVED links. */
export function wrappedOffered(s: WrappedStats): boolean {
  return s.saved >= WRAPPED_MIN_SAVED
}

export function monthName(month: number): string {
  return MONTHS[month] ?? ''
}

// ---------- The words ----------

export interface WrappedTile {
  key: 'site' | 'month' | 'stack' | 'oldest'
  /** Small, above the value (the picture sets it in capitals). */
  label: string
  value: string
  /** Under the value; empty for none. */
  sub: string
}

/**
 * The picture's four big facts, in order, each only when there's something to say. Counts and site
 * names only: the busiest stack's name goes on it only when the person ticks Show stack names
 * (`names`), and link titles never do.
 */
export function wrappedTiles(s: WrappedStats, names: boolean): WrappedTile[] {
  const out: WrappedTile[] = []
  if (s.topSite) out.push({ key: 'site', label: 'Most saved site', value: s.topSite.host, sub: plural(s.topSite.links, 'link') })
  if (s.busiestMonth) out.push({ key: 'month', label: 'Busiest month', value: monthName(s.busiestMonth.month), sub: `${plural(s.busiestMonth.links, 'link')} saved` })
  if (s.busiestStack) {
    out.push(
      names
        ? { key: 'stack', label: 'Busiest stack', value: s.busiestStack.name, sub: plural(s.busiestStack.links, 'link') }
        : { key: 'stack', label: 'Busiest stack', value: plural(s.busiestStack.links, 'link'), sub: '' },
    )
  }
  if (s.oldest) out.push({ key: 'oldest', label: 'Oldest link', value: s.oldest.host, sub: `saved ${fullDay(s.oldest.at)}` })
  return out
}

export interface WrappedFact {
  key: 'links' | 'spaces' | 'stacks' | 'todos' | 'stashes'
  label: string
  value: string
}

/** The smaller counts under the big facts: the board as it is now, then to-dos done and stashes when there are any. */
export function wrappedFacts(s: WrappedStats): WrappedFact[] {
  const word = (n: number, one: string, many: string) => (n === 1 ? one : many)
  const out: WrappedFact[] = [
    { key: 'links', label: word(s.links, 'Link on the board', 'Links on the board'), value: count(s.links) },
    { key: 'spaces', label: word(s.spaces, 'Space', 'Spaces'), value: count(s.spaces) },
    { key: 'stacks', label: word(s.stacks, 'Stack', 'Stacks'), value: count(s.stacks) },
  ]
  if (s.todosDone) out.push({ key: 'todos', label: word(s.todosDone, 'To-do done', 'To-dos done'), value: count(s.todosDone) })
  if (s.stashes) out.push({ key: 'stashes', label: word(s.stashes, 'Stash', 'Stashes'), value: count(s.stashes) })
  return out
}

/** "links saved" under the big number. */
export function heroWords(s: WrappedStats): string {
  return s.saved === 1 ? 'link saved' : 'links saved'
}

/** "520 links on the board, in 4 spaces and 23 stacks" */
export function boardLine(s: WrappedStats): string {
  return `${plural(s.links, 'link')} on the board, in ${plural(s.spaces, 'space')} and ${plural(s.stacks, 'stack')}`
}

/** What Copy text puts on the clipboard: the picture's words, one per line. */
export function wrappedShareText(s: WrappedStats, names: boolean): string {
  const lines = [`My ${s.year} in Stackboard`]
  lines.push(s.topSite ? `${plural(s.saved, 'link')} saved, most often from ${s.topSite.host}` : `${plural(s.saved, 'link')} saved`)
  for (const t of wrappedTiles(s, names)) {
    if (t.key === 'site') continue
    lines.push(t.sub ? `${t.label}: ${t.value} (${t.sub})` : `${t.label}: ${t.value}`)
  }
  for (const f of wrappedFacts(s)) if (f.key === 'todos' || f.key === 'stashes') lines.push(`${f.label}: ${f.value}`)
  lines.push(boardLine(s))
  lines.push(WRAPPED_URL)
  return lines.join('\n')
}

/** What the corner card, Settings and the dialog say. */
export const WRAPPED_COPY = {
  title: `Your ${WRAPPED_YEAR} in Stackboard`,
  settingsLine: 'Your year on the board in one picture you can share, made on this computer from your bookmarks.',
  open: 'See your year',
  notNow: 'Not now',
  intro: 'Made on this computer from your board. Nothing leaves it until you share the picture.',
  names: 'Show stack names',
  namesHint: "Adds your busiest stack's name to the picture.",
  privacy: 'The picture shows counts and site names only.',
  save: 'Save image',
  copy: 'Copy text',
  copied: 'Copied',
  file: `my-${WRAPPED_YEAR}-in-stackboard.png`,
} as const

/** The corner card's line: "312 links saved this year, most often from github.com. Here it is in one picture." */
export function wrappedCardLine(s: WrappedStats): string {
  const site = s.topSite ? `, most often from ${s.topSite.host}` : ''
  return `${plural(s.saved, 'link')} saved this year${site}. Here it is in one picture you can share.`
}

// ---------- When ----------

/** The Settings row: 1 Dec to 15 Jan, this computer's clock. */
export function wrappedSeason(now: number, year = WRAPPED_YEAR): boolean {
  return now >= new Date(year, 11, 1).getTime() && now < new Date(year + 1, 0, 16).getTime()
}

/** The corner card: 4 Dec to 15 Jan, so the December note has the first days of December to itself. */
export function wrappedCardSeason(now: number, year = WRAPPED_YEAR): boolean {
  return now >= new Date(year, 11, 4).getTime() && now < new Date(year + 1, 0, 16).getTime()
}

/**
 * localStorage stackable:wrapped2026, the one marker this keeps (on this computer only): how many
 * new tabs showed the card and the day it last did, whether it's retired (Not now, or the year was
 * opened), whether the picture was saved or its text copied, and the December note's window as the
 * card last found it with the day it found it there (noteSeen, noteDay), so the two never share a day.
 */
export interface WrappedMarker {
  shown: number
  day: string | null
  retired: boolean
  saved: boolean
  noteSeen: FoundingWindow | null
  noteDay: string | null
}

export const NO_MARKER: WrappedMarker = { shown: 0, day: null, retired: false, saved: false, noteSeen: null, noteDay: null }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseWrappedMarker(raw: string | null): WrappedMarker {
  if (!raw) return NO_MARKER
  let v: Partial<Record<keyof WrappedMarker, unknown>>
  try {
    v = JSON.parse(raw)
  } catch {
    return NO_MARKER
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return NO_MARKER
  const day = (x: unknown) => (typeof x === 'string' && DAY_RE.test(x) ? x : null)
  return {
    shown: typeof v.shown === 'number' && Number.isFinite(v.shown) && v.shown > 0 ? Math.floor(v.shown) : 0,
    day: day(v.day),
    retired: v.retired === true,
    saved: v.saved === true,
    noteSeen: v.noteSeen === 'december' || v.noteSeen === 'last-days' ? v.noteSeen : null,
    noteDay: day(v.noteDay),
  }
}

/**
 * The December note showed in a window the card hadn't seen it in: that happened today, as far as
 * this computer can tell (the card looks on every new tab from 1 Dec, a beat after the note decides),
 * so the card keeps off today. `noteShown` is the note's own marker (prefs.foundingNote).
 */
export function noteFoundingDay(m: WrappedMarker, noteShown: FoundingWindow | null, today: string): WrappedMarker {
  if (m.noteSeen === noteShown) return m
  return { ...m, noteSeen: noteShown, noteDay: noteShown ? today : m.noteDay }
}

export function markShown(m: WrappedMarker, today: string): WrappedMarker {
  return { ...m, shown: m.shown + 1, day: today }
}

export function markRetired(m: WrappedMarker): WrappedMarker {
  return m.retired ? m : { ...m, retired: true }
}

export function markSaved(m: WrappedMarker): WrappedMarker {
  return { ...m, retired: true, saved: true }
}

/** Whether the card is done for good on this computer, so there's nothing left to decide. */
export function cardFinished(m: WrappedMarker): boolean {
  return m.retired || m.shown >= WRAPPED_CARD_SHOWS
}

/**
 * Whether this new tab shows the corner card. From 4 Dec, on two new tabs at most and never twice in
 * a day; never under any company lock, never before a new install has settled in, and never on a
 * day the December note (the founding price, nudgePlan.ts) shows: while that note is still to come
 * in its window the card waits for it, and it keeps off the day the note showed. `marker` has been
 * through noteFoundingDay.
 */
export function wrappedCardDue(p: {
  now: number
  offered: boolean
  marker: WrappedMarker
  /** New tabs on this computer, this one included. */
  opens: number
  /** This computer's first new tab. */
  firstSeen: number
  /** Any setting the company's policy locks (school mode included). */
  locked: boolean
  /** The December note can show to this person: free or trial, and not an early user. */
  noteApplies: boolean
  /** The window the December note last showed in on this computer. */
  noteShown: FoundingWindow | null
  /** The empty-board welcome screen is up. */
  welcoming: boolean
}): boolean {
  if (!p.offered || p.locked || p.welcoming || !wrappedCardSeason(p.now)) return false
  if (cardFinished(p.marker)) return false
  const today = localDay(p.now)
  if (p.marker.day === today || p.marker.noteDay === today) return false
  if (p.opens < WRAPPED_CARD_OPENS || p.now - p.firstSeen < WRAPPED_CARD_WAIT_MS) return false
  // The December note still to come in this window (the same test foundingNote makes).
  const w = foundingWindow(p.now)
  if (p.noteApplies && w && p.noteShown !== w && p.noteShown !== 'last-days') return false
  return true
}
