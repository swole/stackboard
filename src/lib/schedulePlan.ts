// Spaces that switch themselves (Pro, 0.9.0): a few rules pick the space a new tab opens on, by
// day and time ("Work on weekdays from 9 to 6"). Pure, so tests/unit.test.ts covers the clock.
// Rules sync through chrome.storage.sync and name the space by its name, since bookmark ids
// differ from one computer to the next. A rule only picks the space a new tab starts on; nothing
// switches while someone is looking at the board.

export const MAX_RULES = 3

export interface SpaceRule {
  /** The space's name, without its emoji. */
  space: string
  /** The days it applies, 0 = Sunday to 6 = Saturday. */
  days: number[]
  /** 'HH:MM' on the local clock. A `to` earlier than `from` runs past midnight; equal means all day. */
  from: string
  to: string
}

export type DaysPreset = 'every' | 'weekdays' | 'weekends' | 'pick'

export const DAY_SETS: Record<Exclude<DaysPreset, 'pick'>, number[]> = {
  every: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
}

/** Monday first, the way most calendars here read. */
export const WEEK: readonly { day: number; short: string }[] = [
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
  { day: 0, short: 'Sun' },
]

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Minutes past midnight for 'HH:MM', or null when it isn't a time. */
export function minutesOf(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null
  const m = TIME_RE.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Which preset a set of days is, or 'pick' for any other mix. */
export function daysPreset(days: readonly number[]): DaysPreset {
  const key = [...new Set(days)].sort().join(',')
  for (const [name, set] of Object.entries(DAY_SETS) as [Exclude<DaysPreset, 'pick'>, number[]][]) {
    if ([...set].sort().join(',') === key) return name
  }
  return 'pick'
}

function cleanDays(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
}

/** A stored rule, or null when it's broken (no space, no days, a bad time). */
export function parseRule(v: unknown): SpaceRule | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const space = typeof r.space === 'string' ? r.space.trim() : ''
  const days = cleanDays(r.days)
  if (!space || !days.length || minutesOf(r.from) === null || minutesOf(r.to) === null) return null
  return { space, days, from: r.from as string, to: r.to as string }
}

/** sync `spaceSchedule` = { v: 1, rules }: the good rules, at most MAX_RULES. */
export function parseRules(v: unknown): SpaceRule[] {
  const rules = (v as { rules?: unknown } | null | undefined)?.rules
  if (!Array.isArray(rules)) return []
  return rules.map(parseRule).filter((r): r is SpaceRule => !!r).slice(0, MAX_RULES)
}

/** True when the rule covers this moment. A rule past midnight counts from the day it started. */
export function ruleMatches(rule: SpaceRule, now: Date): boolean {
  const from = minutesOf(rule.from)
  const to = minutesOf(rule.to)
  if (from === null || to === null) return false
  const day = now.getDay()
  const minute = now.getHours() * 60 + now.getMinutes()
  if (from === to) return rule.days.includes(day)
  if (from < to) return rule.days.includes(day) && minute >= from && minute < to
  return (rule.days.includes(day) && minute >= from) || (rule.days.includes((day + 6) % 7) && minute < to)
}

/** The space a rule names: the first with that name, ignoring case. */
export function spaceFor<S extends { name: string }>(rule: SpaceRule, spaces: readonly S[]): S | null {
  const want = rule.space.trim().toLowerCase()
  return spaces.find((s) => s.name.trim().toLowerCase() === want) ?? null
}

/** The id of the space a new tab should open on now: the first matching rule whose space exists. */
export function scheduledSpace(rules: readonly SpaceRule[], spaces: readonly { id: string; name: string }[], now: Date): string | null {
  for (const rule of rules) {
    if (!ruleMatches(rule, now)) continue
    const space = spaceFor(rule, spaces)
    if (space) return space.id
  }
  return null
}

/** A new rule to start from: the first space, weekdays, 9 to 6. */
export function newRule(spaces: readonly { name: string }[]): SpaceRule {
  return { space: spaces[0]?.name ?? '', days: [...DAY_SETS.weekdays], from: '09:00', to: '18:00' }
}
