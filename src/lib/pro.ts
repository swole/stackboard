import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { installedAt, visit } from './onboarding'
import {
  LICENSE_API,
  PRO_ORG_ID,
  cleanKey,
  decideEarlyTodo,
  isEarlyUser,
  needsCheck,
  proState,
  readActivation,
  readEarlyTodo,
  readValidation,
  type License,
  type ProState,
  type ProSub,
} from './proPlan'

// Stackboard Pro on this computer (0.7.0); the rules are in proPlan.ts.
// The key syncs through Chrome (storage.sync), so every computer signed in to the same Chrome
// profile picks it up and activates itself once (Polar allows five). Each computer keeps its own
// activation and Polar's last answer in storage.local. The trial start and the early-user mark
// sync too, so a second computer neither restarts the trial nor loses the mark.
// Polar is the only server involved, and its license API answers any origin: no host permission.

const KEY = 'proKey' // sync: { key }
const LICENSE = 'proLicense' // local: License
const TRIAL = 'proTrial' // sync: { startedAt }
/** sync: ProSub. The plan behind the key, when Polar described it at purchase (0.8.0). */
export const SUB_KEY = 'proSub'
/** local: { at }. This computer opened the checkout; Settings shows the finishing steps for a day. */
const CHECKOUT_KEY = 'proCheckout'
/** sync: { from, at }. background.ts sets it when an update arrives from a version before Pro. */
export const EARLY_KEY = 'proEarly'
/** sync: { keep, at }. 0.8.0: whether an early user keeps making to-do lists free (they already had one). */
export const EARLY_TODO_KEY = 'proEarlyTodo'
/** localStorage, outside the extension only (vite preview): 'free' | 'trial' | 'pro' | 'pro-early' | 'early' | 'early-todo' | 'checkout'. */
const PREVIEW = 'stackable:proPreview'

const TIMEOUT_MS = 10_000

interface ProStore {
  ready: boolean
  /** Installed before Pro: the early price applies. */
  early: boolean
  /** 0.8.0: an early user who already had a to-do list keeps making them free; null until decided. */
  earlyTodo: boolean | null
  license: License | null
  trialStartedAt: number | null
  state: ProState
  busy: boolean
  /** The last problem with a key, in words for Settings. */
  note: string | null
  /** When this computer last opened the checkout (cleared once Pro is on). */
  checkoutAt: number | null
  /** The plan behind the key, when Polar described it. */
  sub: ProSub | null
  /** Opening the checkout: remembered so Settings can show what to do next. */
  markCheckout: () => void
  activate: (raw: string) => Promise<boolean>
  /** Asks Polar about the key; `force` asks even when the last answer is recent. */
  check: (force?: boolean) => Promise<void>
  remove: () => Promise<void>
  startTrial: () => Promise<void>
  /** The board loaded: a board made before Pro marks an early user. */
  seeBoard: (rootDateAdded?: number) => void
  /** 0.8.0: an early user's board loaded; decides once whether their to-do lists stay free. */
  decideTodo: (hasLists: boolean) => Promise<void>
}

function derive(license: License | null, trialStartedAt: number | null): ProState {
  return proState({ license, trialStartedAt, now: Date.now() })
}

/** "Chrome on Windows": shown next to each computer in Polar's customer portal. */
function deviceLabel(): string {
  const ua = (navigator as Navigator & { userAgentData?: { platform?: string; brands?: { brand: string }[] } }).userAgentData
  const brand = ua?.brands?.map((b) => b.brand).find((b) => /Edge|Brave|Opera|Vivaldi/.test(b))
  return `${brand ?? 'Chrome'} on ${ua?.platform || 'a computer'}`
}

async function post(path: 'activate' | 'validate' | 'deactivate', body: object): Promise<{ status: number; body: unknown }> {
  try {
    const r = await fetch(`${LICENSE_API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: PRO_ORG_ID, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    let data: unknown = null
    try {
      data = await r.json()
    } catch {
      // 204, or not JSON
    }
    return { status: r.status, body: data }
  } catch {
    return { status: 0, body: null } // offline or timed out
  }
}

/**
 * One key operation at a time across this computer's tabs, so five new tabs opening together
 * don't take five activations. A tab frozen in the background can hold a lock for good (the
 * 0.5.2 root-folder bug), so waiting stops after 5 s and the work is skipped.
 */
async function exclusive<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (!navigator.locks?.request) return fn()
  try {
    return await navigator.locks.request('stackboard-pro', { signal: AbortSignal.timeout(5000) }, fn)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError') return undefined
    throw err
  }
}

/**
 * Activates this computer, then asks Polar about the key. A place this computer already holds for
 * the key is checked again first, so a retry (a new tab closed mid-way, a timeout, the key pasted
 * again) never takes a second of the key's five places.
 */
async function activateHere(key: string): Promise<License | { problem: 'unknown-key' | 'device-limit' | 'ended' | 'network' }> {
  const held = await storedLicense()
  if (held?.key === key && held.activationId) {
    const v = await post('validate', { key, activation_id: held.activationId })
    if (v.status === 0) return { problem: 'network' }
    const r = readValidation(v.status, v.body, held, Date.now())
    if (v.status === 200 || r.status === 'revoked') return r
    // Anything else: that place is gone (removed in the portal), so take a new one below.
  }
  const act = await post('activate', { key, label: deviceLabel() })
  const got = readActivation(act.status, act.body)
  if ('error' in got) return { problem: got.error }
  // Keep the place at once: if this tab closes or Polar goes quiet before the check below, the
  // next try checks this place instead of taking another.
  await saveLicense({ key, activationId: got.activationId }).catch(() => {})
  const v = await post('validate', { key, activation_id: got.activationId })
  return readValidation(v.status, v.body, { key, activationId: got.activationId }, Date.now())
}

async function storedLicense(): Promise<License | undefined> {
  return (await chrome.storage.local.get(LICENSE))[LICENSE] as License | undefined
}

async function saveLicense(license: License | null): Promise<void> {
  if (license) await chrome.storage.local.set({ [LICENSE]: license })
  else await chrome.storage.local.remove(LICENSE)
}

const NOTES = {
  badKey: "That doesn't look like a license key. Keys start with SB- and are listed at polar.sh/stackboard/portal.",
  'unknown-key': "Polar doesn't know that key. Copy it again from polar.sh/stackboard/portal.",
  'device-limit': 'That key is already on five computers. Remove one under Manage subscription, then try again.',
  network: "Couldn't reach Polar to check the key. Check your connection and try again.",
  ended: 'That key belongs to a subscription that has ended.',
  disabled: 'That key has been turned off.',
  busy: 'Another Stackboard tab is checking your key. Try again in a moment.',
  syncFull: "Pro is on for this computer. Chrome's sync storage is full, so paste the key on your other computers too.",
} as const

export const usePro = create<ProStore>((set, get) => ({
  ready: !IS_EXTENSION,
  early: false,
  earlyTodo: null,
  license: null,
  trialStartedAt: null,
  state: { kind: 'free', trialUsed: false },
  busy: false,
  note: null,
  checkoutAt: null,
  sub: null,

  markCheckout: () => {
    const at = Date.now()
    set({ checkoutAt: at })
    if (IS_EXTENSION) void chrome.storage.local.set({ [CHECKOUT_KEY]: { at } }).catch(() => {})
  },

  activate: async (raw) => {
    if (!IS_EXTENSION) return false
    const key = cleanKey(raw)
    if (!key) {
      set({ note: NOTES.badKey })
      return false
    }
    set({ busy: true, note: null })
    try {
      const done = await exclusive(async () => {
        const got = await activateHere(key)
        if ('problem' in got) {
          set({ note: NOTES[got.problem] })
          return false
        }
        if (got.status === 'unknown-key' || got.status === 'revoked' || got.status === 'disabled') {
          // Not usable: give the place back to the key and keep nothing.
          if (got.activationId) void post('deactivate', { key, activation_id: got.activationId })
          await saveLicense(null).catch(() => {})
          set({ note: got.status === 'revoked' ? NOTES.ended : got.status === 'disabled' ? NOTES.disabled : NOTES['unknown-key'] })
          return false
        }
        // Granted, or Polar went quiet after activating (the next check settles it). The state
        // changes before the synced key does, so this tab's own storage event finds it in place.
        set({ license: got, state: derive(got, get().trialStartedAt), checkoutAt: null })
        await saveLicense(got)
        void chrome.storage.local.remove(CHECKOUT_KEY).catch(() => {})
        try {
          await chrome.storage.sync.set({ [KEY]: { key } })
        } catch {
          // Sync storage full (big to-do lists): Pro stays on here, and says so.
          const local: License = { ...got, localOnly: true }
          await saveLicense(local)
          set({ license: local, note: NOTES.syncFull })
        }
        return true
      })
      if (done === undefined) set({ note: NOTES.busy })
      return !!done
    } finally {
      set({ busy: false })
    }
  },

  check: async (force = false) => {
    if (!IS_EXTENSION || !get().license) return
    set({ busy: true })
    try {
      await exclusive(async () => {
        // Another tab may have just checked or activated: start from what's stored.
        let prev = get().license
        if (!prev) return
        const stored = await storedLicense()
        if (stored?.key === prev.key) prev = stored
        if (!force && !needsCheck(prev, Date.now())) {
          set({ license: prev, state: derive(prev, get().trialStartedAt) })
          return
        }
        let next: License
        if (!prev.activationId) {
          // A key that arrived through sync, or one this computer was removed from: take a place.
          if (prev.status === 'removed' && !force) return
          const got = await activateHere(prev.key)
          if ('problem' in got) {
            if (got.problem === 'network') return
            next = { key: prev.key, status: got.problem === 'ended' ? 'revoked' : got.problem, checkedAt: Date.now() }
          } else next = got
        } else {
          const v = await post('validate', { key: prev.key, activation_id: prev.activationId })
          next = readValidation(v.status, v.body, prev, Date.now())
          if (v.status === 404) {
            // Maybe only this computer was removed in the portal. It then waits for the person to
            // activate it again, so it never takes back a place they just freed.
            const k = await post('validate', { key: prev.key })
            if (readValidation(k.status, k.body, prev, Date.now()).status === 'granted') {
              next = { key: prev.key, status: 'removed', checkedAt: Date.now() }
            }
          }
        }
        set({ license: next, state: derive(next, get().trialStartedAt) })
        await saveLicense(next)
        // A key that arrived from the thanks page or another computer finishes the purchase too.
        if (next.status === 'granted' && get().checkoutAt) {
          set({ checkoutAt: null })
          void chrome.storage.local.remove(CHECKOUT_KEY).catch(() => {})
        }
      })
    } finally {
      set({ busy: false })
    }
  },

  remove: async () => {
    const prev = get().license
    if (!IS_EXTENSION) return
    set({ busy: true, note: null })
    try {
      if (prev?.activationId) await post('deactivate', { key: prev.key, activation_id: prev.activationId })
      set({ license: null, state: derive(null, get().trialStartedAt) })
      await saveLicense(null)
      set({ sub: null })
      await chrome.storage.sync.remove([KEY, SUB_KEY])
    } finally {
      set({ busy: false })
    }
  },

  startTrial: async () => {
    if (!IS_EXTENSION || get().trialStartedAt) return
    const startedAt = Date.now()
    set({ trialStartedAt: startedAt, state: derive(get().license, startedAt) })
    await chrome.storage.sync.set({ [TRIAL]: { startedAt } })
  },

  seeBoard: (rootDateAdded) => {
    if (!IS_EXTENSION || get().early) return
    if (!isEarlyUser({ installedAt: installedAt(visit.firstSeen, rootDateAdded) })) return
    set({ early: true })
    void chrome.storage.sync.set({ [EARLY_KEY]: { from: 'board', at: Date.now() } }).catch(() => {})
  },

  decideTodo: async (hasLists) => {
    if (!IS_EXTENSION || !get().ready || !get().early || get().earlyTodo !== null) return
    try {
      // Read everything: another computer may have decided already, and a list's items may sit in
      // sync storage while its marker bookmark hasn't arrived on this computer yet.
      const all = await chrome.storage.sync.get(null)
      const d = decideEarlyTodo({ stored: all[EARLY_TODO_KEY], hasLists, syncKeys: Object.keys(all) })
      set({ earlyTodo: d.keep })
      if (d.write) await chrome.storage.sync.set({ [EARLY_TODO_KEY]: { keep: d.keep, at: Date.now() } })
    } catch {
      // Storage unreadable: stay undecided and try again on the next new tab.
    }
  },
}))

function readTrial(v: unknown): number | null {
  const at = (v as { startedAt?: unknown } | undefined)?.startedAt
  return typeof at === 'number' && at > 0 ? at : null
}

function readAt(v: unknown): number | null {
  const at = (v as { at?: unknown } | undefined)?.at
  return typeof at === 'number' && at > 0 ? at : null
}

/** A plan saved by this or another computer; anything malformed counts as none. */
function readStoredSub(v: unknown): ProSub | null {
  if (!v || typeof v !== 'object') return null
  const s = v as ProSub
  return typeof s.at === 'number' ? s : null
}

function readKey(v: unknown): string | null {
  const key = (v as { key?: unknown } | undefined)?.key
  return typeof key === 'string' ? cleanKey(key) : null
}

/** The license this computer holds for the synced key: its own record when it matches. */
function forKey(key: string | null, local: License | undefined): License | null {
  if (!key) return null
  return local && local.key === key ? local : { key }
}

/** Outside the extension (vite preview), localStorage picks the state to look at. */
function preview(): void {
  let p: string | null = null
  try {
    p = localStorage.getItem(PREVIEW)
  } catch {
    // blocked storage: plain free
  }
  const now = Date.now()
  const pro = p === 'pro' || p === 'pro-early'
  const license: License | null = pro
    ? { key: 'SB-PREVIEW-0000', status: 'granted', checkedAt: now, okAt: now, email: 'you@example.com', since: now - 3 * 86_400_000 }
    : null
  const sub: ProSub | null = pro ? { amount: 299, currency: 'usd', interval: 'year', periodEnd: now + 362 * 86_400_000, at: now } : null
  const trialStartedAt = p === 'trial' ? now - 5 * 86_400_000 : null
  const checkoutAt = p === 'checkout' ? now - 60_000 : null
  const early = p === 'early' || p === 'early-todo' || p === 'pro-early'
  usePro.setState({ ready: true, early, earlyTodo: early ? p === 'early-todo' : null, license, sub, checkoutAt, trialStartedAt, state: derive(license, trialStartedAt) })
}

let started = false

/** Call once per new tab: reads the stored state, follows other tabs and computers, checks the key when due. */
export function initPro(): void {
  if (started) return
  started = true
  if (!IS_EXTENSION) return preview()
  void (async () => {
    try {
      const [sync, local] = await Promise.all([
        chrome.storage.sync.get([KEY, TRIAL, EARLY_KEY, EARLY_TODO_KEY, SUB_KEY]),
        chrome.storage.local.get([LICENSE, CHECKOUT_KEY]),
      ])
      const held = local[LICENSE] as License | undefined
      // A key kept on this computer only (sync storage was full when it was added) still counts.
      const license = forKey(readKey(sync[KEY]) ?? (held?.localOnly ? held.key : null), held)
      const trialStartedAt = readTrial(sync[TRIAL])
      usePro.setState({
        ready: true,
        early: usePro.getState().early || !!sync[EARLY_KEY],
        earlyTodo: readEarlyTodo(sync[EARLY_TODO_KEY]),
        license,
        trialStartedAt,
        state: derive(license, trialStartedAt),
        sub: readStoredSub(sync[SUB_KEY]),
        checkoutAt: readAt(local[CHECKOUT_KEY]),
      })
      if (needsCheck(license, Date.now())) setTimeout(() => void usePro.getState().check(), 3000)
    } catch {
      usePro.setState({ ready: true })
    }
  })()

  chrome.storage.onChanged.addListener((changes, area) => {
    const s = usePro.getState()
    if (area === 'local' && CHECKOUT_KEY in changes) usePro.setState({ checkoutAt: readAt(changes[CHECKOUT_KEY].newValue) })
    if (area === 'local' && LICENSE in changes) {
      // Another tab on this computer checked the key.
      const l = changes[LICENSE].newValue as License | undefined
      if (l && s.license && l.key === s.license.key) usePro.setState({ license: l, state: derive(l, s.trialStartedAt) })
      return
    }
    if (area !== 'sync') return
    if (EARLY_KEY in changes && changes[EARLY_KEY].newValue) usePro.setState({ early: true })
    if (EARLY_TODO_KEY in changes) usePro.setState({ earlyTodo: readEarlyTodo(changes[EARLY_TODO_KEY].newValue) })
    if (SUB_KEY in changes) usePro.setState({ sub: readStoredSub(changes[SUB_KEY].newValue) })
    if (TRIAL in changes) {
      const trialStartedAt = readTrial(changes[TRIAL].newValue)
      usePro.setState({ trialStartedAt, state: derive(usePro.getState().license, trialStartedAt) })
    }
    if (KEY in changes) {
      const key = readKey(changes[KEY].newValue)
      if (key === (s.license?.key ?? null)) return
      void (async () => {
        // Another computer (or tab) added or removed the key. A removed key also frees this computer's place.
        const local = await storedLicense()
        if (!key && local?.activationId) {
          void post('deactivate', { key: local.key, activation_id: local.activationId })
          await saveLicense(null)
        }
        const license = forKey(key, local)
        usePro.setState({ license, state: derive(license, usePro.getState().trialStartedAt) })
        if (license && !license.activationId) void usePro.getState().check()
      })()
    }
  })
}
