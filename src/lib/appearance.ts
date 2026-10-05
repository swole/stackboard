// Appearance settings (0.5.0): palette, light/dark mode, density and the board's background.
// Pure: no DOM, no chrome.*, so tests/unit.test.ts can cover all of it. The DOM side lives in
// store/useAppearance.ts; the colours themselves live in styles/palettes.css.

export type Mode = 'system' | 'light' | 'dark'
export type Scheme = 'light' | 'dark'
export type PaletteId = 'stackboard' | 'catppuccin' | 'gruvbox' | 'nord'
export type Density = 'comfortable' | 'compact'
export type BgKind = 'solid' | 'gradient' | 'image'
export type GradientId = 1 | 2 | 3

export interface Background {
  kind: BgKind
  gradient: GradientId
  /** 0-85: how much of the canvas colour is laid over the picture, so cards stay readable. */
  dim: number
  /** 0-24 px of blur on the picture. */
  blur: number
  /** Bumped whenever a new picture is saved; other open tabs reload it when it changes. */
  imageRev: number
}

export interface Appearance {
  mode: Mode
  palette: PaletteId
  density: Density
  bg: Background
}

export interface PaletteInfo {
  id: PaletteId
  name: string
  /** Variant names; a missing one means the palette has no such version (Nord is dark only). */
  light?: string
  dark?: string
}

export const PALETTES: readonly PaletteInfo[] = [
  { id: 'stackboard', name: 'Stackboard', light: 'Stackboard Light', dark: 'Stackboard Dark' },
  { id: 'catppuccin', name: 'Catppuccin', light: 'Catppuccin Latte', dark: 'Catppuccin Mocha' },
  { id: 'gruvbox', name: 'Gruvbox', light: 'Gruvbox Light', dark: 'Gruvbox Dark' },
  { id: 'nord', name: 'Nord', dark: 'Nord' },
]

export const DIM_MAX = 85
export const BLUR_MAX = 24

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  palette: 'stackboard',
  density: 'comfortable',
  bg: { kind: 'solid', gradient: 1, dim: 35, blur: 0, imageRev: 0 },
}

/**
 * Every custom property a palette variant in palettes.css must define, without the --sb- prefix.
 * The unit tests hold palettes.css to this list.
 */
export const PALETTE_TOKENS: readonly string[] = [
  'canvas', 'panel', 'card', 'raised', 'well', 'hover', 'selected', 'sunken',
  'strong', 'fg', 'soft', 'muted', 'faint', 'ghost',
  'line', 'line-strong',
  'accent', 'accent-hover', 'on-accent', 'accent-soft', 'accent-line', 'accent-text', 'accent-mark', 'focus',
  'danger', 'danger-fill', 'danger-fill-hover', 'on-danger', 'danger-soft',
  'inverse', 'on-inverse', 'inverse-strong', 'inverse-muted', 'inverse-accent',
  'scrim', 'shade', 'brand-from', 'brand-to', 'brand-ink',
  ...Array.from({ length: 8 }, (_, i) => [`tint-${i}-bg`, `tint-${i}-fg`]).flat(),
  'gradient-1', 'gradient-2', 'gradient-3',
]

export function paletteInfo(id: PaletteId): PaletteInfo {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/** Light or dark for this palette: the mode asks, the palette may only have one version. */
export function resolveScheme(mode: Mode, palette: PaletteId, prefersDark: boolean): Scheme {
  const info = paletteInfo(palette)
  const want: Scheme = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  if (want === 'dark' && !info.dark) return 'light'
  if (want === 'light' && !info.light) return 'dark'
  return want
}

/** The only scheme a palette has, or null when it has both. */
export function onlyScheme(palette: PaletteId): Scheme | null {
  const info = paletteInfo(palette)
  if (!info.light) return 'dark'
  if (!info.dark) return 'light'
  return null
}

export function variantName(palette: PaletteId, scheme: Scheme): string {
  const info = paletteInfo(palette)
  return (scheme === 'dark' ? info.dark : info.light) ?? info.name
}

const MODES: readonly Mode[] = ['system', 'light', 'dark']
const DENSITIES: readonly Density[] = ['comfortable', 'compact']
const KINDS: readonly BgKind[] = ['solid', 'gradient', 'image']

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Reads whatever chrome.storage.local (or the localStorage mirror) holds and returns a complete,
 * valid Appearance: unknown values fall back to the defaults, numbers are clamped.
 */
export function parseAppearance(raw: unknown): Appearance {
  const d = DEFAULT_APPEARANCE
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const b = o.bg && typeof o.bg === 'object' ? (o.bg as Record<string, unknown>) : {}
  return {
    mode: pick(o.mode, MODES, d.mode),
    palette: pick(o.palette, PALETTES.map((p) => p.id), d.palette),
    density: pick(o.density, DENSITIES, d.density),
    bg: {
      kind: pick(b.kind, KINDS, d.bg.kind),
      gradient: clampInt(b.gradient, 1, 3, d.bg.gradient) as GradientId,
      dim: clampInt(b.dim, 0, DIM_MAX, d.bg.dim),
      blur: clampInt(b.blur, 0, BLUR_MAX, d.bg.blur),
      imageRev: clampInt(b.imageRev, 0, Number.MAX_SAFE_INTEGER, 0),
    },
  }
}

/**
 * The localStorage copy that public/theme-boot.js reads to theme the first frame, before any
 * module loads. The script knows no palettes, so the one-scheme case is worked out here. The full
 * settings ride along so the store starts from them without waiting for chrome.storage.
 */
export interface BootMirror {
  palette: PaletteId
  mode: Mode
  only: Scheme | null
  density: Density
  bg: BgKind
  gradient: GradientId
  settings: Appearance
}

export function bootMirror(a: Appearance): BootMirror {
  return {
    palette: a.palette,
    mode: a.mode,
    only: onlyScheme(a.palette),
    density: a.density,
    bg: a.bg.kind,
    gradient: a.bg.gradient,
    settings: a,
  }
}

/** Settings from the mirror, or the defaults when there is none or it doesn't parse. */
export function settingsFromMirror(json: string | null): Appearance {
  if (!json) return DEFAULT_APPEARANCE
  try {
    const m = JSON.parse(json) as Partial<BootMirror> | null
    return parseAppearance(m?.settings)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

/** Apply a partial change; numbers are clamped like anything read from storage. */
export type AppearancePatch = Partial<Omit<Appearance, 'bg'>> & { bg?: Partial<Background> }

export function mergeAppearance(a: Appearance, patch: AppearancePatch): Appearance {
  return parseAppearance({ ...a, ...patch, bg: { ...a.bg, ...patch.bg } })
}
