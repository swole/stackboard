import { IS_EXTENSION, createTodoStack, ensureRoot, exportBackup } from './bookmarks'
import { buildSpaceTitle } from './icon'
import { newTodoId, parseList } from './todoPlan'
import { dueFromBackup } from './duePlan'
import { saveList } from './todos'
import { writeBackupStack, type CreateApi } from './folderPlan'
import {
  SNAPSHOT_KEEP_SHRUNK,
  countBackup,
  dayKey,
  isEmptyBoard,
  keysToPrune,
  parseSnapshot,
  restoredName,
  sortSnapshots,
  type BackupSpace,
  type Snapshot,
} from './snapshotPlan'

// Daily snapshots (Pro, 0.7.0). One copy of the board a day in IndexedDB on this computer, the
// newest 14 kept. Never chrome.storage: sync is far too small, and 14 copies of a big board can
// outgrow local's 10 MB. No unlimitedStorage permission either: a board of a few thousand links
// is a few hundred KB a day. A restore only ever adds: each space comes back as a dated copy at
// the end of the board, so nothing that exists is changed or deleted.

const DB_NAME = 'stackboard-snapshots'
const STORE = 'days' // key: 'YYYY-MM-DD', value: Snapshot
/** localStorage: the last day this browser saved a snapshot, so later new tabs skip IndexedDB. */
const MARKER = 'stackable:snapshotDay'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** One transaction; resolves with the last request's result once it commits. */
async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error ?? req?.error)
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

function readMarker(): string | null {
  try {
    return localStorage.getItem(MARKER)
  } catch {
    return null
  }
}

function writeMarker(day: string): void {
  try {
    localStorage.setItem(MARKER, day)
  } catch {
    // storage blocked: the next tab checks IndexedDB instead, which still never overwrites today's
  }
}

let pending: Promise<boolean> | null = null

/**
 * Takes today's snapshot if this computer hasn't yet. The first new tab of the day wins: today's
 * is never overwritten (two tabs racing both try `add`, and the second one's add fails). An empty
 * board is never saved. Returns true when a snapshot was saved. Call it only while Pro or the
 * trial is on.
 */
export function maybeTakeDailySnapshot(now: Date = new Date()): Promise<boolean> {
  if (!IS_EXTENSION || typeof indexedDB === 'undefined') return Promise.resolve(false)
  const today = dayKey(now)
  if (readMarker() === today) return Promise.resolve(false)
  pending ??= takeSnapshot(today, now.getTime())
    .catch((err) => {
      console.warn('Stackboard: daily snapshot failed', err)
      return false
    })
    .finally(() => {
      pending = null
    })
  return pending
}

async function takeSnapshot(today: string, at: number): Promise<boolean> {
  if (await run('readonly', (s) => s.count(today))) {
    writeMarker(today)
    return false
  }
  const backup = await exportBackup()
  const counts = countBackup(backup)
  if (isEmptyBoard(counts)) return false // no marker: a board filled later today still gets one
  const snapshot: Snapshot = { day: today, at, counts, backup }
  try {
    await run('readwrite', (s) => s.add(snapshot, today))
  } catch (err) {
    if ((err as DOMException | null)?.name !== 'ConstraintError') throw err
    writeMarker(today) // another tab saved today's a moment earlier
    return false
  }
  writeMarker(today)
  const all = (((await run('readonly', (s) => s.getAll())) ?? []) as unknown[]).map(parseSnapshot).filter((x): x is Snapshot => !!x)
  const keys = ((await run('readonly', (s) => s.getAllKeys())) ?? []).map(String)
  // A board that just lost half its links (a mass delete, a sync wipe) must not push the good days
  // out: keep up to 30 days until it recovers.
  const most = Math.max(0, ...all.filter((x) => x.day !== today).map((x) => x.counts.links))
  const shrunk = most > 0 && counts.links < most / 2
  const prune = keysToPrune(keys, shrunk ? SNAPSHOT_KEEP_SHRUNK : undefined)
  if (prune.length) {
    await run('readwrite', (s) => {
      for (const k of prune) s.delete(k)
      return undefined
    })
  }
  return true
}

/** Every snapshot on this computer, newest first. Records that don't read back are left out. */
export async function listSnapshots(): Promise<Snapshot[]> {
  if (!IS_EXTENSION || typeof indexedDB === 'undefined') return []
  const all = ((await run('readonly', (s) => s.getAll())) ?? []) as unknown[]
  return sortSnapshots(all.map(parseSnapshot).filter((s): s is Snapshot => !!s))
}

/** Creates one space from a snapshot at the end of the board, under its dated name. Returns its id. */
async function addSpaceCopy(rootId: string, space: BackupSpace, day: string): Promise<string> {
  const spaceNode = await chrome.bookmarks.create({
    parentId: rootId,
    title: buildSpaceTitle(space.emoji, restoredName(space.name, day)),
  })
  for (const stack of space.stacks ?? []) {
    if (Array.isArray(stack.todo)) {
      // A new list id, so the copy and any list still on the board never share items.
      const id = newTodoId()
      await createTodoStack(spaceNode.id, stack.name, id)
      const now = Date.now()
      const items = stack.todo.map((it, i) => ({ id: newTodoId(), text: String(it?.text ?? ''), done: it?.done === true, at: now + i, ...dueFromBackup(it) }))
      try {
        await saveList(id, parseList({ items }))
      } catch (err) {
        // Chrome's sync quota is full: the stack comes back, its items don't.
        console.warn('Stackboard: restored to-do items did not fit', err)
      }
      continue
    }
    // The stack, its links and its folders, nested (0.8.0). A link Chrome refuses is skipped.
    await writeBackupStack(chrome.bookmarks as unknown as CreateApi, spaceNode.id, stack, (url, err) =>
      console.warn('Stackboard: skipped a link Chrome would not save', url, err),
    )
  }
  return spaceNode.id
}

/** Adds one space from the snapshot back as a dated copy. Returns the new space id. */
export async function restoreSpace(snapshot: Snapshot, index: number): Promise<string> {
  const space = snapshot.backup.spaces[index]
  if (!space) throw new Error('That space is not in this snapshot')
  return addSpaceCopy(await ensureRoot(), space, snapshot.day)
}

/** Adds every space from the snapshot back as dated copies, in order. Returns the new space ids. */
export async function restoreAll(snapshot: Snapshot): Promise<string[]> {
  const rootId = await ensureRoot()
  const ids: string[] = []
  for (const space of snapshot.backup.spaces) ids.push(await addSpaceCopy(rootId, space, snapshot.day))
  return ids
}
