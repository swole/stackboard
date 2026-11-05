// Decoding a shared stack on getstackboard.com/s (Stackboard 0.8.0, T4). The same rules as the
// extension's src/lib/sharePlan.ts; tests/unit.test.ts decodes the extension's links with this
// file so the two stay in step. Runs only in the browser: the hash never reaches our server.

export const SHARE_VERSION = 1
export const MAX_SHARE_URL = 8000
export const MAX_TITLE = 200
export const MAX_URL = 2048
export const MAX_LINKS = 500
export const MAX_JSON = 256 * 1024

/** Control characters and the invisible or direction-flipping ones that can disguise a title. */
const HIDDEN = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]]

/** A to-do stack's marker bookmark (getstackboard.com/todo#<id>) keys a private list, and a stack's colour
 *  marker (getstackboard.com/stack#c=…, 0.9.0) is no link: neither is shown or passed on. */
export function isTodoMarker(u) {
  return /^(www\.)?getstackboard\.com$/i.test(u.hostname) && ['/todo', '/stack'].includes(u.pathname.replace(/\/+$/, ''))
}

export function isShareableUrl(url) {
  if (typeof url !== 'string' || !url || url.length > MAX_URL) return false
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && !u.username && !u.password && !isTodoMarker(u)
  } catch {
    return false
  }
}

export function cleanText(value, max = MAX_TITLE) {
  if (typeof value !== 'string') return ''
  let flat = ''
  for (const ch of value) {
    const c = ch.codePointAt(0)
    flat += HIDDEN.some(([a, b]) => c >= a && c <= b) ? ' ' : ch
  }
  return flat.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function shareableLinks(links) {
  const seen = new Set()
  const out = []
  for (const l of links) {
    if (!isShareableUrl(l.url) || seen.has(l.url)) continue
    seen.add(l.url)
    out.push({ title: cleanText(l.title) || l.url, url: l.url })
    if (out.length >= MAX_LINKS) break
  }
  return out
}

export function parsePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.v !== SHARE_VERSION || !Array.isArray(raw.l)) return null
  const links = shareableLinks(
    raw.l
      .filter((e) => Array.isArray(e) && e.length >= 2)
      .map((e) => ({ title: typeof e[0] === 'string' ? e[0] : '', url: typeof e[1] === 'string' ? e[1] : '' })),
  )
  if (!links.length) return null
  return { title: cleanText(raw.t) || 'Shared links', links }
}

export function base64UrlToBytes(s) {
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

export async function inflate(bytes, max = MAX_JSON) {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(bytes)
      c.close()
    },
  }).pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const parts = []
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
    const out = new Uint8Array(size)
    let at = 0
    for (const p of parts) {
      out.set(p, at)
      at += p.length
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(out)
  } catch {
    return null
  }
}

/** The stack in a share link's hash (with or without the #), or null for anything else. */
export async function decodeShare(hash) {
  const data = String(hash || '').replace(/^#/, '').trim()
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

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** One letter for the tile, from the site name: no favicon requests leave this page. */
export function monogram(url) {
  const host = hostOf(url)
  const parts = host.split('.')
  const name = parts.length > 2 ? parts[parts.length - 2] : parts[0]
  return (name || '?').charAt(0).toUpperCase()
}
