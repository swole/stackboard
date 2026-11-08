// Stackboard Pro (0.7.0): who gets what. Pure: no chrome.*, no DOM, so tests/unit.test.ts covers
// every rule. Storage and the calls to Polar live in lib/pro.ts.
//
// The rules (Pro launch rules, 31 Oct and 1 Nov 2026):
// - Nothing free moves behind Pro for anyone who already uses it. To-do lists are Pro for installs
//   from 0.7.0 on, and since 0.8.0 for earlier installs ("early users") too, except
//   an early user who already had a list when 0.8.0 first ran: the 0.7.0 note told early users
//   "everything you use today stays free". Lists that exist keep working for everyone.
// - Lists that already exist keep working for everyone; Pro only gates making a new one.
// - Early users get $2.99 a year whenever they buy; new buyers get it until 31 Dec 2026. Pro for
//   life is $19 once, for anyone (0.9.2).
// - The trial is 14 days with no card. Since 0.9.2 a new install starts it by itself (the reverse
//   trial, REVERSE_TRIAL); everyone else starts it with a click, as before.
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
  /**
   * 0.9.2: Pro for life, $19 once ("Stackboard Pro Lifetime" in Polar). It grants the same license-key
   * benefit as the yearly plan, so its keys check exactly like yearly ones.
   */
  lifetime: 'https://buy.polar.sh/polar_cl_ypdUWh3QdU4DghsZoSm7xcIG6SoBFZaC8Bl9b1Ad37W',
} as const

/** What Pro for life costs, once (0.9.2). */
export const LIFETIME_PRICE = '$19'

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

// ---------- The reverse trial (0.9.2) ----------
// a new install starts with Pro for 14 days, and when the trial ends Pro
// features pause and everything they made stays (the usual trial end). Updates never start one,
// so everyone who had Stackboard before keeps the opt-in trial.

/** The kill switch: false makes the trial opt-in for new installs again. */
export const REVERSE_TRIAL = true

/** sync `proTrial` = { startedAt, auto? }; `auto` marks a trial that started by itself on install. Null when malformed. */
export function readTrial(v: unknown): { startedAt: number; auto: boolean } | null {
  const t = v as { startedAt?: unknown; auto?: unknown } | null | undefined
  return typeof t?.startedAt === 'number' && t.startedAt > 0 ? { startedAt: t.startedAt, auto: t.auto === true } : null
}

/**
 * Whether a fresh install starts the trial (the service worker asks on install only). Not under the
 * company's pro lock, which would use the trial up on every computer the Chrome profile syncs to,
 * and not when sync already holds a trial or a key: Stackboard was here before, or another computer
 * on the same Chrome profile has it.
 */
export function reverseTrialOnInstall(p: { lockPro: boolean; trial: unknown; key: unknown }): boolean {
  return !p.lockPro && p.trial == null && p.key == null
}

/**
 * True when a synced trial (`next`) should give way to the one it replaced (`prev`). A computer added
 * before Chrome's sync brought this profile's data over finds no trial and starts one by itself;
 * when sync catches up, that newer start would overwrite the real one. The earlier start wins, so a
 * Chrome profile never gets a second trial that way.
 */
export function olderTrialWins(prev: unknown, next: unknown): boolean {
  const a = readTrial(prev)
  const b = readTrial(next)
  return !!a && !!b && b.auto && a.startedAt < b.startedAt
}

/** Which buy button opened the checkout (0.9.1; the two lifetime links 0.9.2). */
export type CheckoutSurface =
  | 'settings'
  | 'settings-pending'
  | 'settings-lifetime'
  | 'trial-end'
  | 'trial-end-lifetime'
  | 'cleanup'
  | 'keep-look'
  | 'todo'
/**
 * The plan at the click: never tried, on the trial, trial over, or a paused key. 0.9.2: a trial that
 * started by itself on install reads auto-trial, and auto-trial-ended once it's over.
 */
export type CheckoutPlan = 'free' | 'trial' | 'trial-ended' | 'paused' | 'auto-trial' | 'auto-trial-ended'
export interface CheckoutFrom {
  surface: CheckoutSurface
  plan: CheckoutPlan
  version?: string
  /** An unpacked build (tests, development): its checkouts are labelled so they stay out of the numbers. */
  dev?: boolean
}

/**
 * The checkout link for this person. With `from`, the link also says which button and plan sent
 * them and the Stackboard version, nothing about the person or the board; Polar keeps that label
 * with the checkout, which is how we see which buttons lead to purchases.
 */
export function checkoutUrl(early: boolean, now: number, from?: CheckoutFrom): string {
  return labelled(early ? CHECKOUT.early : now <= FOUNDING_ENDS ? CHECKOUT.founding : CHECKOUT.regular, from)
}

/** 0.9.2: the Pro for life checkout, with the same labels. */
export function lifetimeCheckoutUrl(from?: CheckoutFrom): string {
  return labelled(CHECKOUT.lifetime, from)
}

function labelled(base: string, from?: CheckoutFrom): string {
  if (!from) return base
  const q = new URLSearchParams({ utm_source: from.dev ? 'extension-dev' : 'extension', utm_medium: from.surface, utm_content: from.plan })
  if (from.version && /^\d+(\.\d+){0,3}$/.test(from.version)) q.set('utm_campaign', `v${from.version}`)
  return `${base}?${q}`
}

/** `trialAuto`: the trial (running or over) started by itself on install (0.9.2). */
export function checkoutPlan(state: ProState, trialAuto = false): CheckoutPlan {
  if (state.kind === 'trial') return trialAuto ? 'auto-trial' : 'trial'
  if (state.kind === 'paused') return 'paused'
  if (state.kind === 'free' && state.trialUsed) return trialAuto ? 'auto-trial-ended' : 'trial-ended'
  return 'free'
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
  /** 0.9.2: Pro for life, paid once: no period and nothing to renew. `startedAt` is the day of the purchase. */
  lifetime?: boolean
  /** When Polar said this. */
  at: number
}

/** Every recurring Pro plan so far is yearly; Polar's own word wins when it gave one. */
const PLAN_NAME: Record<string, string> = { year: 'Yearly plan', month: 'Monthly plan' }
const PER: Record<string, string> = { year: 'a year', month: 'a month' }

/** "$2.99"; a currency Intl doesn't know reads "2.99 XYZ". `whole`: a round amount reads "$19" (0.9.2). */
export function money(amount: number, currency = 'usd', whole = false): string {
  const digits = whole && amount % 100 === 0 ? 0 : 2
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      ...(digits ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(digits)} ${currency.toUpperCase()}`
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

/**
 * What the Pro card says: only what Polar told us, nothing guessed. A key with no plan behind it has
 * no plan line: Polar's key check doesn't say which product sold it, yearly or Pro for life (0.9.2).
 */
export function proCard(p: { license: License; sub: ProSub | null; now: number }): ProCard {
  const { license, sub, now } = p
  const rows: ProCard['rows'] = []
  let plan: string
  if (sub?.lifetime) {
    // Pro for life (0.9.2): paid once, so there is nothing to renew.
    plan = `Pro for life${sub.amount != null && sub.amount > 0 ? `, ${money(sub.amount, sub.currency, true)} paid once` : ''}`
  } else if (sub) {
    const interval = sub.interval ?? 'year'
    const price = sub.amount != null && sub.amount > 0 ? `, ${money(sub.amount, sub.currency)} ${PER[interval] ?? `a ${interval}`}` : ''
    plan = `${PLAN_NAME[interval] ?? 'Plan'}${price}`
    if (sub.periodEnd) {
      const end = sub.cancelAtPeriodEnd ? sub.periodEnd : currentPeriodEnd(sub.periodEnd, interval, now)
      rows.push(sub.cancelAtPeriodEnd ? { label: 'Ends', value: `${shortDate(end)} (cancelled)` } : { label: 'Renews', value: shortDate(end) })
    }
  } else {
    plan = ''
  }
  const since = sub?.startedAt ?? license.since
  if (since) rows.push({ label: 'Pro since', value: shortDate(since) })
  if (license.email) rows.push({ label: 'Email', value: license.email })
  rows.push({ label: 'Key', value: maskKey(license.key) })
  if (license.okAt) rows.push({ label: 'Checked', value: `${daysAgo(license.okAt, now)}, with Polar` })
  return { plan, rows }
}

/**
 * A subscription from Polar's customer portal, in our words; null when it isn't one. 0.9.2: the
 * thanks page sends { lifetime: true, amount, currency, started_at } for a Pro for life order.
 */
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
  if (b.lifetime === true) {
    // Paid once: whatever else came along, there is no period to keep.
    sub.lifetime = true
    const bought = date(b.started_at) ?? date(b.created_at)
    if (bought) sub.startedAt = bought
    return sub
  }
  if (typeof b.recurring_interval === 'string' && b.recurring_interval) sub.interval = b.recurring_interval
  const end = date(b.current_period_end)
  if (end) sub.periodEnd = end
  if (typeof b.cancel_at_period_end === 'boolean') sub.cancelAtPeriodEnd = b.cancel_at_period_end
  const start = date(b.started_at) ?? date(b.created_at)
  if (start) sub.startedAt = start
  return sub.periodEnd || sub.amount != null ? sub : null
}
