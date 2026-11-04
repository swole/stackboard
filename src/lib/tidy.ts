import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { READY_TTL_MS, TIDY_API, readAnswer, type PlannedStack, type TidyError } from './tidyPlan'

// AI tidy on this computer (Pro, 0.7.1): is the server switched on, has the notice been accepted,
// and the one call that asks for a plan. The rules and the moves are in tidyPlan.ts.
// Only a Pro key can call the server (site/api/_lib/license.js), so nothing here runs for a free
// board: the readiness check happens only for an active key, only when Settings or a space menu
// opens (never on a plain new tab), and its answer is kept for a day.

const READY = 'tidyReady' // local: { ready, at }
// local: true once the notice was accepted on this computer. "2" since 0.8.0, when the notice began
// saying links in folders go too, so everyone sees it once more.
const NOTICE = 'tidyNotice2'
const TIMEOUT_MS = 90_000

interface TidyStore {
  /** null until known on this computer */
  ready: boolean | null
}

export const useTidy = create<TidyStore>(() => ({ ready: null }))

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
  if (ready !== null) useTidy.setState({ ready })
  return ready
}

/** Is the server switched on? Asked at most once a day (a GET with nothing about the person in it). */
export async function checkReady(): Promise<boolean> {
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

/** For Settings and the space menus: asks whether Tidy is on, for an active Pro key only (the trial can't use it). */
export function refreshTidyReady(hasKey: boolean): void {
  if (hasKey && IS_EXTENSION) void checkReady()
}

export async function noticeAccepted(): Promise<boolean> {
  if (!IS_EXTENSION) return true
  return !!(await chrome.storage.local.get(NOTICE).catch(() => ({}) as Record<string, unknown>))[NOTICE]
}

export async function acceptNotice(): Promise<void> {
  if (IS_EXTENSION) await chrome.storage.local.set({ [NOTICE]: true })
}

/** Asks the server for a plan. A "switched off" answer also hides the button until the next check. */
export async function requestTidy(body: { links: unknown[] }): Promise<{ plan: PlannedStack[] } | { error: TidyError }> {
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
  const out = readAnswer(status, data, body.links.length)
  if ('error' in out && out.error === 'not-ready') await saveReady(false)
  return out
}
