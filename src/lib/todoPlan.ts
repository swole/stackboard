import { isDay, isMonthDay, isRepeat, type Repeat } from './duePlan'

// To-do stacks (0.6.0). A to-do stack is an ordinary stack folder holding one marker bookmark,
// https://getstackboard.com/todo#<id>. The folder gives the list its name, its space and its
// place on the board, all synced with the bookmarks; the items live in chrome.storage.sync under
// todo:<id>, because a to-do is not a link. Pure helpers only: todos.ts does the I/O.
//
// 0.8.0: due days, repeats and month anchors live apart, under todoDue:<id> ({ [itemId]: entry }).
// 0.7.0 rewrites todo:<id> with only id/text/done/at whenever it saves a list, so a computer that
// hasn't updated yet would erase them if they sat on the items; it never touches todoDue:<id>.
// parseList also keeps item fields it doesn't know, so later versions don't lose data to this one.

export const TODO_MARKER_BASE = 'https://getstackboard.com/todo#'
export const TODO_MARKER_TITLE = 'Stackboard to-do list'
export const TODO_KEY_PREFIX = 'todo:'
/** Due data per list (0.8.0). Doesn't start with TODO_KEY_PREFIX, so 0.7.0's sweep never sees it. */
export const TODO_DUE_PREFIX = 'todoDue:'
export const TODO_MAX_ITEMS = 100
export const TODO_MAX_TEXT = 280
// chrome.storage.sync allows 8,192 bytes per item, key included; keep a margin.
export const TODO_MAX_BYTES = 8000
// A list whose stack is gone waits this long before its items are dropped (undo, slow sync).
export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000

const ID_RE = /^[a-z0-9]{8,32}$/

export interface TodoItem {
  id: string
  text: string
  done: boolean
  /** ms since epoch, when it was added */
  at: number
  /** Due day, local 'YYYY-MM-DD' (Pro, 0.7.1; duePlan.ts). Absent on undated items. */
  d?: string
  /** Repeat rule, only with a due day (Pro, 0.7.1). */
  r?: Repeat
  /**
   * Monthly repeats only: the day of the month it was set for (1-31), so a date clamped into a
   * short month (28 Feb) goes back to the 28th, 30th or 31st after it. Items saved before it
   * existed step from their date as before.
   */
  md?: number
}

export interface TodoList {
  v: 1
  items: TodoItem[]
  /** Set when a device saw this list's stack disappear; cleared if the stack comes back. */
  orphanSince?: number
}

export function newTodoId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export function todoMarkerUrl(id: string): string {
  return TODO_MARKER_BASE + id
}

/** The list id when a bookmark URL is a to-do marker, else null. */
export function todoIdFromUrl(url: string | undefined): string | null {
  if (!url || !url.startsWith(TODO_MARKER_BASE)) return null
  const id = url.slice(TODO_MARKER_BASE.length)
  return ID_RE.test(id) ? id : null
}

export function todoKey(id: string): string {
  return TODO_KEY_PREFIX + id
}

export function todoDueKey(id: string): string {
  return TODO_DUE_PREFIX + id
}

/** A to-do's due day, repeat and month anchor, stored apart from the item (0.8.0). */
export interface DueEntry {
  d: string
  r?: Repeat
  md?: number
}

export type DueMap = Record<string, DueEntry>

/** The item fields this version knows; parseList keeps every other field as it found it. */
const KNOWN_ITEM_FIELDS = new Set(['id', 'text', 'done', 'at', 'd', 'r', 'md'])

function dueEntry(raw: unknown): DueEntry | null {
  const r = raw as Partial<DueEntry> | null | undefined
  if (!r || !isDay(r.d)) return null
  const e: DueEntry = { d: r.d }
  if (isRepeat(r.r)) e.r = r.r
  if (e.r === 'm' && isMonthDay(r.md)) e.md = r.md
  return e
}

/** Whatever todoDue:<id> holds, as valid entries only. */
export function parseDue(raw: unknown): DueMap {
  const out: DueMap = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = dueEntry(v)
    if (e) out[id] = e
  }
  return out
}

/**
 * The list as stored: the items without their due fields (todo:<id>) and the due fields by item
 * id (todoDue:<id>). Entries exist only for items on the list, so a due entry whose item was
 * deleted (say on a computer still on 0.7.0) drops out at the next save.
 */
export function splitDue(list: TodoList): { items: TodoList; due: DueMap } {
  const due: DueMap = {}
  const items = list.items.map((it) => {
    const { d, r, md, ...rest } = it
    const e = dueEntry({ d, r, md })
    if (e) due[it.id] = e
    return rest as TodoItem
  })
  return { items: { ...list, items }, due }
}

/**
 * The list as the board uses it: due fields back on their items. The todoDue entry wins; an item
 * without one keeps a due day saved on the item itself (0.8.0 test builds), which the next save
 * moves over. Entries for items that are gone are ignored.
 */
export function mergeDue(list: TodoList, rawDue: unknown): TodoList {
  const due = parseDue(rawDue)
  if (!Object.keys(due).length) return list
  return {
    ...list,
    items: list.items.map((it) => {
      const e = due[it.id]
      if (!e) return it
      const { d: _d, r: _r, md: _md, ...rest } = it
      return { ...rest, ...e }
    }),
  }
}

export function dueBytes(key: string, due: DueMap): number {
  return new TextEncoder().encode(key + JSON.stringify(due)).length
}

export function emptyList(): TodoList {
  return { v: 1, items: [] }
}

/** One line, trimmed, at most TODO_MAX_TEXT characters (code points, so emoji stay whole). */
export function cleanText(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim()
  const chars = [...one]
  return chars.length > TODO_MAX_TEXT ? chars.slice(0, TODO_MAX_TEXT).join('').trimEnd() : one
}

/** Whatever storage holds, as a valid list: bad items are dropped, never thrown on. */
export function parseList(raw: unknown): TodoList {
  const r = raw as { items?: unknown; orphanSince?: unknown } | null
  const out = emptyList()
  if (!r || !Array.isArray(r.items)) return out
  const seen = new Set<string>()
  for (const it of r.items as Array<Partial<TodoItem>>) {
    if (!it || typeof it.id !== 'string' || typeof it.text !== 'string' || seen.has(it.id)) continue
    const text = cleanText(it.text)
    if (!text) continue
    seen.add(it.id)
    // Fields from a later version ride along untouched, so saving here never strips them.
    const extra: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(it)) if (!KNOWN_ITEM_FIELDS.has(k)) extra[k] = v
    const item = { ...extra, id: it.id, text, done: it.done === true, at: Number(it.at) || 0 } as TodoItem
    // 0.7.1: a due day and a repeat ride along when valid; a repeat needs a day.
    if (isDay(it.d)) {
      item.d = it.d
      if (isRepeat(it.r)) item.r = it.r
      if (item.r === 'm' && isMonthDay(it.md)) item.md = it.md
    }
    out.items.push(item)
    if (out.items.length >= TODO_MAX_ITEMS) break
  }
  if (typeof r.orphanSince === 'number') out.orphanSince = r.orphanSince
  return out
}

export class TodoFullError extends Error {}

export function addItem(list: TodoList, text: string, now: number, id = newTodoId()): TodoList {
  const clean = cleanText(text)
  if (!clean) return list
  if (list.items.length >= TODO_MAX_ITEMS) {
    throw new TodoFullError(`A list holds ${TODO_MAX_ITEMS} to-dos; clear the done ones first`)
  }
  return { ...list, items: [...list.items, { id, text: clean, done: false, at: now }] }
}

export function toggleItem(list: TodoList, id: string): TodoList {
  return { ...list, items: list.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) }
}

/** Empty text removes the item, like clearing a line in a notes app. */
export function editItem(list: TodoList, id: string, text: string): TodoList {
  const clean = cleanText(text)
  if (!clean) return removeItem(list, id)
  return { ...list, items: list.items.map((it) => (it.id === id ? { ...it, text: clean } : it)) }
}

export function removeItem(list: TodoList, id: string): TodoList {
  return { ...list, items: list.items.filter((it) => it.id !== id) }
}

/** Puts a removed item back where it was (undo). A no-op if it is already there. */
export function restoreItem(list: TodoList, item: TodoItem, index: number): TodoList {
  if (list.items.some((it) => it.id === item.id)) return list
  const items = list.items.slice()
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item)
  return { ...list, items }
}

export function clearDone(list: TodoList): TodoList {
  return { ...list, items: list.items.filter((it) => !it.done) }
}

/** Open items first, then done ones, each in the order they were added. */
export function ordered(items: TodoItem[]): TodoItem[] {
  return [...items.filter((it) => !it.done), ...items.filter((it) => it.done)]
}

export function countOpen(list: TodoList | null): number {
  return list ? list.items.filter((it) => !it.done).length : 0
}

export function listBytes(key: string, list: TodoList): number {
  return new TextEncoder().encode(key + JSON.stringify(list)).length
}

export interface SweepPlan {
  mark: string[]
  unmark: string[]
  drop: string[]
  /** Lists this device has shown on its board; only those can be marked from here. */
  seen: string[]
}

/**
 * Which stored lists lost their stack. A device marks only lists it has shown and no longer
 * finds, so a device with bookmark sync turned off never marks lists from another device.
 * Any device drops a list once it has been marked for the grace period and is still missing.
 */
export function planSweep(
  stored: Record<string, TodoList>,
  live: Iterable<string>,
  seen: Iterable<string>,
  now: number,
): SweepPlan {
  const liveSet = new Set(live)
  const seenSet = new Set(seen)
  const plan: SweepPlan = { mark: [], unmark: [], drop: [], seen: [] }
  for (const [id, list] of Object.entries(stored)) {
    if (liveSet.has(id)) {
      if (list.orphanSince !== undefined) plan.unmark.push(id)
    } else if (list.orphanSince !== undefined) {
      if (now - list.orphanSince >= ORPHAN_GRACE_MS) plan.drop.push(id)
    } else if (seenSet.has(id)) {
      plan.mark.push(id)
    }
  }
  const dropped = new Set(plan.drop)
  plan.seen = [...new Set([...liveSet, ...[...seenSet].filter((id) => id in stored && !dropped.has(id))])]
  return plan
}
