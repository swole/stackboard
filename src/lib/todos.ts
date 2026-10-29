import {
  TODO_KEY_PREFIX,
  TODO_MAX_BYTES,
  listBytes,
  parseList,
  planSweep,
  todoKey,
  type TodoList,
} from './todoPlan'

// To-do items live in chrome.storage.sync (0.6.0): Chrome syncs them with the user's other
// extension data and they never reach us. Outside an extension (vite preview) they live in
// localStorage, with a few sample items for the demo board.

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

async function writeRaw(key: string, list: TodoList): Promise<void> {
  if (HAS_SYNC) return chrome.storage.sync.set({ [key]: list })
  try {
    localStorage.setItem(DEMO_PREFIX + key, JSON.stringify(list))
    window.dispatchEvent(new StorageEvent('storage', { key: DEMO_PREFIX + key }))
  } catch {
    // the demo just forgets
  }
}

export async function loadList(id: string): Promise<TodoList> {
  return parseList(await readRaw(todoKey(id)))
}

// One write at a time per list within a page, each reading the latest stored copy, so two
// quick clicks never write over each other.
const queues = new Map<string, Promise<unknown>>()

/** Applies `fn` to the stored list and saves it. Throws if the result won't fit Chrome's per-item quota. */
export function updateList(id: string, fn: (list: TodoList) => TodoList): Promise<TodoList> {
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const key = todoKey(id)
    const current = parseList(await readRaw(key))
    const next = fn(current)
    if (next === current) return current
    if (listBytes(key, next) > TODO_MAX_BYTES) {
      throw new Error('This list is full; clear the done items or shorten a few')
    }
    await writeRaw(key, next)
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
  if (HAS_SYNC) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && key in changes) onChange(parseList(changes[key].newValue))
    }
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  }
  const handler = (e: StorageEvent) => {
    if (e.key === DEMO_PREFIX + key) void loadList(id).then(onChange)
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
  if (plan.drop.length) await chrome.storage.sync.remove(plan.drop.map(todoKey))
  if (plan.seen.join() !== seen.join()) await chrome.storage.local.set({ [SEEN_KEY]: plan.seen })
}
