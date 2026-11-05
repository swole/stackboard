import type { Announcement, Bookmark, CompanyBrand, CompanyLocks, Space, Stack } from './types'
import { planFolder, type FolderNode } from './importPlan'

// Teams (0.8.0): what an IT admin's Chrome policy turns into on the board. Pure, so every rule is
// unit-tested; the chrome.* side lives in lib/company.ts.
//
// Two sources, both read-only on the board:
// 1. Stackboard's own managed settings (chrome.storage.managed), shaped by public/managed_schema.json:
//    { companyName?, spaces?: [{ name, emoji?, stacks: [{ name, links: [{ title, url }] }] }],
//      announcement?: { id?, text, url?, dismissible? }, showManagedBookmarks? }
//    Teams pack 2 adds goLinks?: { name: url }, spaces[].onboarding?, brand?: { name?, accent? } and
//    lock?: { appearance?, starterPacks?, importExport? }. School mode adds lock.pro?, lock.ai? and
//    lock.rating? (for school or shared computers: no Pro offers, no AI calls, no rating ask).
//    The getstackboard.com board builder writes exactly this shape, so keep the two in step.
// 2. Chrome's own ManagedBookmarks folder, shown as one more space unless showManagedBookmarks is false.
// Admins give each team (an OU in Google Admin, a group in Intune) its own policy, so team spaces
// need nothing extra here.

export const COMPANY_EMOJI = '🏢'
export const COMPANY_FALLBACK_NAME = 'Company'

/** Enough for any real company board, small enough that a bad policy can't swamp a new tab. */
export const LIMITS = {
  spaces: 24,
  stacks: 60,
  links: 300,
  name: 80,
  title: 200,
  text: 280,
  url: 2048,
  id: 64,
  goLinks: 200,
  goName: 40,
  brandName: 40,
} as const

export interface ManagedLink {
  title: string
  url: string
}

export interface ManagedStack {
  name: string
  links: ManagedLink[]
}

export interface ManagedSpace {
  name: string
  emoji: string
  stacks: ManagedStack[]
  /** Where new people start (Teams T7). */
  onboarding: boolean
}

/** A short name typed after "go" in the address bar, and where it leads (Teams T6). */
export interface GoLink {
  name: string
  url: string
}

export interface ManagedConfig {
  companyName: string | null
  spaces: ManagedSpace[]
  announcement: Announcement | null
  showManagedBookmarks: boolean
  goLinks: GoLink[]
  brand: CompanyBrand | null
  lock: CompanyLocks
}

export const NO_LOCKS: CompanyLocks = { appearance: false, starterPacks: false, importExport: false, pro: false, ai: false, rating: false }

export const EMPTY_CONFIG: ManagedConfig = {
  companyName: null,
  spaces: [],
  announcement: null,
  showManagedBookmarks: true,
  goLinks: [],
  brand: null,
  lock: NO_LOCKS,
}

/** http(s) addresses only, trimmed and capped; anything else (javascript:, file:, junk) is null. */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s.length > LIMITS.url) return null
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** A string with runs of whitespace folded to one space, trimmed and cut to `max`; '' for anything else. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** One emoji (or a short symbol), else the company default. */
function cleanEmoji(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s || s.length > 16 || /[\p{L}\p{N}]{2,}/u.test(s)) return COMPANY_EMOJI
  return s
}

/**
 * Chrome hands over parsed policy values, but a value can still arrive wrapped: as the Google
 * Admin console's {"Value": ...} form, or as a JSON string (some registry and plist setups).
 */
function unwrap(v: unknown): unknown {
  if (typeof v === 'string') {
    const s = v.trim()
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        return unwrap(JSON.parse(s))
      } catch {
        return v
      }
    }
    return v
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v as object)
    if (keys.length === 1 && keys[0] === 'Value') return unwrap((v as { Value: unknown }).Value)
  }
  return v
}

const list = (v: unknown): unknown[] => {
  const u = unwrap(v)
  return Array.isArray(u) ? u : []
}
const obj = (v: unknown): Record<string, unknown> => {
  const u = unwrap(v)
  return u && typeof u === 'object' && !Array.isArray(u) ? (u as Record<string, unknown>) : {}
}

/** FNV-1a, base 36: a stable id for an announcement the policy didn't name. */
export function textHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function parseAnnouncement(raw: unknown): Announcement | null {
  const a = obj(raw)
  const text = cleanText(a.text, LIMITS.text)
  if (!text) return null
  const url = safeUrl(a.url) ?? undefined
  const id = cleanText(a.id, LIMITS.id) || `h${textHash(`${text}\n${url ?? ''}`)}`
  return { id, text, ...(url ? { url } : {}), dismissible: a.dismissible !== false }
}

/** A policy switch: true (or the registry's DWORD 1) is on, anything else is off. */
function flag(raw: unknown): boolean {
  const v = unwrap(raw)
  return v === true || v === 1
}

/** "PTO Policy" -> "pto-policy": lowercase, spaces to dashes; null when it isn't a usable name. */
export function cleanGoName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase().replace(/^go\//, '').replace(/\s+/g, '-')
  return s.length <= LIMITS.goName && /^[\p{L}\p{N}][\p{L}\p{N}._\-/]*$/u.test(s) ? s : null
}

/**
 * goLinks is one { name: url } map, the form managed_schema.json declares and the builder writes; a
 * list or anything else reads as no go links. Bad names and non-web addresses go, a name counts once.
 */
export function parseGoLinks(raw: unknown): GoLink[] {
  const pairs = Object.entries(obj(raw))
  const out: GoLink[] = []
  const seen = new Set<string>()
  for (const [n, u] of pairs) {
    if (out.length >= LIMITS.goLinks) break
    const name = cleanGoName(n)
    const url = safeUrl(unwrap(u))
    if (!name || !url || seen.has(name)) continue
    seen.add(name)
    out.push({ name, url })
  }
  return out
}

/** brand: a name for the sidebar header and a '#rrggbb' accent; null when neither is usable. */
export function parseBrand(raw: unknown): CompanyBrand | null {
  const b = obj(raw)
  const name = cleanText(unwrap(b.name), LIMITS.brandName) || null
  const a = unwrap(b.accent)
  const accent = typeof a === 'string' && /^#[0-9a-f]{6}$/i.test(a.trim()) ? a.trim().toLowerCase() : null
  return name || accent ? { name, accent } : null
}

export function parseLocks(raw: unknown): CompanyLocks {
  const l = obj(raw)
  return {
    appearance: flag(l.appearance),
    starterPacks: flag(l.starterPacks),
    importExport: flag(l.importExport),
    pro: flag(l.pro),
    ai: flag(l.ai),
    rating: flag(l.rating),
  }
}

/** Whatever chrome.storage.managed (or the test override) holds, as a complete, safe config. */
export function parseManagedConfig(raw: unknown): ManagedConfig {
  const o = obj(raw)
  const spaces: ManagedSpace[] = []
  for (const s of list(o.spaces)) {
    if (spaces.length >= LIMITS.spaces) break
    const so = obj(s)
    const name = cleanText(so.name, LIMITS.name)
    if (!name) continue
    const stacks: ManagedStack[] = []
    for (const st of list(so.stacks)) {
      if (stacks.length >= LIMITS.stacks) break
      const sto = obj(st)
      const links: ManagedLink[] = []
      for (const l of list(sto.links)) {
        if (links.length >= LIMITS.links) break
        const lo = obj(l)
        const url = safeUrl(lo.url)
        if (!url) continue
        links.push({ title: cleanText(lo.title, LIMITS.title) || url, url })
      }
      if (!links.length) continue
      stacks.push({ name: cleanText(sto.name, LIMITS.name) || 'Links', links })
    }
    spaces.push({ name, emoji: cleanEmoji(so.emoji), stacks, onboarding: flag(so.onboarding) })
  }
  const sm = unwrap(o.showManagedBookmarks)
  return {
    companyName: cleanText(unwrap(o.companyName), LIMITS.name) || null,
    spaces,
    announcement: parseAnnouncement(o.announcement),
    showManagedBookmarks: sm !== false && sm !== 0,
    goLinks: parseGoLinks(o.goLinks),
    brand: parseBrand(o.brand),
    lock: parseLocks(o.lock),
  }
}

export function anyLock(l: CompanyLocks): boolean {
  return l.appearance || l.starterPacks || l.importExport || l.pro || l.ai || l.rating
}

/** True when the policy sets nothing Stackboard shows or applies. */
export function isEmptyConfig(c: ManagedConfig): boolean {
  return !c.companyName && !c.spaces.length && !c.announcement && !c.goLinks.length && !c.brand && !anyLock(c.lock)
}

function readOnlyStack(id: string, title: string, spaceId: string, links: ManagedLink[]): Stack {
  const bookmarks: Bookmark[] = links.map((l, k) => ({
    id: `${id}:${k}`,
    title: l.title,
    url: l.url,
    parentStackId: id,
    batch: true,
    readOnly: true,
  }))
  return { id, title, parentSpaceId: spaceId, bookmarks, readOnly: true }
}

/** The policy's spaces as board spaces, in policy order. Ids start "co:p:" so they never meet a bookmark id. */
export function companySpaces(config: ManagedConfig): Space[] {
  return config.spaces.map((s, i) => {
    const id = `co:p:${i}`
    return {
      id,
      rawTitle: `${s.emoji} ${s.name}`,
      name: s.name,
      emoji: s.emoji,
      company: true,
      ...(s.onboarding ? { onboarding: true } : {}),
      stacks: s.stacks.map((st, j) => readOnlyStack(`${id}:${j}`, st.name, id, st.links)),
    }
  })
}

// ---------- Onboarding (Teams T7) ----------

/** How long an onboarding space leads the company group, counted from the day this device first showed company spaces. */
export const ONBOARDING_MS = 30 * 24 * 60 * 60 * 1000

/** True from the first sight of company spaces (null: right now) until 30 days later. */
export function onboardingActive(firstSeen: number | null, now: number): boolean {
  if (firstSeen === null || !Number.isFinite(firstSeen) || firstSeen > now) return true
  return now - firstSeen < ONBOARDING_MS
}

/**
 * While onboarding is on, onboarding spaces lead the company group with a "Start here" badge;
 * afterwards they follow the other company spaces, badge gone. Order is otherwise kept.
 */
export function arrangeOnboarding(spaces: Space[], active: boolean): Space[] {
  const start = spaces.filter((s) => s.onboarding).map((s) => ({ ...s, startHere: active }))
  if (!start.length) return spaces
  const rest = spaces.filter((s) => !s.onboarding)
  return active ? [...start, ...rest] : [...rest, ...start]
}

/**
 * Chrome's ManagedBookmarks folder as one space, mapped like a first-run import (importPlan) with
 * the pre-0.8.0 rule kept (`nest: false`): links sitting in the folder form a stack named after it,
 * every folder below that holds links becomes a stack named by its path ("Tools › HR"). The board
 * builder writes each company space as a folder there, so its stacks read "⚡ Engineering › Tools".
 * Null when it holds no links.
 */
export function managedFolderSpace(folder: FolderNode): Space | null {
  const name = cleanText(folder.title, LIMITS.name) || 'Managed bookmarks'
  const { space } = planFolder(folder, { name, emoji: COMPANY_EMOJI, looseTitle: name, nest: false })
  const id = `co:mb:${folder.id}`
  const stacks = space.stacks
    .slice(0, LIMITS.stacks)
    .map((st, j) => {
      const links = st.links
        .map((l) => ({ url: safeUrl(l.url), title: cleanText(l.title, LIMITS.title) }))
        .filter((l): l is { url: string; title: string } => !!l.url)
        .slice(0, LIMITS.links)
        .map((l) => ({ url: l.url, title: l.title || l.url }))
      return readOnlyStack(`${id}:${j}`, cleanText(st.title, LIMITS.name) || name, id, links)
    })
    .filter((st) => st.bookmarks.length > 0)
  if (!stacks.length) return null
  return { id, rawTitle: `${COMPANY_EMOJI} ${name}`, name, emoji: COMPANY_EMOJI, company: true, stacks }
}

/** The sidebar group's label. */
export function companyLabel(config: ManagedConfig): string {
  return config.companyName || COMPANY_FALLBACK_NAME
}

// ---------- Announcement dismissals (localStorage, one list per device) ----------

export const DISMISSED_MAX = 20

export function parseDismissed(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-DISMISSED_MAX) : []
  } catch {
    return []
  }
}

/** The list with `id` added last, oldest dropped past the cap. */
export function addDismissed(list: readonly string[], id: string): string[] {
  return [...list.filter((x) => x !== id), id].slice(-DISMISSED_MAX)
}

export function showAnnouncement(a: Announcement | null | undefined, dismissed: readonly string[]): boolean {
  if (!a) return false
  return !a.dismissible || !dismissed.includes(a.id)
}
