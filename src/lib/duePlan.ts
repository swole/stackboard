import type { TodoItem, TodoList } from './todoPlan'

// Due dates and repeating to-dos (Pro, 0.7.1). Pure: no chrome.*, no DOM, so tests/unit.test.ts
// covers every rule. A due date is a local calendar day, 'YYYY-MM-DD', never a UTC instant: a
// to-do due "today" stays due today wherever the clock is. Items carry two short optional fields
// in chrome.storage.sync (d, r) so a full list still fits Chrome's 8 KB per-item quota.

/** d = daily, wd = weekdays (Mon-Fri), w = weekly, m = monthly. */
export type Repeat = 'd' | 'wd' | 'w' | 'm'

export const REPEATS: readonly { id: Repeat; label: string }[] = [
  { id: 'd', label: 'Daily' },
  { id: 'wd', label: 'Weekdays' },
  { id: 'w', label: 'Weekly' },
  { id: 'm', label: 'Monthly' },
]

/** Backups spell the rule out, so a JSON file reads plainly. */
const REPEAT_NAMES: Record<Repeat, string> = { d: 'daily', wd: 'weekdays', w: 'weekly', m: 'monthly' }

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The local calendar day of a moment, 'YYYY-MM-DD'. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Local midnight of a day, or null when the string isn't a real date ('2026-02-30' is not). */
export function parseDay(day: unknown): Date | null {
  if (typeof day !== 'string') return null
  const m = DAY_RE.exec(day)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

export function isDay(day: unknown): day is string {
  return parseDay(day) !== null
}

export function isRepeat(r: unknown): r is Repeat {
  return r === 'd' || r === 'wd' || r === 'w' || r === 'm'
}

/** A day of the month a monthly repeat keeps to (1-31). */
export function isMonthDay(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 31
}

/** The day of the month of a 'YYYY-MM-DD' day (0 when it isn't one). */
export function dayOfMonth(day: string): number {
  return parseDay(day)?.getDate() ?? 0
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  if (!d) return day
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * The next day for a rule, one step after `day`. Weekdays skip Saturday and Sunday. Monthly goes
 * to the anchor day `md` (the day of the month it was set for), clamped in short months: the 31st
 * gives 28 or 29 Feb, then 31 Mar; the 28th stays the 28th. Without an anchor (items saved before
 * 0.8.0) it keeps the date's own day, and a date on the last day of its month stays on month ends.
 */
export function stepDue(day: string, rule: Repeat, md?: number): string {
  const d = parseDay(day)
  if (!d) return day
  if (rule === 'd') return addDays(day, 1)
  if (rule === 'w') return addDays(day, 7)
  if (rule === 'wd') {
    const wd = d.getDay() // 0 Sun ... 6 Sat
    return addDays(day, wd === 5 ? 3 : wd === 6 ? 2 : 1)
  }
  const y = d.getFullYear()
  const m = d.getMonth()
  const ny = m === 11 ? y + 1 : y
  const nm = (m + 1) % 12
  const last = daysInMonth(ny, nm)
  if (isMonthDay(md)) return localDay(new Date(ny, nm, Math.min(md, last)))
  const monthEnd = d.getDate() === daysInMonth(y, m)
  return localDay(new Date(ny, nm, monthEnd ? last : Math.min(d.getDate(), last)))
}

/**
 * Where a repeating to-do moves when it's checked off: the first step after both its due date and
 * today, so finishing an overdue daily chore on Wednesday makes it due Thursday, and a weekly one
 * keeps its weekday.
 */
export function nextDue(day: string, rule: Repeat, today: string, md?: number): string {
  let next = stepDue(day, rule, md)
  // A year of daily steps covers any date the board could hold; the cap only guards bad input.
  for (let i = 0; next <= today && i < 3700; i++) next = stepDue(next, rule, md)
  return next
}

/** The quick picks in the menu. "Next week" is the coming Monday. */
export function quickDay(pick: 'today' | 'tomorrow' | 'next-week', today: string): string {
  if (pick === 'today') return today
  if (pick === 'tomorrow') return addDays(today, 1)
  const d = parseDay(today)
  const wd = d ? d.getDay() : 1
  return addDays(today, ((8 - wd) % 7) || 7)
}

export function isOverdue(day: string | undefined, today: string): boolean {
  return !!day && day < today
}

/** Due today or earlier. */
export function isDue(day: string | undefined, today: string): boolean {
  return !!day && day <= today
}

/** A short date in the browser's language ("Mon 4 Nov"), with the year when it isn't this year's. */
export function shortDate(day: string, today: string, locale?: string): string {
  const d = parseDay(day)
  if (!d) return day
  const sameYear = day.slice(0, 4) === today.slice(0, 4)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
    .format(d)
    .replace(/,/g, '')
}

/** "Today", "Tomorrow", "Yesterday", else the short date. */
export function dueLabel(day: string, today: string, locale?: string): string {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  if (day === addDays(today, -1)) return 'Yesterday'
  return shortDate(day, today, locale)
}

/** The label as it reads mid-sentence: "due tomorrow", "due Mon 4 Nov". */
export function spokenDue(day: string, today: string, locale?: string): string {
  const label = dueLabel(day, today, locale)
  return /^(Today|Tomorrow|Yesterday)$/.test(label) ? label.toLowerCase() : label
}

export function repeatLabel(r: Repeat): string {
  return REPEATS.find((x) => x.id === r)?.label ?? ''
}

// ---------- Edits on a list ----------

/**
 * Sets or clears the due date. Clearing the date also clears the repeat, which needs one. A new
 * date on a monthly item also moves its anchor day to the new date's day of the month.
 */
export function setDue(list: TodoList, id: string, day: string | null): TodoList {
  if (day !== null && !isDay(day)) return list
  return {
    ...list,
    items: list.items.map((it) => {
      if (it.id !== id) return it
      const { d: _d, r: _r, md: _md, ...rest } = it
      if (day === null) return rest
      return { ...rest, d: day, ...(it.r ? { r: it.r } : {}), ...(it.r === 'm' ? { md: dayOfMonth(day) } : {}) }
    }),
  }
}

/** Sets or clears the repeat. A repeat on an undated item starts today; monthly keeps its date's day. */
export function setRepeat(list: TodoList, id: string, r: Repeat | null, today: string): TodoList {
  return {
    ...list,
    items: list.items.map((it) => {
      if (it.id !== id) return it
      const { r: _r, md: _md, ...rest } = it
      if (!r) return rest
      const d = rest.d ?? today
      return { ...rest, d, r, ...(r === 'm' ? { md: dayOfMonth(d) } : {}) }
    }),
  }
}

/**
 * Ticks an item. A repeating item that's open (and `roll` on, i.e. Pro) moves to its next due date
 * and stays open; anything else flips done as before. `rolledTo` says where it went.
 */
export function checkItem(list: TodoList, id: string, today: string, roll: boolean): { list: TodoList; rolledTo: string | null } {
  const it = list.items.find((x) => x.id === id)
  if (!it) return { list, rolledTo: null }
  if (roll && !it.done && it.r && it.d) {
    const next = nextDue(it.d, it.r, today, it.md)
    return { list: { ...list, items: list.items.map((x) => (x.id === id ? { ...x, d: next } : x)) }, rolledTo: next }
  }
  return { list: { ...list, items: list.items.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) }, rolledTo: null }
}

/** Undo for a rolled repeat: puts the date back where it was, if nothing moved it since. */
export function unrollItem(list: TodoList, id: string, from: string, to: string): TodoList {
  return { ...list, items: list.items.map((x) => (x.id === id && x.d === to ? { ...x, d: from } : x)) }
}

// ---------- The Today list ----------

export interface DueEntry {
  listId: string
  item: TodoItem
}

/** Open items due today or earlier, across lists: earliest date first, then list and list order. */
export function dueToday(lists: ReadonlyArray<{ listId: string; list: TodoList | null }>, today: string): DueEntry[] {
  const out: (DueEntry & { li: number; ii: number })[] = []
  lists.forEach(({ listId, list }, li) => {
    list?.items.forEach((item, ii) => {
      if (!item.done && isDue(item.d, today)) out.push({ listId, item, li, ii })
    })
  })
  out.sort((a, b) => (a.item.d! < b.item.d! ? -1 : a.item.d! > b.item.d! ? 1 : a.li - b.li || a.ii - b.ii))
  return out.map(({ listId, item }) => ({ listId, item }))
}

/** How many open items are due today or earlier, across lists (the sidebar count). */
export function countDue(lists: Iterable<TodoList | null | undefined>, today: string): number {
  let n = 0
  for (const list of lists) for (const it of list?.items ?? []) if (!it.done && isDue(it.d, today)) n++
  return n
}

// ---------- Backups ----------

/** The due fields of an item, spelled out for a backup file; nothing for an undated item. */
export function dueForBackup(it: Pick<TodoItem, 'd' | 'r' | 'md'>): { due?: string; repeat?: string; monthDay?: number } {
  if (!it.d) return {}
  return {
    due: it.d,
    ...(it.r ? { repeat: REPEAT_NAMES[it.r] } : {}),
    ...(it.r === 'm' && isMonthDay(it.md) ? { monthDay: it.md } : {}),
  }
}

/** The stored fields back from a backup item (unknown or broken values are dropped). */
export function dueFromBackup(raw: { due?: unknown; repeat?: unknown; monthDay?: unknown } | null | undefined): Pick<TodoItem, 'd' | 'r' | 'md'> {
  const d = isDay(raw?.due) ? (raw!.due as string) : undefined
  if (!d) return {}
  const name = typeof raw?.repeat === 'string' ? raw.repeat : ''
  const r = (Object.keys(REPEAT_NAMES) as Repeat[]).find((k) => REPEAT_NAMES[k] === name || k === name)
  const md = r === 'm' && isMonthDay(raw?.monthDay) ? (raw!.monthDay as number) : undefined
  return { d, ...(r ? { r } : {}), ...(md ? { md } : {}) }
}
