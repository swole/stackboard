// Test helpers (0.5.0): WCAG 2.x contrast, CSS-style sRGB mixing, and a reader for
// src/styles/palettes.css, so the unit suite can check the palettes that actually ship.

export type Rgba = [r: number, g: number, b: number, a: number]

export function parseHex(hex: string): Rgba {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!m) throw new Error(`not a #rrggbb or #rrggbbaa colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]
}

export function toHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of an opaque colour. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. Order doesn't matter. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** color-mix(in srgb, a t, b): t is a's share, 0 to 1. */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a)
  const B = parseHex(b)
  return toHex([0, 1, 2].map((i) => A[i] * t + B[i] * (1 - t)))
}

/** A colour with alpha laid over an opaque one. */
export function over(top: string, bottom: string): string {
  const [r, g, b, a] = parseHex(top)
  return mix(toHex([r, g, b]), bottom, a)
}

export interface PaletteBlock {
  palette: string
  scheme: string
  tokens: Map<string, string>
}

/** The [data-palette][data-scheme] blocks of palettes.css, with their --sb-* values. */
export function readPalettes(css: string): PaletteBlock[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks: PaletteBlock[] = []
  for (const m of bare.matchAll(/\[data-palette="([a-z]+)"\]\[data-scheme="(light|dark)"\]\s*\{([^}]*)\}/g)) {
    const tokens = new Map<string, string>()
    for (const d of m[3].matchAll(/--sb-([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens.set(d[1], d[2].replace(/\s+/g, ' ').trim())
    blocks.push({ palette: m[1], scheme: m[2], tokens })
  }
  return blocks
}

/** Every opaque #rrggbb colour stop in a gradient value. */
export function gradientStops(value: string): string[] {
  return value.match(/#[0-9a-f]{6}\b/gi) ?? []
}
