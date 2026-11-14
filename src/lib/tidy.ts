import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { readLocksSettled } from './company'
import { READY_TTL_MS, TIDY_API, readAnswer, type PlannedStack, type TidyBody, type TidyError } from './tidyPlan'

// AI tidy on this computer (Pro, 0.7.1): is the server switched on, has the notice been accepted,
// and the one call that asks for a plan. The rules and the moves are in tidyPlan.ts.
// Only a Pro key can call the server (site/api/_lib/license.js), so nothing here runs for a free
// board: the readiness check happens only for an active key, only when Settings or a space menu
// opens (never on a plain new tab), and its answer is kept for a day. Since 0.9.0 the button shows
// for an active key unless that answer says off, so a new key gets Tidy without opening Settings.
// 0.9.5: the one free tidy calls it too, with no key, and until it's used the same check runs for it.
// Whether it's used is kept in sync storage, so the Chrome profile's other computers know.
// School mode: with the company's ai lock nothing here talks to the server at all. 0.9.6: that lock
// is read from the policy's real answer, never the board's 1.5 s race (company.ts readLocksSettled).

const READY = 'tidyReady' // local: { ready, at }
// local: true once the notice was accepted on this computer. "2" since 0.8.0, when the notice began
// saying links in folders go too, so everyone sees it once more.
const NOTICE = 'tidyNotice2'
/** sync: { at } once the free tidy ran (0.9.5); local as well when sync storage was full. */
const FREE = 'freeTidy'
const TIMEOUT_MS = 90_000

interface TidyStore {
  /** null until known on this computer */
  ready: boolean | null
  /** true once this page has read the last answer from storage */
  loaded: boolean
  /** 0.9.5: the Chrome profile has used its free tidy; null until read (no free tidy meanwhile) */
  freeUsed: boolean | null
}

export const useTidy = create<TidyStore>(() => ({ ready: null, loaded: false, freeUsed: null }))

function readReady(v: unknown, now: number): boolean | null {
  const r = v as { ready?: unknown; at?: unknown } | undefined
  if (!r || typeof r.ready !== 'boolean' || typeof r.at !== 'number') return null
  return now - r.at < READY_TTL_MS && r.at <= now ? r.ready : null
}

async function saveReady(ready: boolean): Promise<void> {
  useTidy.setState({ ready })
  await chrome.storage.local.set({ [READY]: { ready, at: Date.now() } }).catch(() => {})
}

/** The last answer this computer got, if it's under a day old. Reads storage only, never the network. */
export async function loadReady(): Promise<boolean | null> {
  if (!IS_EXTENSION) return null
  const got = await chrome.storage.local.get(READY).catch(() => ({}) as Record<string, unknown>)
  const ready = readReady(got[READY], Date.now())
  useTidy.setState(ready !== null ? { ready, loaded: true } : { loaded: true })
  return ready
}

/** Is the server switched on? Asked at most once a day (a GET with nothing about the person in it). */
export async function checkReady(): Promise<boolean> {
  if (IS_EXTENSION && (await readLocksSettled()).ai) return false
  const known = await loadReady()
  if (known !== null || !IS_EXTENSION) return !!known
  try {
    const r = await fetch(TIDY_API, { method: 'GET', signal: AbortSignal.timeout(10_000) })
    const body = (await r.json().catch(() => null)) as { ready?: unknown } | null
    const ready = r.ok && body?.ready === true
    await saveReady(ready)
    return ready
  } catch {
    useTidy.setState({ ready: false }) // offline: hide it for now, ask again next time a menu opens
    return false
  }
}

/**
 * For Settings and the space menus: asks whether Tidy is on, for someone who can press it (tidyAccess):
 * an active Pro key, or since 0.9.5 the free tidy before it's used. The trial alone has no paid Tidy.
 */
export function refreshTidyReady(canTidy: boolean): void {
  if (canTidy && IS_EXTENSION) void checkReady()
}

let freeWatched = false
/** Reads are numbered, so one that resolves after a newer read, or after the mark, changes nothing. */
let freeRead = 0

async function readFree(): Promise<void> {
  const n = ++freeRead
  try {
    const [sync, local] = await Promise.all([chrome.storage.sync.get(FREE), chrome.storage.local.get(FREE)])
    if (n === freeRead) useTidy.setState({ freeUsed: sync[FREE] != null || local[FREE] != null })
  } catch {
    // storage unreadable: it stays unknown, which offers no free tidy
  }
}

/** Whether the free tidy is used (0.9.5): read once per page, then followed in other tabs and computers. Storage only. */
export function loadFreeTidy(): void {
  if (!IS_EXTENSION || freeWatched) return
  freeWatched = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'sync' || area === 'local') && FREE in changes) void readFree()
  })
  void readFree()
}

/** The free tidy ran: hides its button here at once and tells the profile's other computers through sync. */
export async function markFreeTidyUsed(): Promise<void> {
  freeRead++
  useTidy.setState({ freeUsed: true })
  if (!IS_EXTENSION) return
  const mark = { [FREE]: { at: Date.now() } }
  // Sync storage full (big to-do lists): this computer still remembers.
  await chrome.storage.sync.set(mark).catch(() => chrome.storage.local.set(mark)).catch(() => {})
}

export async function noticeAccepted(): Promise<boolean> {
  if (!IS_EXTENSION) return true
  return !!(await chrome.storage.local.get(NOTICE).catch(() => ({}) as Record<string, unknown>))[NOTICE]
}

export async function acceptNotice(): Promise<void> {
  if (IS_EXTENSION) await chrome.storage.local.set({ [NOTICE]: true })
}

/**
 * Asks the server for a plan. A "switched off" answer also hides the button until the next check.
 * 0.9.6: the locks are the policy's real answer, however long it takes; the free tidy also stays off
 * under the pro lock, as tidyAccess has it, in case the button showed before the policy answered.
 */
export async function requestTidy(body: TidyBody): Promise<{ plan: PlannedStack[] } | { error: TidyError }> {
  const locks = await readLocksSettled()
  if (locks.ai || (body.free && locks.pro)) return { error: 'not-ready' }
  let status = 0
  let data: unknown = null
  try {
    const r = await fetch(TIDY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = r.status
    data = await r.json().catch(() => null)
  } catch {
    return { error: 'busy' }
  }
  const out = readAnswer(status, data, body.links.length, !!body.free)
  if ('error' in out && out.error === 'not-ready') await saveReady(false)
  return out
}
