import { IS_EXTENSION, exportBackup } from './bookmarks'
import { countBackup, dayKey, isEmptyBoard } from './snapshotPlan'
import { backupFileName, backupsToPrune } from './backupPlan'
import { readCompany } from './company'

// Back up to a folder (Pro, 0.9.0) on this computer: the folder the person picked, remembered in
// IndexedDB (a folder handle can't go in chrome.storage), and the writes. Uses the File System Access
// API from the new tab page, so there's no new permission and nothing is sent anywhere: the file goes
// from the browser into the folder, and the person's own Drive, OneDrive or Dropbox app syncs it.
// Chrome remembers the OK for the folder until the browser restarts, or for good when the person picks
// "Allow on every visit"; otherwise Settings shows a button to allow it again. Rules in backupPlan.ts.

const DB_NAME = 'stackboard-backup'
const STORE = 'folder'
const HANDLE = 'handle'
/** local: { day, at, folder } for the last file written. */
export const BACKUP_LAST = 'backupLast'

type Permission = 'granted' | 'prompt' | 'denied'

/** The parts of the File System Access API used here (TypeScript's DOM types lack the permission calls). */
export interface BackupDir {
  readonly name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
  removeEntry(name: string): Promise<void>
  keys(): AsyncIterableIterator<string>
  queryPermission?(d: { mode: 'readwrite' }): Promise<Permission>
  requestPermission?(d: { mode: 'readwrite' }): Promise<Permission>
}

type Picker = (o: { id?: string; mode?: 'readwrite' }) => Promise<BackupDir>

/** Brave turns the API off by default; Chrome and Edge have it. */
export function folderSupported(): boolean {
  return IS_EXTENSION && typeof (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker === 'function'
}

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

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error ?? req.error)
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

/** The folder picked on this computer, or null. */
export async function getFolder(): Promise<BackupDir | null> {
  if (!IS_EXTENSION || typeof indexedDB === 'undefined') return null
  return ((await run('readonly', (s) => s.get(HANDLE))) as BackupDir | undefined) ?? null
}

/** Opens the folder picker (needs a click). Returns the folder, or null when the person cancels. */
export async function chooseFolder(): Promise<BackupDir | null> {
  const pick = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker
  let dir: BackupDir
  try {
    dir = await pick({ id: 'stackboard-backups', mode: 'readwrite' })
  } catch (err) {
    if ((err as DOMException | null)?.name === 'AbortError') return null
    throw err
  }
  await run('readwrite', (s) => s.put(dir, HANDLE))
  await chrome.storage.local.remove(BACKUP_LAST).catch(() => {})
  return dir
}

export async function forgetFolder(): Promise<void> {
  await run('readwrite', (s) => s.delete(HANDLE))
  await chrome.storage.local.remove(BACKUP_LAST).catch(() => {})
}

/** Whether Chrome lets this page write to the folder right now. */
export async function folderPermission(dir: BackupDir): Promise<Permission> {
  return (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
}

/** Asks Chrome again (needs a click). True when it's allowed. */
export async function allowFolder(dir: BackupDir): Promise<boolean> {
  return ((await dir.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted'
}

export async function readLast(): Promise<{ day: string; at: number; folder: string } | null> {
  if (!IS_EXTENSION) return null
  const got = await chrome.storage.local.get(BACKUP_LAST).catch(() => ({}) as Record<string, unknown>)
  const l = got[BACKUP_LAST] as { day?: unknown; at?: unknown; folder?: unknown } | undefined
  return l && typeof l.day === 'string' && typeof l.at === 'number' ? { day: l.day, at: l.at, folder: String(l.folder ?? '') } : null
}

/**
 * Writes today's file (replacing one from earlier today), then drops our files past the newest 30.
 * An empty board is never written, as with snapshots, so a wiped board can't push the good days out.
 */
async function writeBackup(dir: BackupDir, day: string): Promise<boolean> {
  const backup = await exportBackup()
  if (isEmptyBoard(countBackup(backup))) return false
  const file = await dir.getFileHandle(backupFileName(day), { create: true })
  const out = await file.createWritable()
  await out.write(JSON.stringify(backup, null, 2))
  await out.close()
  const names: string[] = []
  for await (const name of dir.keys()) names.push(name)
  for (const name of backupsToPrune(names)) await dir.removeEntry(name).catch(() => {})
  await chrome.storage.local.set({ [BACKUP_LAST]: { day, at: Date.now(), folder: dir.name } })
  return true
}

export type BackupResult = 'written' | 'done' | 'none' | 'ask' | 'empty'

/**
 * Today's backup, once a day, after the daily snapshot (lib/snapshots.ts calls it while Pro or the
 * trial is on). `force` writes again even if today's file is there ("Back up now").
 */
export async function backupToday(opts: { now?: Date; force?: boolean } = {}): Promise<BackupResult> {
  const dir = await getFolder()
  if (!dir) return 'none'
  // Teams T8: a company that locks import and export stops backups too, even to a folder picked before the lock.
  if ((await readCompany().catch(() => null))?.config.lock.importExport) return 'none'
  if ((await folderPermission(dir)) !== 'granted') return 'ask'
  const day = dayKey(opts.now ?? new Date())
  if (!opts.force && (await readLast())?.day === day) return 'done'
  return (await writeBackup(dir, day)) ? 'written' : 'empty'
}
