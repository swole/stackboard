// Stackboard Pro (0.7.0): who gets what. Pure: no chrome.*, no DOM, so tests/unit.test.ts covers
// every rule. Storage and the calls to Polar live in lib/pro.ts.
//
// The rules (the Pro launch rules, 31 Oct and 1 Nov 2026):
// - Nothing free moves behind Pro for anyone who already uses it. To-do lists are Pro for installs
//   from 0.7.0 on, and since 0.8.0 (3 Nov) for earlier installs ("early users") too, except
//   an early user who already had a list when 0.8.0 first ran: the 0.7.0 note told early users
//   "everything you use today stays free". Lists that exist keep working for everyone.
// - Lists that already exist keep working for everyone; Pro only gates making a new one.
// - Early users get $2.99 a year whenever they buy; new buyers get it until 31 Dec 2026.
// - The trial is 14 days, opt-in, no card, and never starts by itself.
// - A failed license check pauses Pro and never touches free features. When Polar can't be
//   reached, Pro carries on for two weeks after the last good check.

export const PRO_ORG_ID = '9ce1895f-83e5-4974-bcc5-9473d36e4cd8'
export const PRO_BENEFIT_ID = 'f204b661-dc9b-4ce5-91f5-7cc6559d1617'
export const LICENSE_API = 'https://api.polar.sh/v1/customer-portal/license-keys'
export const PORTAL_URL = 'https://polar.sh/stackboard/portal'

/** The first version with Pro. Updating from anything older marks an early user. */
export const PRO_VERSION = '0.7.0'
/** Boards made before this moment count as early even without the update marker (0.7.0 submission, 3 Nov 2026 00:00 SGT). */
export const PRO_CUTOFF = Date.UTC(2026, 10, 2, 16)
/** The founding price is open to new buyers until 31 Dec 2026, 23:59 Singapore time. */
export const FOUNDING_ENDS = Date.parse('2026-12-31T15:59:59Z')

export const TRIAL_DAYS = 14
const DAY = 24 * 60 * 60 * 1000
/** How often a key is checked again. */
export const RECHECK_MS = 3 * DAY
/** How long Pro keeps working when Polar can't be reached. */
export const OFFLINE_GRACE_MS = 14 * DAY

export const CHECKOUT = {
  /** EARLYSB7K2 applied: $2.99 a year for as long as they keep it. */
  early: 'https://buy.polar.sh/polar_cl_NX5SjiL0XB6AEG3vraI1lde39D7ATiG6Pxe8w3co9QD',
  /** FOUNDING applied: the same price, for anyone who buys by 31 Dec 2026. */
  founding: 'https://buy.polar.sh/polar_cl_KKWvL022nIO1YdYyJeqsjC6l6TsLOqrmMcSSf14U77l',
  regular: 'https://buy.polar.sh/polar_cl_8DtGJumyRoQioLiBclasbnNcpj5n1vIdpiBHu2KkNoF',
} as const

export type LicenseStatus = 'granted' | 'revoked' | 'disabled'
/** Problems found on our side of the check: no such key, five computers already, or this one removed in the portal. */
export type KeyProblem = 'unknown-key' | 'device-limit' | 'removed'
/** Why Pro is paused. */
export type PauseReason = 'ended' | 'disabled' | KeyProblem | 'offline' | 'checking'

export interface License {
  key: string
  /** This device's activation; Polar allows five per key. */
  activationId?: string
  /** Polar's last answer, or what went wrong getting one. */
  status?: LicenseStatus | KeyProblem
  /** Last time Polar answered. */
  checkedAt?: number
  /** Last time Polar said the key is good. */
  okAt?: number
  expiresAt?: number | null
  /** Kept on this computer only: Chrome's sync storage was full when the key was added. */
  localOnly?: boolean
  /** The email the purchase was made with, from Polar's answer (shown on the Pro card). */
  email?: string
  /** When Polar made the key, which is the day of the purchase. */
  since?: number
}

export type ProState =
  | { kind: 'pro' }
  | { kind: 'trial'; daysLeft: number }
  | { kind: 'paused'; reason: PauseReason }
  | { kind: 'free'; trialUsed: boolean }

export function trialDaysLeft(startedAt: number | null, now: number): number {
  if (!startedAt) return 0
  const left = startedAt + TRIAL_DAYS * DAY - now
  return left > 0 ? Math.ceil(left / DAY) : 0
}

/**
 * A good key wins, then a running trial, then a key that needs attention, then free. School mode
 * (`lockPro`, the company's pro lock): a trial doesn't count on this computer, so only a paid key
 * turns Pro on.
 */
export function proState(p: { license: License | null; trialStartedAt: number | null; now: number; lockPro?: boolean }): ProState {
  const { license, now } = p
  let paused: PauseReason | null = null
  if (license) {
    const s = license.status
    if (s === 'granted') {
      if (license.expiresAt && license.expiresAt <= now) paused = 'ended'
      else if (!license.okAt || now - license.okAt > OFFLINE_GRACE_MS) paused = 'offline'
      else return { kind: 'pro' }
    } else if (s === 'revoked') paused = 'ended'
    else if (s === 'disabled' || s === 'unknown-key' || s === 'device-limit' || s === 'removed') paused = s
    else paused = 'checking'
  }
  const daysLeft = p.lockPro ? 0 : trialDaysLeft(p.trialStartedAt, now)
  if (daysLeft > 0) return { kind: 'trial', daysLeft }
  if (paused) return { kind: 'paused', reason: paused }
  return { kind: 'free', trialUsed: !!p.trialStartedAt }
}

export function hasPro(s: ProState): boolean {
  return s.kind === 'pro' || s.kind === 'trial'
}

/** New to-do lists: Pro or the trial, or an early user who kept them free (`keepsTodo`, 0.8.0). */
export function canMakeTodo(s: ProState, keepsTodo: boolean): boolean {
  return keepsTodo || hasPro(s)
}

/**
 * Whether the New stack dialog offers To-do list. School mode (`lockPro`): only to someone who can
 * make one, so there is never a Pro note to show. Otherwise always, with the note when it needs Pro.
 */
export function offersTodo(p: { lockPro: boolean; canMake: boolean }): boolean {
  return !p.lockPro || p.canMake
}

/** sync `proEarlyTodo` = { keep, at }: whether an early user keeps making to-do lists free (0.8.0); null until decided. */
export function readEarlyTodo(v: unknown): boolean | null {
  const keep = (v as { keep?: unknown } | null | undefined)?.keep
  return typeof keep === 'boolean' ? keep : null
}

/**
 * 0.8.0: decided once per Chrome profile, the first time 0.8.0 sees an early user's board. A list on
 * the board (`hasLists`) or a list's items in sync storage (`todo:<id>`) keeps them free; a decision
 * another computer already stored stands.
 */
export function decideEarlyTodo(p: { stored: unknown; hasLists: boolean; syncKeys: string[] }): { keep: boolean; write: boolean } {
  const stored = readEarlyTodo(p.stored)
  if (stored !== null) return { keep: stored, write: false }
  return { keep: p.hasLists || p.syncKeys.some((k) => k.startsWith('todo:')), write: true }
}

/** An early user whose 0.8.0 decision kept to-do lists free. */
export function keepsTodoFree(p: { early: boolean; earlyTodo: boolean | null }): boolean {
  return p.early && p.earlyTodo === true
}

/** True when the key is due another check (never checked, or the last answer is three days old). */
export function needsCheck(license: License | null, now: number): boolean {
  if (!license) return false
  return !license.checkedAt || now - license.checkedAt >= RECHECK_MS
}

/** -1, 0 or 1, comparing dotted versions numerically ("0.10.0" is newer than "0.9.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

/** Installed before Pro: the service worker saw an update from an older version, or the board is older than Pro. */
export function isEarlyUser(p: { updatedFrom?: string | null; installedAt?: number | null }): boolean {
  if (p.updatedFrom && compareVersions(p.updatedFrom, PRO_VERSION) < 0) return true
  return !!p.installedAt && p.installedAt < PRO_CUTOFF
}

export function checkoutUrl(early: boolean, now: number): string {
  if (early) return CHECKOUT.early
  return now <= FOUNDING_ENDS ? CHECKOUT.founding : CHECKOUT.regular
}

/** "$2.99 a year" for early users and founding buyers, "$4.99 a year" after. */
export function priceLabel(early: boolean, now: number): string {
  return early || now <= FOUNDING_ENDS ? '$2.99 a year' : '$4.99 a year'
}

/** What someone pasted, minus spaces, line breaks and quotes; null when it can't be a key. */
export function cleanKey(raw: string): string | null {
  const key = raw.replace(/[\s"'`]/g, '')
  return /^[A-Za-z0-9-]{8,100}$/.test(key) ? key : null
}

/** "SB-...-9F2C": enough to recognise the key without showing it. */
export function maskKey(key: string): string {
  const dash = key.indexOf('-')
  const head = dash > 0 && dash <= 6 ? key.slice(0, dash) : key.slice(0, 2)
  return `${head}-...-${key.slice(-4)}`
}

// ---------- Reading Polar's answers ----------

/**
 * Polar's words for a key that exists but no longer counts (refunded, cancelled and run out, or
 * turned off): validate answers 404 and activate 403 with these details (polar license_key
 * service.py, checked 3 Nov 2026). A key Polar has never seen answers 404 "Not found".
 */
const ENDED_DETAIL = /no longer active|has expired/i
const LIMIT_DETAIL = /activation limit/i

function detailOf(body: unknown): string {
  const d = (body && typeof body === 'object' ? (body as Record<string, unknown>).detail : undefined)
  return typeof d === 'string' ? d : ''
}

/** The activation call: an id, or why there isn't one ('network' when Polar didn't answer). */
export function readActivation(status: number, body: unknown): { activationId: string } | { error: 'unknown-key' | 'device-limit' | 'ended' | 'network' } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (status === 200 && typeof b.id === 'string') return { activationId: b.id }
  const detail = detailOf(body)
  if (ENDED_DETAIL.test(detail) && (status === 403 || status === 404)) return { error: 'ended' }
  if (status === 403) return { error: LIMIT_DETAIL.test(detail) || !detail ? 'device-limit' : 'unknown-key' }
  if (status === 404 || status === 422) return { error: 'unknown-key' }
  return { error: 'network' }
}

/**
 * The validate call, folded into the stored license. A key for some other product counts as
 * unknown. Anything that isn't an answer (offline, 5xx) only leaves the old state in place.
 */
export function readValidation(status: number, body: unknown, prev: License, now: number): License {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (status === 200) {
    const known = b.benefit_id === PRO_BENEFIT_ID && typeof b.status === 'string'
    const s = known ? (b.status as LicenseStatus) : 'unknown-key'
    const expires = typeof b.expires_at === 'string' ? Date.parse(b.expires_at) : null
    const customer = (b.customer && typeof b.customer === 'object' ? b.customer : {}) as Record<string, unknown>
    const made = typeof b.created_at === 'string' ? Date.parse(b.created_at) : NaN
    return {
      ...prev,
      status: s,
      checkedAt: now,
      okAt: s === 'granted' ? now : prev.okAt,
      expiresAt: Number.isFinite(expires) ? expires : null,
      ...(known && typeof customer.email === 'string' && customer.email ? { email: customer.email } : {}),
      ...(known && Number.isFinite(made) ? { since: made } : {}),
    }
  }
  if (status === 404 || status === 422) {
    // A refunded or lapsed key: Pro pauses with "has ended" and a Renew button.
    if (ENDED_DETAIL.test(detailOf(body))) return { ...prev, status: 'revoked', checkedAt: now }
    return { ...prev, status: 'unknown-key', checkedAt: now }
  }
  return prev
}

// ---------- After the purchase, and the Pro card (0.8.0) ----------

/** After "Get Pro", Settings keeps the finish-setting-up steps first for a day. */
export const CHECKOUT_PENDING_MS = DAY

/** True for a day after this computer opened the checkout. */
export function checkoutPending(at: number | null | undefined, now: number): boolean {
  return typeof at === 'number' && now >= at && now - at < CHECKOUT_PENDING_MS
}

/** The subscription behind a key, as Polar's customer portal described it (sync `proSub`). */
export interface ProSub {
  /** The price of one period in the currency's smallest unit (299 = $2.99). */
  amount?: number
  currency?: string
  interval?: string
  /** The end of the period paid for. */
  periodEnd?: number
  cancelAtPeriodEnd?: boolean
  startedAt?: number
  /** When Polar said this. */
  at: number
}

/** Every Pro plan so far is yearly; Polar's own word wins when it gave one. */
const PLAN_NAME: Record<string, string> = { year: 'Yearly plan', month: 'Monthly plan' }
const PER: Record<string, string> = { year: 'a year', month: 'a month' }

/** "$2.99"; a currency Intl doesn't know reads "2.99 XYZ". */
export function money(amount: number, currency = 'usd'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** "3 Nov 2027" */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The end of the current period: Polar's date, moved on a period at a time when it has passed
 * and the key still works (the plan renewed after Polar told us).
 */
export function currentPeriodEnd(end: number, interval: string | undefined, now: number): number {
  const d = new Date(end)
  for (let i = 0; i < 100 && d.getTime() <= now; i++) {
    if (interval === 'month') d.setUTCMonth(d.getUTCMonth() + 1)
    else d.setUTCFullYear(d.getUTCFullYear() + 1)
  }
  return d.getTime()
}

/** "today", "yesterday", "3 days ago" */
export function daysAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / DAY)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

export interface ProCard {
  /** "Yearly plan, $2.99 a year" */
  plan: string
  rows: { label: string; value: string }[]
}

/** What the Pro card says: only what Polar told us, nothing guessed. */
export function proCard(p: { license: License; sub: ProSub | null; now: number }): ProCard {
  const { license, sub, now } = p
  const interval = sub?.interval ?? 'year'
  const price = sub?.amount != null && sub.amount > 0 ? `, ${money(sub.amount, sub.currency)} ${PER[interval] ?? `a ${interval}`}` : ''
  const rows: ProCard['rows'] = []
  if (sub?.periodEnd) {
    const end = sub.cancelAtPeriodEnd ? sub.periodEnd : currentPeriodEnd(sub.periodEnd, interval, now)
    rows.push(sub.cancelAtPeriodEnd ? { label: 'Ends', value: `${shortDate(end)} (cancelled)` } : { label: 'Renews', value: shortDate(end) })
  }
  const since = sub?.startedAt ?? license.since
  if (since) rows.push({ label: 'Pro since', value: shortDate(since) })
  if (license.email) rows.push({ label: 'Email', value: license.email })
  rows.push({ label: 'Key', value: maskKey(license.key) })
  if (license.okAt) rows.push({ label: 'Checked', value: `${daysAgo(license.okAt, now)}, with Polar` })
  return { plan: `${PLAN_NAME[interval] ?? 'Plan'}${price}`, rows }
}

/** A subscription from Polar's customer portal, in our words; null when it isn't one. */
export function readSub(body: unknown, now: number): ProSub | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const date = (v: unknown) => {
    const t = typeof v === 'string' ? Date.parse(v) : NaN
    return Number.isFinite(t) ? t : undefined
  }
  const sub: ProSub = { at: now }
  if (typeof b.amount === 'number' && b.amount >= 0) sub.amount = b.amount
  if (typeof b.currency === 'string' && b.currency) sub.currency = b.currency
  if (typeof b.recurring_interval === 'string' && b.recurring_interval) sub.interval = b.recurring_interval
  const end = date(b.current_period_end)
  if (end) sub.periodEnd = end
  if (typeof b.cancel_at_period_end === 'boolean') sub.cancelAtPeriodEnd = b.cancel_at_period_end
  const start = date(b.started_at) ?? date(b.created_at)
  if (start) sub.startedAt = start
  return sub.periodEnd || sub.amount != null ? sub : null
}
