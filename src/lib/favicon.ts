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

export interface ResolvedIcon {
  src: string
  generic: boolean
}

function fingerprint(img: HTMLImageElement): string | null {
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
    return h.toString(36)
  } catch {
    return null // tainted canvas (S2 fallback in demo mode) or no 2D context
  }
}

function fingerprintOf(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(fingerprint(img))
    img.onerror = () => resolve(null)
    img.src = src
  })
}

let genericGlobe: Promise<string | null> | null = null

function genericGlobeFingerprint(): Promise<string | null> {
  genericGlobe ??= fingerprintOf(faviconUrl('https://stackboard-no-favicon.invalid/', 32))
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
      if ((await fingerprintOf(src)) !== globe) return { src, generic: false }
      const fresh = `${src}&v=${PAGE_NONCE}`
      const again = await fingerprintOf(fresh)
      return again !== null && again !== globe ? { src: fresh, generic: false } : { src, generic: true }
    })()
    p.then((r) => settled.set(src, r))
    pending.set(src, p)
  }
  return p
}

// ---------- Monogram tiles ----------

// Warm tints that sit with the peach/cream palette. Background + letter colour.
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
export function monogram(title: string, url: string): { letter: string; bg: string; fg: string } {
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // keep '' and colour by title
  }
  const letter = (title.match(/[\p{L}\p{N}]/u)?.[0] ?? host[0] ?? '?').toLocaleUpperCase()
  const [bg, fg] = TINTS[hash(host || title) % TINTS.length]
  return { letter, bg, fg }
}
