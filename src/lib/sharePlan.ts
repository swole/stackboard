// Share a stack as a link (0.8.0, backlog T4). The whole stack rides in the link's hash:
// https://getstackboard.com/s#<base64url of deflate-raw JSON>. Browsers never send the hash to a
// server, so getstackboard.com never sees what was shared. Pure apart from CompressionStream, which
// browsers, extension service workers and Node 22 all have, so tests/unit.test.ts covers it.
//
// The receiving page keeps its own copy of the decoding rules (site/s/share-core.js); the unit
// tests decode this module's links with that copy so the two can't drift apart.

export const SHARE_PAGE = 'https://getstackboard.com/s'
export const SHARE_VERSION = 1
/** About 8 KB: chat apps, mail and every browser pass a link that long without trimming it. */
export const MAX_SHARE_URL = 8000
export const MAX_TITLE = 200
export const MAX_URL = 2048
export const MAX_LINKS = 500
/** Unpacked JSON stops here: honest data under 8 KB of deflate never gets close. */
export const MAX_JSON = 256 * 1024

export interface SharedLink {
  title: string
  url: string
}

export interface SharedStack {
  title: string
  links: SharedLink[]
}

/**
 * A to-do stack's marker bookmark (getstackboard.com/todo#<id>, todoPlan.ts) keys someone's private
 * list: it never travels in a share link, and a link carrying one is refused. A stack's colour
 * marker (getstackboard.com/stack#c=…, 0.9.0) isn't a link either.
 */
export function isTodoMarker(u: URL): boolean {
  return /^(www\.)?getstackboard\.com$/i.test(u.hostname) && ['/todo', '/stack'].includes(u.pathname.replace(/\/+$/, ''))
}

/** Web pages only: http and https, a real host, no credentials, not over MAX_URL, no to-do marker. */
export function isShareableUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url || url.length > MAX_URL) return false
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && !u.username && !u.password && !isTodoMarker(u)
  } catch {
    return false
  }
}

/** Control characters and the invisible or direction-flipping ones that can disguise a title. */
const HIDDEN = new RegExp(
  '[' +
    [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]]
      .map(([a, b]) => `${uEsc(a)}-${uEsc(b)}`)
      .join('') +
    ']',
  'g',
)

/** A regex escape for one code point, built without a backslash in this file's text. */
function uEsc(code: number): string {
  return String.fromCharCode(92) + 'u' + code.toString(16).padStart(4, '0')
}

/** Text only: control characters out, whitespace collapsed, capped. */
export function cleanText(value: unknown, max = MAX_TITLE): string {
  if (typeof value !== 'string') return ''
  const flat = value.replace(HIDDEN, ' ')
  return flat.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** The links that can travel: web pages only, a URL once, titles cleaned. */
export function shareableLinks(links: { title?: string; url?: string }[]): SharedLink[] {
  const seen = new Set<string>()
  const out: SharedLink[] = []
  for (const l of links) {
    if (!isShareableUrl(l.url) || seen.has(l.url)) continue
    seen.add(l.url)
    out.push({ title: cleanText(l.title) || l.url, url: l.url })
    if (out.length >= MAX_LINKS) break
  }
  return out
}

/** Compact JSON: {v, t, l: [[title, url], ...]}; a title equal to its URL travels empty. */
export function toPayload(stack: SharedStack): string {
  return JSON.stringify({
    v: SHARE_VERSION,
    t: cleanText(stack.title) || 'Shared links',
    l: stack.links.map((l) => [l.title === l.url ? '' : l.title, l.url]),
  })
}

/** Whatever came out of a link, checked field by field; null when it isn't a shared stack. */
export function parsePayload(raw: unknown): SharedStack | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== SHARE_VERSION || !Array.isArray(o.l)) return null
  const links = shareableLinks(
    o.l
      .filter((e): e is unknown[] => Array.isArray(e) && e.length >= 2)
      .map((e) => ({ title: typeof e[0] === 'string' ? e[0] : '', url: typeof e[1] === 'string' ? e[1] : '' })),
  )
  if (!links.length) return null
  return { title: cleanText(o.t) || 'Shared links', links }
}

// ---------- bytes ----------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function pump(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) {
        await reader.cancel().catch(() => {})
        return null
      }
      parts.push(value)
    }
  } catch {
    return null
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes)
      c.close()
    },
  })
}

type BytePipe = ReadableWritablePair<Uint8Array, Uint8Array>

export async function deflate(text: string): Promise<Uint8Array> {
  const pipe = new CompressionStream('deflate-raw') as unknown as BytePipe
  const out = await pump(streamOf(new TextEncoder().encode(text)).pipeThrough(pipe), Infinity)
  if (!out) throw new Error('Could not compress the stack')
  return out
}

/** Inflates at most `max` bytes; null for anything that isn't valid deflate or runs past the cap. */
export async function inflate(bytes: Uint8Array, max = MAX_JSON): Promise<string | null> {
  const pipe = new DecompressionStream('deflate-raw') as unknown as BytePipe
  const out = await pump(streamOf(bytes).pipeThrough(pipe), max)
  if (!out) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(out)
  } catch {
    return null
  }
}

// ---------- links ----------

export interface ShareLink {
  url: string
  /** links in the link */
  links: number
  /** web links the stack had */
  total: number
}

async function linkFor(stack: SharedStack): Promise<string> {
  return `${SHARE_PAGE}#${bytesToBase64Url(await deflate(toPayload(stack)))}`
}

/**
 * The share link for a stack. When every link won't fit in MAX_SHARE_URL, the link carries the
 * first ones that do (a binary search over the count) and says how many that is.
 */
export async function encodeShare(stack: { title: string; links: { title?: string; url?: string }[] }, max = MAX_SHARE_URL): Promise<ShareLink | null> {
  const links = shareableLinks(stack.links)
  if (!links.length) return null
  const full = await linkFor({ title: stack.title, links })
  if (full.length <= max) return { url: full, links: links.length, total: links.length }
  // The largest count that still fits; a longer prefix never compresses shorter in practice.
  let lo = 1
  let hi = links.length - 1
  let best: string | null = null
  let bestN = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const url = await linkFor({ title: stack.title, links: links.slice(0, mid) })
    if (url.length <= max) {
      best = url
      bestN = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return best ? { url: best, links: bestN, total: links.length } : null
}

/** The stack inside a share link's hash (with or without the leading #), or null. */
export async function decodeShare(hash: string): Promise<SharedStack | null> {
  const data = hash.replace(/^#/, '').trim()
  if (!data || data.length > MAX_SHARE_URL * 2) return null
  const bytes = base64UrlToBytes(data)
  if (!bytes || !bytes.length) return null
  const json = await inflate(bytes)
  if (json === null) return null
  try {
    return parsePayload(JSON.parse(json))
  } catch {
    return null
  }
}

/**
 * True when a share carries links from the folders inside a stack (0.8.0). Its own web links go
 * first, so that's when the link holds more than those.
 */
export function carriesFolderLinks(made: Pick<ShareLink, 'links'>, ownLinks: { title?: string; url?: string }[]): boolean {
  return made.links > shareableLinks(ownLinks).length
}

/**
 * The toast after copying: what was copied, and who can see it. When links from the stack's folders
 * (0.8.0) went in, the share is one flat list, and the toast says that first.
 */
export function shareNote(s: Pick<ShareLink, 'links' | 'total'>, flattened = false): { title: string; detail: string } {
  const who = `${flattened ? 'Its folders are shared as one flat list. ' : ''}Anyone with the link sees these titles and addresses.`
  if (s.links < s.total) {
    return { title: `${s.links} of ${s.total} links`, detail: `A link holds about 8 KB, so it carries the first ${s.links}. ${who}` }
  }
  return { title: s.total === 1 ? '1 link' : `${s.total} links`, detail: who }
}
