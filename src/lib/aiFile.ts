import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { readLocks } from './company'
import { fileBody, readPick, type FileTarget, type Suggestion } from './filePlan'

// "Let AI pick the stack" (Pro, 0.9.0): off until switched on in Settings, and only with an active
// Pro key, since the server checks it (site/api/_lib/license.js) and a trial has none. When it's on,
// the toolbar popup sends the page's title and address and the board's stack paths to
// site/api/file.js and offers its pick first. Anything slow or failing falls back to the local match.
// School mode: the company's ai lock keeps it off, whatever was switched on, and nothing asks the server.

export const FILE_API = 'https://getstackboard.com/api/file'
/** sync: { on, at }. Switching it on in Settings is the consent to send pages for a pick. */
export const AI_FILE_KEY = 'aiFile'
const READY = 'aiFileReady' // local: { ready, at }
/** How long the server's answer is trusted, as for AI tidy (kept here so the popup doesn't load tidy's code). */
const READY_TTL_MS = 24 * 60 * 60 * 1000
/** The popup waits this long for the pick before it keeps the local match. */
// Picks took 1.5 to 2.4 s in testing, and the first one also waits on the server's key check;
// the popup shows its own match meanwhile, so waiting longer costs nothing.
export const PICK_TIMEOUT_MS = 4000

interface AiFileStore {
  /** null until read */
  on: boolean | null
  /** null until known on this computer */
  ready: boolean | null
}

export const useAiFile = create<AiFileStore>(() => ({ on: null, ready: null }))

function readOn(v: unknown): boolean {
  return (v as { on?: unknown } | undefined)?.on === true
}

/**
 * Whether AI picks are on here: switched on for this Chrome profile, and not turned off by the
 * company's ai lock. The lock leaves the saved choice alone, so it comes back if the lock goes.
 */
export async function loadAiFile(): Promise<boolean> {
  if (!IS_EXTENSION) return false
  const [got, locks] = await Promise.all([chrome.storage.sync.get(AI_FILE_KEY).catch(() => ({}) as Record<string, unknown>), readLocks()])
  const on = !locks.ai && readOn(got[AI_FILE_KEY])
  useAiFile.setState({ on })
  return on
}

export async function setAiFile(on: boolean): Promise<void> {
  useAiFile.setState({ on })
  if (IS_EXTENSION) await chrome.storage.sync.set({ [AI_FILE_KEY]: { on, at: Date.now() } })
}

/** Is the server switched on? Asked at most once a day, only while Settings shows the option. */
export async function checkAiFileReady(): Promise<boolean> {
  if (!IS_EXTENSION || (await readLocks()).ai) return false
  const got = await chrome.storage.local.get(READY).catch(() => ({}) as Record<string, unknown>)
  const r = got[READY] as { ready?: unknown; at?: unknown } | undefined
  const now = Date.now()
  if (r && typeof r.ready === 'boolean' && typeof r.at === 'number' && r.at <= now && now - r.at < READY_TTL_MS) {
    useAiFile.setState({ ready: r.ready })
    return r.ready
  }
  let ready = false
  try {
    const res = await fetch(FILE_API, { method: 'GET', signal: AbortSignal.timeout(10_000) })
    const body = (await res.json().catch(() => null)) as { ready?: unknown } | null
    ready = res.ok && body?.ready === true
    await chrome.storage.local.set({ [READY]: { ready, at: now } }).catch(() => {})
  } catch {
    // offline: hide it for now and ask again next time Settings opens
  }
  useAiFile.setState({ ready })
  return ready
}

/** This computer's active Pro key, read straight from storage (the popup has no Pro store). */
export async function activeKey(): Promise<{ key: string; activationId: string } | null> {
  if (!IS_EXTENSION) return null
  const got = await chrome.storage.local.get('proLicense').catch(() => ({}) as Record<string, unknown>)
  const l = got.proLicense as { key?: unknown; activationId?: unknown; status?: unknown } | undefined
  if (!l || typeof l.key !== 'string' || typeof l.activationId !== 'string' || l.status !== 'granted') return null
  return { key: l.key, activationId: l.activationId }
}

/** The AI's pick for this page, or null (switched off here or by the company's ai lock, no key, slow, or no stack fits). */
export async function askAiPick(page: { url: string; title: string }, targets: FileTarget[]): Promise<Suggestion | null> {
  if (!IS_EXTENSION || !targets.length) return null
  const [on, license] = await Promise.all([loadAiFile(), activeKey()])
  if (!on || !license) return null
  try {
    const res = await fetch(FILE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fileBody(page, targets, license)),
      signal: AbortSignal.timeout(PICK_TIMEOUT_MS),
    })
    if (res.status === 503) await chrome.storage.local.set({ [READY]: { ready: false, at: Date.now() } }).catch(() => {})
    if (!res.ok) return null
    return readPick(await res.json().catch(() => null), targets)
  } catch {
    return null
  }
}
