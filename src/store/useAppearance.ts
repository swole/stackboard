import { create } from 'zustand'
import {
  bootMirror,
  mergeAppearance,
  parseAppearance,
  resolveScheme,
  settingsFromMirror,
  type Appearance,
  type AppearancePatch,
  type Scheme,
} from '../lib/appearance'

// Appearance (0.5.0). The settings live in chrome.storage.local["appearance"]; a copy in
// localStorage lets public/theme-boot.js theme the first frame. The picture itself is in
// IndexedDB (lib/bgImage.ts). Applying a change only flips attributes on <html>; the colours are
// CSS variables (styles/palettes.css), so a switch costs one style recalc.

const STORAGE_KEY = 'appearance'
const MIRROR_KEY = 'stackable:appearance'
const SLIDER_SAVE_MS = 250

const HAS_STORAGE = typeof chrome !== 'undefined' && !!chrome.storage?.local
const darkQuery: MediaQueryList | null =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const prefersDark = () => darkQuery?.matches ?? false

function readMirror(): Appearance {
  try {
    return settingsFromMirror(localStorage.getItem(MIRROR_KEY))
  } catch {
    return settingsFromMirror(null)
  }
}

function writeMirror(a: Appearance): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(bootMirror(a)))
  } catch {
    // storage blocked: the next tab starts from the stackboard default, then catches up
  }
}

/** Puts the settings on <html>. Transitions are held off for the frame that swaps colours. */
function applyToDocument(a: Appearance, scheme: Scheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const next: Record<string, string> = {
    'data-palette': a.palette,
    'data-mode': a.mode,
    'data-scheme': scheme,
    'data-density': a.density,
  }
  if (root.hasAttribute('data-board')) {
    next['data-bg'] = a.bg.kind
    next['data-gradient'] = String(a.bg.gradient)
  }
  const changed = Object.entries(next).filter(([k, v]) => root.getAttribute(k) !== v)
  if (!changed.length) return
  root.setAttribute('data-theme-switching', '')
  for (const [k, v] of changed) root.setAttribute(k, v)
  // Let one frame render with transitions off, then hand them back.
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-theme-switching')))
}

interface AppearanceState {
  appearance: Appearance
  /** The scheme on screen now. */
  scheme: Scheme
  /** The OS preference, so Settings can preview what each palette would show. */
  systemDark: boolean
  /** Change some settings. `gentle` waits a moment before saving (slider drags). */
  update: (patch: AppearancePatch, opts?: { gentle?: boolean }) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
/** What this tab saved last: its own echo from storage.onChanged is ignored. */
let lastSaved = ''

function save(a: Appearance, gentle: boolean): void {
  writeMirror(a)
  if (!HAS_STORAGE) return
  clearTimeout(saveTimer)
  const write = () => {
    lastSaved = JSON.stringify(a)
    chrome.storage.local.set({ [STORAGE_KEY]: a }).catch(() => {
      // Storage refused (quota, shutdown): the localStorage copy still carries the choice.
    })
  }
  if (gentle) saveTimer = setTimeout(write, SLIDER_SAVE_MS)
  else write()
}

const initial = readMirror()

export const useAppearance = create<AppearanceState>((set, get) => ({
  appearance: initial,
  scheme: resolveScheme(initial.mode, initial.palette, prefersDark()),
  systemDark: prefersDark(),

  update: (patch, opts) => {
    const appearance = mergeAppearance(get().appearance, patch)
    const scheme = resolveScheme(appearance.mode, appearance.palette, prefersDark())
    applyToDocument(appearance, scheme)
    set({ appearance, scheme })
    save(appearance, !!opts?.gentle)
  },
}))

/** Settings that arrived from storage (first load, or another tab): show them, don't save them back. */
function adopt(next: Appearance): void {
  const { appearance } = useAppearance.getState()
  if (JSON.stringify(next) === JSON.stringify(appearance)) return
  const scheme = resolveScheme(next.mode, next.palette, prefersDark())
  applyToDocument(next, scheme)
  useAppearance.setState({ appearance: next, scheme })
  writeMirror(next)
}

let started = false

/** Call once per page (new tab, popup) before the first render. */
export function initAppearance(): void {
  if (started) return
  started = true
  const { appearance, scheme } = useAppearance.getState()
  applyToDocument(appearance, scheme)

  // System mode follows the OS live.
  darkQuery?.addEventListener('change', () => {
    const { appearance: a } = useAppearance.getState()
    const s = resolveScheme(a.mode, a.palette, prefersDark())
    applyToDocument(a, s)
    useAppearance.setState({ scheme: s, systemDark: prefersDark() })
  })

  if (!HAS_STORAGE) return
  chrome.storage.local
    .get(STORAGE_KEY)
    .then((got) => {
      if (got[STORAGE_KEY]) adopt(parseAppearance(got[STORAGE_KEY]))
    })
    .catch(() => {})
  chrome.storage.onChanged.addListener((changes, area) => {
    const value = area === 'local' ? changes[STORAGE_KEY]?.newValue : undefined
    if (!value || JSON.stringify(value) === lastSaved) return
    adopt(parseAppearance(value))
  })
}
