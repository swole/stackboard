// The board's background picture (0.5.0). One Blob in IndexedDB, on this device only: never in
// chrome.storage (sync is far too small, and a picture has no business syncing) and no
// unlimitedStorage permission (one screen-sized image fits the default quota easily).

const DB_NAME = 'stackboard'
const STORE = 'files'
const KEY = 'background'

export interface BgImageRecord {
  blob: Blob
  name: string
  width: number
  height: number
  savedAt: number
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

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

export function loadBgImage(): Promise<BgImageRecord | undefined> {
  return run<BgImageRecord | undefined>('readonly', (s) => s.get(KEY))
}

export async function saveBgImage(record: BgImageRecord): Promise<void> {
  await run('readwrite', (s) => s.put(record, KEY))
}

export async function deleteBgImage(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY))
}

/** Plenty for a wallpaper, and a cap on what every new tab has to read and decode. */
const MAX_BYTES = 25 * 1024 * 1024

/** The longest edge worth keeping on this screen: at least 1920, at most 4K. */
function maxEdge(): number {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
  const long = typeof screen !== 'undefined' ? Math.max(screen.width, screen.height) * dpr : 1920
  return Math.min(3840, Math.max(1920, Math.round(long)))
}

/**
 * Turns the picked file into what gets stored. Big photos are scaled to the screen and saved as
 * WebP, so each new tab decodes a few hundred KB instead of a 20 MB original. GIFs stay as they
 * are (a canvas would drop the animation), and so do pictures that are already small.
 */
export async function prepareBgImage(file: File): Promise<BgImageRecord> {
  if (file.type && !file.type.startsWith('image/')) throw new Error("That file isn't a picture.")
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("Chrome can't open that picture. Try a JPG, PNG or WebP.")
  }
  const { width, height } = bitmap
  const scale = Math.min(1, maxEdge() / Math.max(width, height))
  const keep = file.type === 'image/gif' || (scale === 1 && file.size <= 4 * 1024 * 1024)
  if (keep) {
    bitmap.close()
    if (file.size > MAX_BYTES) throw new Error('That picture is over 25 MB. Try a smaller one.')
    return { blob: file, name: file.name, width, height, savedAt: Date.now() }
  }
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Chrome can't open that picture.")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })
  return { blob, name: file.name, width: w, height: h, savedAt: Date.now() }
}
