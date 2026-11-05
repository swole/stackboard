// Pro looks (0.7.0): an accent colour, a font, a tile size and a wallpaper, on top of the free
// appearance settings (appearance.ts). Pure: no DOM, no chrome.*, so tests/unit.test.ts covers all
// of it. store/useAppearance.ts applies them only while Pro or the trial is on; when Pro stops they
// stay saved and the board shows the free look until Pro comes back.

export type FontId = 'default' | 'rounded' | 'humanist' | 'geometric' | 'serif' | 'mono'
export type TileSize = 'small' | 'medium' | 'large'
export type WallpaperId = 'dots' | 'grid' | 'waves' | 'stripes' | 'rings' | 'paper' | 'aurora' | 'glow' | 'drift' | 'tide' | 'orbit'

export interface Looks {
  /** '#rrggbb', or null for the palette's own accent. */
  accent: string | null
  font: FontId
  tile: TileSize
  /** A pattern behind the board, or null for the free background (solid, gradient or picture). */
  wallpaper: WallpaperId | null
  /** 0.9.0: the palette's light version by day and its dark one by night (appearance.ts timeScheme). Stored only when on. */
  timeOfDay?: boolean
}

export const DEFAULT_LOOKS: Looks = { accent: null, font: 'default', tile: 'medium', wallpaper: null }

/** Each one carries white text at 4.5:1 or better, so buttons keep the classic look. */
export const ACCENT_PRESETS: readonly { hex: string; name: string }[] = [
  { hex: '#dc2626', name: 'Red' },
  { hex: '#c2410c', name: 'Orange' },
  { hex: '#b45309', name: 'Amber' },
  { hex: '#15803d', name: 'Green' },
  { hex: '#0f766e', name: 'Teal' },
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#7c3aed', name: 'Violet' },
  { hex: '#db2777', name: 'Pink' },
]

/** The board's own font; keep in step with --font-sans in styles/index.css. */
export const DEFAULT_FONT_STACK = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Fonts already on the computer (modernfontstacks.com), so nothing downloads. */
export const FONTS: readonly { id: FontId; name: string; stack: string }[] = [
  { id: 'default', name: 'Default', stack: '' },
  {
    id: 'rounded',
    name: 'Rounded',
    stack: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif",
  },
  { id: 'humanist', name: 'Humanist', stack: "Seravek, 'Gill Sans Nova', Ubuntu, Candara, 'DejaVu Sans', source-sans-pro, sans-serif" },
  { id: 'geometric', name: 'Geometric', stack: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif" },
  { id: 'serif', name: 'Serif', stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif" },
  { id: 'mono', name: 'Mono', stack: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
]

export const TILES: readonly { id: TileSize; name: string }[] = [
  { id: 'small', name: 'Small' },
  { id: 'medium', name: 'Medium' },
  { id: 'large', name: 'Large' },
]

/**
 * Drawn in styles/index.css from the palette's tokens, so each suits every palette. The `moving`
 * ones (0.9.0) drift on a slow loop and hold still under reduced motion.
 */
export const WALLPAPERS: readonly { id: WallpaperId; name: string; moving?: true }[] = [
  { id: 'dots', name: 'Dots' },
  { id: 'grid', name: 'Grid' },
  { id: 'waves', name: 'Waves' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'rings', name: 'Rings' },
  { id: 'paper', name: 'Paper' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'glow', name: 'Glow' },
  { id: 'drift', name: 'Drift', moving: true },
  { id: 'tide', name: 'Tide', moving: true },
  { id: 'orbit', name: 'Orbit', moving: true },
]

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** '#ABC' or '#aabbcc' as '#aabbcc'; anything else is null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('')
  return null
}

/** Whatever storage holds, as complete and valid Looks: unknown values fall back to the defaults. */
export function parseLooks(raw: unknown): Looks {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_LOOKS
  const wallpaper = WALLPAPERS.find((w) => w.id === o.wallpaper)?.id ?? null
  return {
    accent: normalizeHex(o.accent),
    font: pick(o.font, FONTS.map((f) => f.id), d.font),
    tile: pick(o.tile, TILES.map((t) => t.id), d.tile),
    wallpaper,
    ...(o.timeOfDay === true ? { timeOfDay: true as const } : {}),
  }
}

export function mergeLooks(l: Looks, patch: Partial<Looks>): Looks {
  return parseLooks({ ...l, ...patch })
}

/** What shows: the saved looks while Pro is on, the stock board otherwise. */
export function effectiveLooks(l: Looks, pro: boolean): Looks {
  return pro ? l : DEFAULT_LOOKS
}

export function fontStack(id: FontId): string {
  return FONTS.find((f) => f.id === id)?.stack ?? ''
}

// ---------- Colour ----------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(c: number[]): string {
  return '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** color-mix(in srgb, a share, b). */
export function mixHex(a: string, b: string, share: number): string {
  const A = rgb(a)
  const B = rgb(b)
  return toHex([0, 1, 2].map((i) => A[i] * share + B[i] * (1 - share)))
}

/** Text on an accent button: white while it clears 4.5:1, black otherwise (which then always does). */
export function onAccentFor(hex: string): '#ffffff' | '#000000' {
  return contrast('#ffffff', hex) >= 4.5 ? '#ffffff' : '#000000'
}

/** Hover goes away from the text colour, so the button text only gains contrast. */
export function accentHoverFor(hex: string): string {
  return onAccentFor(hex) === '#ffffff' ? mixHex(hex, '#000000', 0.85) : mixHex(hex, '#ffffff', 0.85)
}

/** The accent, pushed toward black or white until its luminance passes `ok`. */
function toward(hex: string, end: '#000000' | '#ffffff', ok: (l: number) => boolean): string {
  for (let i = 0; i <= 50; i++) {
    const c = mixHex(hex, end, 1 - i / 50)
    if (ok(luminance(c))) return c
  }
  return end
}

// Targets, from the palettes in styles/palettes.css. Light surfaces go down to Tokyo Night Day's
// panel (luminance 0.66); dark ones, inverse toasts included, go up to Nord's (0.09). Text needs
// 4.5:1 against those, focus rings and marks 3:1.
const TEXT_LIGHT_MAX = 0.105
const TEXT_DARK_MIN = 0.61
const MARK_LIGHT_MAX = 0.185
const MARK_DARK_MIN = 0.28

/** The custom properties a custom accent puts on <html>; index.css derives the accent family from them. */
export function accentVars(hex: string): Record<string, string> {
  return {
    '--sb-custom-accent': hex,
    '--sb-custom-on-accent': onAccentFor(hex),
    '--sb-custom-accent-hover': accentHoverFor(hex),
    '--sb-custom-text-light': toward(hex, '#000000', (l) => l <= TEXT_LIGHT_MAX),
    '--sb-custom-text-dark': toward(hex, '#ffffff', (l) => l >= TEXT_DARK_MIN),
    '--sb-custom-mark-light': toward(hex, '#000000', (l) => l <= MARK_LIGHT_MAX),
    '--sb-custom-mark-dark': toward(hex, '#ffffff', (l) => l >= MARK_DARK_MIN),
  }
}

/** Every property name accentVars() sets, for clearing them again. */
export const ACCENT_VAR_NAMES: readonly string[] = Object.keys(accentVars('#000000'))

/** The look on screen, worked out ahead so public/theme-boot.js can paint it on the first frame. */
export interface LookMirror {
  accent: string | null
  vars: Record<string, string>
  font: FontId
  fontStack: string
  tile: TileSize
  wallpaper: WallpaperId | null
  /** 0.9.0: theme-boot.js picks light or dark by the clock. */
  timeOfDay?: true
}

/**
 * `policyAccent` (Teams T8, 0.8.0): a company's brand colour from Chrome policy. It shows for
 * everyone, Pro or not, and wins over a personal accent while the policy sets it.
 */
export function lookMirror(l: Looks, pro: boolean, policyAccent: string | null = null): LookMirror {
  const e = effectiveLooks(l, pro)
  const accent = normalizeHex(policyAccent) ?? e.accent
  return {
    accent,
    vars: accent ? accentVars(accent) : {},
    font: e.font,
    fontStack: fontStack(e.font),
    tile: e.tile,
    wallpaper: e.wallpaper,
    ...(e.timeOfDay ? { timeOfDay: true as const } : {}),
  }
}
