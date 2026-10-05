// In MV3, favicons are exposed via chrome-extension://<id>/_favicon/?pageUrl=...&size=32
// This requires the "favicon" permission and a web_accessible_resources entry for _favicon/*.
// Outside an extension (vite preview, screenshots), fall back to Google's S2 favicon service.
const IS_EXTENSION_RUNTIME =
  typeof chrome !== 'undefined' && !!(chrome as { runtime?: { getURL?: unknown } }).runtime?.getURL

export function faviconUrl(pageUrl: string, size: number = 32): string {
  if (!IS_EXTENSION_RUNTIME) {
    try {
      const host = new URL(pageUrl).hostname
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
    } catch {
      return ''
    }
  }
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'))
    u.searchParams.set('pageUrl', pageUrl)
    u.searchParams.set('size', String(size))
    return u.toString()
  } catch {
    return ''
  }
}

// ---------- "No real favicon" detection ----------
//
// _favicon never errors: for a page Chrome has no icon for (intranet tools, sites never
// visited on this device) it serves its generic globe. Fingerprint that globe once, via a
// URL that can't have an icon, and compare each favicon against it. The images are
// same-origin with the extension page, so the canvas read is allowed.

/**
 * A one-colour icon on a transparent background: 'dark' (GitHub's black octocat, Wikipedia's W)
 * vanishes on a dark card, 'light' on a light one. index.css flips those in the other scheme
 * (0.5.0). Coloured icons and icons on their own tile are left alone (null).
 */
export type Glyph = 'dark' | 'light' | null

export interface ResolvedIcon {
  src: string
  generic: boolean
  glyph?: Glyph
}

/** Classifies 16x16 RGBA pixels: a mono glyph covers part of the square and is near black or white. */
export function glyphOf(px: ArrayLike<number>): Glyph {
  let opaque = 0
  let dark = 0
  let light = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    opaque++
    const r = px[i], g = px[i + 1], b = px[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > 48) continue // has colour
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (y < 80) dark++
    else if (y > 200) light++
  }
  const coverage = opaque / (px.length / 4)
  if (coverage < 0.06 || coverage > 0.82) return null // empty, or a full tile with its own background
  if (dark / opaque >= 0.85) return 'dark'
  if (light / opaque >= 0.85) return 'light'
  return null
}

interface Analysis {
  hash: string
  glyph: Glyph
}

function analyze(img: HTMLImageElement): Analysis | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, 16, 16)
    const px = ctx.getImageData(0, 0, 16, 16).data
    let h = 2166136261
    for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 16777619) >>> 0
    return { hash: h.toString(36), glyph: glyphOf(px) }
  } catch {
    return null // tainted canvas (S2 fallback in demo mode) or no 2D context
  }
}

function analyzeSrc(src: string): Promise<Analysis | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(analyze(img))
    img.onerror = () => resolve(null)
    img.src = src
  })
}

let genericGlobe: Promise<string | null> | null = null

function genericGlobeFingerprint(): Promise<string | null> {
  genericGlobe ??= analyzeSrc(faviconUrl('https://stackboard-no-favicon.invalid/', 32)).then((a) => a?.hash ?? null)
  return genericGlobe
}

// Blink caches _favicon images across this extension's pages. If a new tab rendered a
// site's globe before you ever visited it, later tabs keep getting that stale globe. A
// generic result therefore gets one retry with a per-page cache buster.
const PAGE_NONCE = Date.now().toString(36)

const pending = new Map<string, Promise<ResolvedIcon>>()
const settled = new Map<string, ResolvedIcon>()

/** The finished answer for this src, if this page already worked it out. */
export function peekFavicon(src: string): ResolvedIcon | undefined {
  return settled.get(src)
}

/** Which image to show for a _favicon src, and whether it's only Chrome's generic globe. */
export function resolveFavicon(src: string): Promise<ResolvedIcon> {
  if (!src) return Promise.resolve({ src, generic: true })
  if (!IS_EXTENSION_RUNTIME) return Promise.resolve({ src, generic: false })
  let p = pending.get(src)
  if (!p) {
    p = (async (): Promise<ResolvedIcon> => {
      const globe = await genericGlobeFingerprint()
      if (globe === null) return { src, generic: false }
      const first = await analyzeSrc(src)
      if (first?.hash !== globe) return { src, generic: false, glyph: first?.glyph ?? null }
      const fresh = `${src}&v=${PAGE_NONCE}`
      const again = await analyzeSrc(fresh)
      return again !== null && again.hash !== globe
        ? { src: fresh, generic: false, glyph: again.glyph }
        : { src, generic: true }
    })()
    p.then((r) => settled.set(src, r))
    pending.set(src, p)
  }
  return p
}

// ---------- Monogram tiles ----------

// Warm tints that sit with the peach/cream palette. Background + letter colour. From 0.5.0 the
// board paints tiles with the palette's own --sb-tint-N-* pair (palettes.css); these are the
// Stackboard light values, kept for anything drawn outside a palette.
const TINTS: Array<[bg: string, fg: string]> = [
  ['#f9d0ad', '#82381c'], // peach
  ['#fde3a7', '#7a4a0c'], // amber
  ['#d9e7cb', '#3f5a2a'], // sage
  ['#cde8e2', '#1f5d52'], // teal
  ['#d6e4f3', '#274b6d'], // sky
  ['#e5dcf3', '#4c3a78'], // lilac
  ['#f6d5dc', '#7a2e41'], // rose
  ['#ede5d2', '#57534e'], // sand
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  return h
}

/** Letter from the title, colour from the host, so links from one site share a tint. */
export function monogram(title: string, url: string): { letter: string; bg: string; fg: string; tint: number } {
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // keep '' and colour by title
  }
  const letter = (title.match(/[\p{L}\p{N}]/u)?.[0] ?? host[0] ?? '?').toLocaleUpperCase()
  const tint = hash(host || title) % TINTS.length
  const [bg, fg] = TINTS[tint]
  return { letter, bg, fg, tint }
}
