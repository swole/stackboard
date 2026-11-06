import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { readLocks } from './company'
import { installedAt, visit } from './onboarding'
import { openInNewTab } from './tabs'
import {
  LICENSE_API,
  PRO_ORG_ID,
  checkoutPlan,
  checkoutUrl,
  cleanKey,
  decideEarlyTodo,
  isEarlyUser,
  lifetimeCheckoutUrl,
  needsCheck,
  olderTrialWins,
  proState,
  readActivation,
  readEarlyTodo,
  readTrial,
  readValidation,
  type CheckoutSurface,
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
/** sync: { startedAt, auto? }. `auto` (0.9.2): the trial started by itself on install (background.ts). */
const TRIAL = 'proTrial'
/** sync: ProSub. The plan behind the key, when Polar described it at purchase (0.8.0). */
export const SUB_KEY = 'proSub'
/**
 * local: { at, lifetime? }. This computer opened the checkout; Settings shows the finishing steps for
 * a day. `lifetime` (0.9.2): it was the Pro for life checkout, so Back to checkout opens that one again.
 */
const CHECKOUT_KEY = 'proCheckout'
/** sync: { from, at }. background.ts sets it when an update arrives from a version before Pro. */
export const EARLY_KEY = 'proEarly'
/** sync: { keep, at }. 0.8.0: whether an early user keeps making to-do lists free (they already had one). */
export const EARLY_TODO_KEY = 'proEarlyTodo'
/**
 * localStorage, outside the extension only (vite preview): 'free' | 'trial' | 'auto-trial' | 'pro' |
 * 'pro-early' | 'pro-lifetime' | 'early' | 'early-todo' | 'checkout'.
 */
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
  /** 0.9.2: the trial (running or over) started by itself on install: the reverse trial. */
  trialAuto: boolean
  state: ProState
  busy: boolean
  /** The last problem with a key, in words for Settings. */
  note: string | null
  /** When this computer last opened the checkout (cleared once Pro is on). */
  checkoutAt: number | null
  /** 0.9.2: that checkout was Pro for life. */
  checkoutLifetime: boolean
  /** The plan behind the key, when Polar described it. */
  sub: ProSub | null
  /** Opening the checkout: remembered so Settings can show what to do next. */
  markCheckout: (lifetime?: boolean) => void
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

/**
 * School mode: the company's pro lock (Chrome policy). While it's on, a trial doesn't count here and
 * can't start; a paid key keeps working. Read before the store is ready, then kept in step by the
 * board (setProLock), which sees policy changes.
 */
let lockPro = false

function derive(license: License | null, trialStartedAt: number | null): ProState {
  return proState({ license, trialStartedAt, now: Date.now(), lockPro })
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
  trialAuto: false,
  state: { kind: 'free', trialUsed: false },
  busy: false,
  note: null,
  checkoutAt: null,
  checkoutLifetime: false,
  sub: null,

  markCheckout: (lifetime = false) => {
    const at = Date.now()
    set({ checkoutAt: at, checkoutLifetime: lifetime })
    if (IS_EXTENSION) void chrome.storage.local.set({ [CHECKOUT_KEY]: lifetime ? { at, lifetime } : { at } }).catch(() => {})
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
    // The trial syncs, so starting one under the pro lock would also use it up on every other computer.
    if (!IS_EXTENSION || get().trialStartedAt || lockPro) return
    const startedAt = Date.now()
    set({ trialStartedAt: startedAt, trialAuto: false, state: derive(get().license, startedAt) })
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

function readAt(v: unknown): number | null {
  const at = (v as { at?: unknown } | undefined)?.at
  return typeof at === 'number' && at > 0 ? at : null
}

/** The checkout marker says Pro for life (0.9.2). */
function readLifetime(v: unknown): boolean {
  return readAt(v) !== null && (v as { lifetime?: unknown }).lifetime === true
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
  const pro = p === 'pro' || p === 'pro-early' || p === 'pro-lifetime'
  const license: License | null = pro
    ? { key: 'SB-PREVIEW-0000', status: 'granted', checkedAt: now, okAt: now, email: 'you@example.com', since: now - 3 * 86_400_000 }
    : null
  const sub: ProSub | null = !pro
    ? null
    : p === 'pro-lifetime'
      ? { amount: 1900, currency: 'usd', lifetime: true, startedAt: now - 3 * 86_400_000, at: now }
      : { amount: 299, currency: 'usd', interval: 'year', periodEnd: now + 362 * 86_400_000, at: now }
  const trialAuto = p === 'auto-trial'
  const trialStartedAt = p === 'trial' || trialAuto ? now - 5 * 86_400_000 : null
  const checkoutAt = p === 'checkout' ? now - 60_000 : null
  const early = p === 'early' || p === 'early-todo' || p === 'pro-early'
  usePro.setState({ ready: true, early, earlyTodo: early ? p === 'early-todo' : null, license, sub, checkoutAt, trialStartedAt, trialAuto, state: derive(license, trialStartedAt) })
}

/** School mode: the board calls this with the pro lock each time it reads the policy. */
export function setProLock(on: boolean): void {
  if (on === lockPro) return
  lockPro = on
  const s = usePro.getState()
  usePro.setState({ state: derive(s.license, s.trialStartedAt) })
}

/**
 * Every buy button (0.9.1): remembers the checkout for Settings' finishing steps and opens it,
 * labelled with the button, the plan and the version (checkoutUrl). An unpacked build has no
 * update_url in its manifest, so test and development checkouts carry a dev label. `lifetime`
 * (0.9.2) opens the Pro for life checkout instead of the yearly one.
 */
export function openCheckout(surface: CheckoutSurface, opts: { lifetime?: boolean } = {}): void {
  const s = usePro.getState()
  const lifetime = !!opts.lifetime
  s.markCheckout(lifetime)
  const manifest = IS_EXTENSION ? chrome.runtime.getManifest() : null
  const from = { surface, plan: checkoutPlan(s.state, s.trialAuto), version: manifest?.version, dev: !manifest?.update_url }
  void openInNewTab(lifetime ? lifetimeCheckoutUrl(from) : checkoutUrl(s.early, Date.now(), from), true)
}

let started = false
/**
 * Trial changes this tab has seen (0.9.2). The service worker starts the reverse trial while the
 * first tab after install is loading; a change that lands while that tab's first read is out wins
 * over the read.
 */
let trialChanges = 0

/** Call once per new tab: reads the stored state, follows other tabs and computers, checks the key when due. */
export function initPro(): void {
  if (started) return
  started = true
  if (!IS_EXTENSION) return preview()
  void (async () => {
    try {
      const seen = trialChanges
      // The lock comes with the stored state, so a trial never shows as Pro under it, even for a moment.
      const [sync, local, locks] = await Promise.all([
        chrome.storage.sync.get([KEY, TRIAL, EARLY_KEY, EARLY_TODO_KEY, SUB_KEY]),
        chrome.storage.local.get([LICENSE, CHECKOUT_KEY]),
        readLocks(),
      ])
      lockPro = locks.pro
      const held = local[LICENSE] as License | undefined
      // A key kept on this computer only (sync storage was full when it was added) still counts.
      const license = forKey(readKey(sync[KEY]) ?? (held?.localOnly ? held.key : null), held)
      // A trial change that landed during the read is newer than what the read found.
      const current = usePro.getState()
      const fresh = trialChanges === seen
      const trial = readTrial(sync[TRIAL])
      const trialStartedAt = fresh ? trial?.startedAt ?? null : current.trialStartedAt
      usePro.setState({
        ready: true,
        early: current.early || !!sync[EARLY_KEY],
        earlyTodo: readEarlyTodo(sync[EARLY_TODO_KEY]),
        license,
        trialStartedAt,
        trialAuto: fresh ? !!trial?.auto : current.trialAuto,
        state: derive(license, trialStartedAt),
        sub: readStoredSub(sync[SUB_KEY]),
        checkoutAt: readAt(local[CHECKOUT_KEY]),
        checkoutLifetime: readLifetime(local[CHECKOUT_KEY]),
      })
      if (needsCheck(license, Date.now())) setTimeout(() => void usePro.getState().check(), 3000)
    } catch {
      usePro.setState({ ready: true })
    }
  })()

  chrome.storage.onChanged.addListener((changes, area) => {
    const s = usePro.getState()
    if (area === 'local' && CHECKOUT_KEY in changes) {
      const v = changes[CHECKOUT_KEY].newValue
      usePro.setState({ checkoutAt: readAt(v), checkoutLifetime: readLifetime(v) })
    }
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
      trialChanges++
      const { oldValue, newValue } = changes[TRIAL]
      // 0.9.2: a trial that started by itself on a computer sync hadn't reached yet gives way to the
      // older one it overwrote. This tab keeps the older one; writing it back tells the rest.
      const restore = olderTrialWins(oldValue, newValue)
      if (restore) void chrome.storage.sync.set({ [TRIAL]: oldValue }).catch(() => {})
      const trial = readTrial(restore ? oldValue : newValue)
      const trialStartedAt = trial?.startedAt ?? null
      usePro.setState({ trialStartedAt, trialAuto: !!trial?.auto, state: derive(usePro.getState().license, trialStartedAt) })
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
