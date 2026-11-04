import {
  TODO_DUE_PREFIX,
  TODO_KEY_PREFIX,
  TODO_MAX_BYTES,
  dueBytes,
  listBytes,
  mergeDue,
  parseDue,
  parseList,
  planSweep,
  splitDue,
  todoDueKey,
  todoKey,
  type TodoList,
} from './todoPlan'

// To-do items live in chrome.storage.sync (0.6.0): Chrome syncs them with the user's other
// extension data and they never reach us. Outside an extension (vite preview) they live in
// localStorage, with a few sample items for the demo board. Since 0.8.0 a list is two keys:
// todo:<id> for the items and todoDue:<id> for their due days (todoPlan.ts splitDue/mergeDue).

const HAS_SYNC = typeof chrome !== 'undefined' && !!chrome.storage?.sync
const SEEN_KEY = 'todoSeen' // chrome.storage.local: list ids this device has shown
const DEMO_PREFIX = 'stackable:demo-'

const DEMO_SEED: Record<string, TodoList> = {
  demo: {
    v: 1,
    items: [
      { id: 'demo1', text: 'Reply to the design review thread', done: false, at: 1 },
      { id: 'demo2', text: 'Book the team offsite room', done: false, at: 2 },
      { id: 'demo3', text: 'Renew the domain', done: true, at: 3 },
    ],
  },
}

async function readRaw(key: string): Promise<unknown> {
  if (HAS_SYNC) return (await chrome.storage.sync.get(key))[key]
  try {
    const s = localStorage.getItem(DEMO_PREFIX + key)
    if (s) return JSON.parse(s)
  } catch {
    // blocked storage: fall through to the seed
  }
  return DEMO_SEED[key.slice(TODO_KEY_PREFIX.length)]
}

/** Writes several keys in one go (one sync write when both parts of a list change). */
async function writeRaw(values: Record<string, unknown>): Promise<void> {
  if (HAS_SYNC) return chrome.storage.sync.set(values)
  try {
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(DEMO_PREFIX + key, JSON.stringify(value))
      window.dispatchEvent(new StorageEvent('storage', { key: DEMO_PREFIX + key }))
    }
  } catch {
    // the demo just forgets
  }
}

async function removeRaw(key: string): Promise<void> {
  if (HAS_SYNC) return chrome.storage.sync.remove(key)
  try {
    localStorage.removeItem(DEMO_PREFIX + key)
    window.dispatchEvent(new StorageEvent('storage', { key: DEMO_PREFIX + key }))
  } catch {
    // the demo just forgets
  }
}

export async function loadList(id: string): Promise<TodoList> {
  const [items, due] = await Promise.all([readRaw(todoKey(id)), readRaw(todoDueKey(id))])
  return mergeDue(parseList(items), due)
}

// One write at a time per list within a page, each reading the latest stored copy, so two
// quick clicks never write over each other.
const queues = new Map<string, Promise<unknown>>()

/** Applies `fn` to the stored list and saves it. Throws if the result won't fit Chrome's per-item quota. */
export function updateList(id: string, fn: (list: TodoList) => TodoList): Promise<TodoList> {
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const key = todoKey(id)
    const dueKey = todoDueKey(id)
    const [rawItems, rawDue] = await Promise.all([readRaw(key), readRaw(dueKey)])
    const storedItems = parseList(rawItems)
    const current = mergeDue(storedItems, rawDue)
    const next = fn(current)
    if (next === current) return current
    // Each key has Chrome's 8 KB item limit; both count against the list being full.
    const { items, due } = splitDue(next)
    if (listBytes(key, items) > TODO_MAX_BYTES || dueBytes(dueKey, due) > TODO_MAX_BYTES) {
      throw new Error('This list is full; clear the done items or shorten a few')
    }
    const writes: Record<string, unknown> = {}
    if (JSON.stringify(items) !== JSON.stringify(storedItems)) writes[key] = items
    const hasDue = Object.keys(due).length > 0
    const dueChanged = JSON.stringify(due) !== JSON.stringify(parseDue(rawDue))
    if (hasDue && dueChanged) writes[dueKey] = due
    if (Object.keys(writes).length) await writeRaw(writes)
    if (!hasDue && rawDue !== undefined) await removeRaw(dueKey)
    return next
  })
  queues.set(id, run)
  return run
}

/** Writes a whole list (backup import). */
export async function saveList(id: string, list: TodoList): Promise<void> {
  await updateList(id, () => list)
}

/** Calls back with the list whenever it changes in storage: this tab, another tab, another device. */
export function watchList(id: string, onChange: (list: TodoList) => void): () => void {
  const key = todoKey(id)
  const dueKey = todoDueKey(id)
  // Either part can change; read both again, and let only the newest read answer.
  let seq = 0
  const reload = () => {
    const mine = ++seq
    void loadList(id).then((l) => {
      if (mine === seq) onChange(l)
    })
  }
  if (HAS_SYNC) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && (key in changes || dueKey in changes)) reload()
    }
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  }
  const handler = (e: StorageEvent) => {
    if (e.key === DEMO_PREFIX + key || e.key === DEMO_PREFIX + dueKey) reload()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

/**
 * Drops the items of lists whose stack is gone for good. Marks first and drops a week later,
 * so an undo, a slow bookmark sync or a stack moved back in Chrome's bookmark manager keeps them.
 */
export async function sweepOrphans(liveIds: string[], now = Date.now()): Promise<void> {
  if (!HAS_SYNC) return
  const all = await chrome.storage.sync.get(null)
  const stored: Record<string, TodoList> = {}
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(TODO_KEY_PREFIX)) stored[key.slice(TODO_KEY_PREFIX.length)] = parseList(value)
  }
  const seen = ((await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] as string[] | undefined) ?? []
  const plan = planSweep(stored, liveIds, seen, now)
  const writes: Record<string, TodoList> = {}
  for (const id of plan.mark) writes[todoKey(id)] = { ...stored[id], orphanSince: now }
  for (const id of plan.unmark) {
    const { orphanSince: _gone, ...rest } = stored[id]
    writes[todoKey(id)] = rest
  }
  if (Object.keys(writes).length) await chrome.storage.sync.set(writes)
  // A dropped list takes its due days with it; due days whose list is gone (dropped by a computer
  // still on 0.7.0, which doesn't know this key) go too, unless the list is still on the board.
  const live = new Set(liveIds)
  const orphanDue = Object.keys(all)
    .filter((k) => k.startsWith(TODO_DUE_PREFIX))
    .map((k) => k.slice(TODO_DUE_PREFIX.length))
    .filter((id) => !(id in stored) && !live.has(id))
  const removeKeys = [...plan.drop.flatMap((id) => [todoKey(id), todoDueKey(id)]), ...orphanDue.map(todoDueKey)]
  if (removeKeys.length) await chrome.storage.sync.remove(removeKeys)
  if (plan.seen.join() !== seen.join()) await chrome.storage.local.set({ [SEEN_KEY]: plan.seen })
}
