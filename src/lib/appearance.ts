// Appearance settings (0.5.0): palette, light/dark mode, density and the board's background; the
// stack layout since 0.8.0. Pure: no DOM, no chrome.*, so tests/unit.test.ts can cover all of it.
// The DOM side lives in store/useAppearance.ts; the colours themselves live in styles/palettes.css.
// The Pro looks (0.7.0: accent, font, tile size, wallpaper) live in looks.ts and ride along in the
// boot mirror.

import { DEFAULT_LOOKS, lookMirror, normalizeHex, parseLooks, type LookMirror, type Looks } from './looks'

export type Mode = 'system' | 'light' | 'dark'
export type Scheme = 'light' | 'dark'
export type PaletteId = 'stackboard' | 'catppuccin' | 'gruvbox' | 'nord' | 'black' | 'tokyonight' | 'rosepine' | 'dracula'
export type Density = 'comfortable' | 'compact'
/** 0.8.0: Packed tucks each stack under the one above it (lib/packPlan.ts); Rows is the plain grid. */
export type Layout = 'packed' | 'rows'
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
  /**
   * Packed on a new install; a board with settings from before 0.8.0 keeps Rows
   * (parseSavedAppearance, and background.ts on the update). Not a boot attribute: the stacks
   * render after the store has the settings (the mirror's, or storage's when there is no mirror),
   * so the first board already has it.
   */
  layout: Layout
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
  // 0.5.2: pure #000000 canvas for OLED screens, dark only.
  { id: 'black', name: 'True black', dark: 'True black' },
  // 0.5.4 (backlog F2): Tokyo Night (Night/Day), Rosé Pine (main/Dawn), Dracula (dark only).
  { id: 'tokyonight', name: 'Tokyo Night', light: 'Tokyo Night Day', dark: 'Tokyo Night' },
  { id: 'rosepine', name: 'Rosé Pine', light: 'Rosé Pine Dawn', dark: 'Rosé Pine' },
  { id: 'dracula', name: 'Dracula', dark: 'Dracula' },
]

export const DIM_MAX = 85
export const BLUR_MAX = 24

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  palette: 'stackboard',
  density: 'comfortable',
  layout: 'packed',
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

/**
 * Time of day (Pro, 0.9.0): the light version from 07:00, the dark one from 19:00, by this
 * computer's clock. public/theme-boot.js repeats these hours for the first frame.
 */
export const DAY_STARTS = 7
export const DAY_ENDS = 19

export function timeScheme(hour: number): Scheme {
  return hour >= DAY_STARTS && hour < DAY_ENDS ? 'light' : 'dark'
}

/** The scheme on screen: with time of day on, the clock asks in place of the mode. */
export function schemeNow(mode: Mode, palette: PaletteId, prefersDark: boolean, timeOfDay: boolean, hour: number): Scheme {
  return resolveScheme(timeOfDay ? timeScheme(hour) : mode, palette, prefersDark)
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
const LAYOUTS: readonly Layout[] = ['packed', 'rows']
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
    layout: pick(o.layout, LAYOUTS, d.layout),
    bg: {
      kind: pick(b.kind, KINDS, d.bg.kind),
      gradient: clampInt(b.gradient, 1, 3, d.bg.gradient) as GradientId,
      dim: clampInt(b.dim, 0, DIM_MAX, d.bg.dim),
      blur: clampInt(b.blur, 0, BLUR_MAX, d.bg.blur),
      imageRev: clampInt(b.imageRev, 0, Number.MAX_SAFE_INTEGER, 0),
    },
  }
}

/** Packed is the default for new installs only: a board updated from before this keeps Rows. */
export const PACKED_VERSION = '0.8.0'

/** Saved settings with no layout key were saved before 0.8.0. */
function savedBeforeLayout(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && !('layout' in raw)
}

/**
 * Saved settings as they come back from chrome.storage.local or the boot copy. Settings saved
 * before 0.8.0 have no layout, and those boards keep Rows; nothing saved at all is a new board,
 * which gets Packed. A layout someone picked always stands.
 */
export function parseSavedAppearance(raw: unknown): Appearance {
  const a = parseAppearance(raw)
  return savedBeforeLayout(raw) ? { ...a, layout: 'rows' } : a
}

/**
 * What an update from before 0.8.0 writes to chrome.storage.local["appearance"] (background.ts,
 * like the early-user mark): the saved settings with Rows, or just Rows when nothing was saved.
 * Null when a layout is saved already, since someone picked it.
 */
export function rowsForOldBoard(saved: unknown): Record<string, unknown> | null {
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    return savedBeforeLayout(saved) ? { ...(saved as Record<string, unknown>), layout: 'rows' } : null
  }
  return { layout: 'rows' }
}

/**
 * The localStorage copy that public/theme-boot.js reads to theme the first frame, before any
 * module loads. The script knows no palettes, so the one-scheme case is worked out here. The full
 * settings ride along so the store starts from them without waiting for chrome.storage.
 * 0.7.0: `look` is the Pro look on screen (empty while Pro is off), `looks` the saved Pro looks and
 * `pro` the last known Pro state, so a lapsed key never flashes Pro looks on the first frame.
 */
export interface BootMirror {
  palette: PaletteId
  mode: Mode
  only: Scheme | null
  density: Density
  bg: BgKind
  gradient: GradientId
  settings: Appearance
  look: LookMirror
  looks: Looks
  pro: boolean
  /** Teams T8 (0.8.0): the company's accent from Chrome policy, when one is set. */
  policyAccent?: string
}

export function bootMirror(a: Appearance, looks: Looks = DEFAULT_LOOKS, pro = false, policyAccent: string | null = null): BootMirror {
  return {
    palette: a.palette,
    mode: a.mode,
    only: onlyScheme(a.palette),
    density: a.density,
    bg: a.bg.kind,
    gradient: a.bg.gradient,
    settings: a,
    look: lookMirror(looks, pro, policyAccent),
    looks,
    pro,
    ...(policyAccent ? { policyAccent } : {}),
  }
}

/** The company accent the last page saw, so the next one paints it on the first frame. */
export function policyAccentFromMirror(json: string | null): string | null {
  if (!json) return null
  try {
    const m = JSON.parse(json) as Partial<BootMirror> | null
    return normalizeHex(m?.policyAccent)
  } catch {
    return null
  }
}

/** The saved Pro looks and the last known Pro state from the mirror; defaults when there are none. */
export function looksFromMirror(json: string | null): { looks: Looks; pro: boolean } {
  if (!json) return { looks: DEFAULT_LOOKS, pro: false }
  try {
    const m = JSON.parse(json) as Partial<BootMirror> | null
    return { looks: parseLooks(m?.looks), pro: m?.pro === true }
  } catch {
    return { looks: DEFAULT_LOOKS, pro: false }
  }
}

/** Settings from the mirror, or the defaults when there is none or it doesn't parse. */
export function settingsFromMirror(json: string | null): Appearance {
  if (!json) return DEFAULT_APPEARANCE
  try {
    const m = JSON.parse(json) as Partial<BootMirror> | null
    // A copy written before 0.8.0 has no layout: that board keeps Rows from its first frame.
    return parseSavedAppearance(m?.settings)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

/** Apply a partial change; numbers are clamped like anything read from storage. */
export type AppearancePatch = Partial<Omit<Appearance, 'bg'>> & { bg?: Partial<Background> }

export function mergeAppearance(a: Appearance, patch: AppearancePatch): Appearance {
  return parseAppearance({ ...a, ...patch, bg: { ...a.bg, ...patch.bg } })
}
