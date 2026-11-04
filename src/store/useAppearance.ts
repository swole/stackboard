import { create } from 'zustand'
import {
  bootMirror,
  looksFromMirror,
  mergeAppearance,
  policyAccentFromMirror,
  parseSavedAppearance,
  resolveScheme,
  settingsFromMirror,
  type Appearance,
  type AppearancePatch,
  type Scheme,
} from '../lib/appearance'
import { ACCENT_VAR_NAMES, lookMirror, mergeLooks, parseLooks, type LookMirror, type Looks } from '../lib/looks'
import { hasPro } from '../lib/proPlan'

// Appearance (0.5.0). The settings live in chrome.storage.local["appearance"]; a copy in
// localStorage lets public/theme-boot.js theme the first frame. The picture itself is in
// IndexedDB (lib/bgImage.ts). Applying a change only flips attributes on <html>; the colours are
// CSS variables (styles/palettes.css), so a switch costs one style recalc.
// Pro looks (0.7.0) live in chrome.storage.local["looks"] and show only while Pro or the trial is
// on (usePro). The last known answer rides in the localStorage copy, so the first frame matches.

const STORAGE_KEY = 'appearance'
const LOOKS_KEY = 'looks'
const MIRROR_KEY = 'stackable:appearance'
const SLIDER_SAVE_MS = 250

const HAS_STORAGE = typeof chrome !== 'undefined' && !!chrome.storage?.local
const darkQuery: MediaQueryList | null =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const prefersDark = () => darkQuery?.matches ?? false

function readMirror(): string | null {
  try {
    return localStorage.getItem(MIRROR_KEY)
  } catch {
    return null
  }
}

function writeMirror(a: Appearance, looks: Looks, pro: boolean): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(bootMirror(a, looks, pro, useAppearance.getState().policyAccent)))
  } catch {
    // storage blocked: the next tab starts from the stackboard default, then catches up
  }
}

/** Puts the settings on <html>. Transitions are held off for the frame that swaps colours. */
function applyToDocument(a: Appearance, scheme: Scheme, look: LookMirror): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const next: Record<string, string | null> = {
    'data-palette': a.palette,
    'data-mode': a.mode,
    'data-scheme': scheme,
    'data-density': a.density,
    'data-accent': look.accent ? 'custom' : null,
    'data-font': look.font,
    'data-tile': look.tile,
  }
  if (root.hasAttribute('data-board')) {
    next['data-bg'] = look.wallpaper ? 'wallpaper' : a.bg.kind
    next['data-gradient'] = String(a.bg.gradient)
    next['data-wallpaper'] = look.wallpaper
  }
  const props: Record<string, string | null> = { '--font-sans': look.fontStack || null }
  for (const name of ACCENT_VAR_NAMES) props[name] = look.vars[name] ?? null
  const changed = Object.entries(next).filter(([k, v]) => root.getAttribute(k) !== v)
  const changedProps = Object.entries(props).filter(([k, v]) => (root.style.getPropertyValue(k).trim() || null) !== v)
  if (!changed.length && !changedProps.length) return
  root.setAttribute('data-theme-switching', '')
  for (const [k, v] of changed) {
    if (v === null) root.removeAttribute(k)
    else root.setAttribute(k, v)
  }
  for (const [k, v] of changedProps) {
    if (v === null) root.style.removeProperty(k)
    else root.style.setProperty(k, v)
  }
  // Let one frame render with transitions off, then hand them back.
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-theme-switching')))
}

interface AppearanceState {
  appearance: Appearance
  /** The saved Pro looks; they show only while `proOn`. */
  looks: Looks
  /** Pro or the trial is on (the last known answer until usePro has loaded). */
  proOn: boolean
  /** Teams T8: the company's accent from Chrome policy; it shows for everyone and wins over looks.accent. */
  policyAccent: string | null
  /** The scheme on screen now. */
  scheme: Scheme
  /** The OS preference, so Settings can preview what each palette would show. */
  systemDark: boolean
  /** Change some settings. `gentle` waits a moment before saving (slider drags). */
  update: (patch: AppearancePatch, opts?: { gentle?: boolean }) => void
  /** Change the Pro looks. `gentle` waits a moment before saving (the colour picker). */
  updateLooks: (patch: Partial<Looks>, opts?: { gentle?: boolean }) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let looksTimer: ReturnType<typeof setTimeout> | undefined
/** What this tab saved last: its own echo from storage.onChanged is ignored. */
let lastSaved = ''
let lastSavedLooks = ''

function save(a: Appearance, gentle: boolean): void {
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

function saveLooks(l: Looks, gentle: boolean): void {
  if (!HAS_STORAGE) return
  clearTimeout(looksTimer)
  const write = () => {
    lastSavedLooks = JSON.stringify(l)
    chrome.storage.local.set({ [LOOKS_KEY]: l }).catch(() => {})
  }
  if (gentle) looksTimer = setTimeout(write, SLIDER_SAVE_MS)
  else write()
}

const mirrored = readMirror()
const initial = settingsFromMirror(mirrored)
const initialLooks = looksFromMirror(mirrored)
const initialPolicyAccent = policyAccentFromMirror(mirrored)

/** Longest the board waits for the saved settings when there is no boot copy to start from. */
const SETTLE_MAX_MS = 1500
let settle: () => void = () => {}
/**
 * Resolves once the settings the first board needs are known (0.8.0, for the layout): at once
 * when the boot copy had them, otherwise after chrome.storage.local answers (an old board that
 * never saved any gets Rows there from background.ts on the update), and never later than
 * SETTLE_MAX_MS. The stackable store waits for it before the first board shows, so there's no jump.
 */
export const appearanceSettled: Promise<void> = new Promise((resolve) => {
  settle = resolve
})
if (mirrored || !HAS_STORAGE) settle()
else setTimeout(() => settle(), SETTLE_MAX_MS)

export const useAppearance = create<AppearanceState>((set, get) => ({
  appearance: initial,
  looks: initialLooks.looks,
  proOn: initialLooks.pro,
  policyAccent: initialPolicyAccent,
  scheme: resolveScheme(initial.mode, initial.palette, prefersDark()),
  systemDark: prefersDark(),

  update: (patch, opts) => {
    const { looks, proOn, policyAccent } = get()
    const appearance = mergeAppearance(get().appearance, patch)
    const scheme = resolveScheme(appearance.mode, appearance.palette, prefersDark())
    applyToDocument(appearance, scheme, lookMirror(looks, proOn, policyAccent))
    set({ appearance, scheme })
    writeMirror(appearance, looks, proOn)
    save(appearance, !!opts?.gentle)
  },

  updateLooks: (patch, opts) => {
    const { appearance, scheme, proOn, policyAccent } = get()
    const looks = mergeLooks(get().looks, patch)
    applyToDocument(appearance, scheme, lookMirror(looks, proOn, policyAccent))
    set({ looks })
    writeMirror(appearance, looks, proOn)
    saveLooks(looks, !!opts?.gentle)
  },
}))

/** Shows the current state on <html> and in the boot copy. */
function render(): void {
  const { appearance, looks, proOn, scheme, policyAccent } = useAppearance.getState()
  applyToDocument(appearance, scheme, lookMirror(looks, proOn, policyAccent))
  writeMirror(appearance, looks, proOn)
}

/** Teams T8: the board read the company policy; its accent (or none) shows from now on. */
export function setPolicyAccent(hex: string | null): void {
  if (useAppearance.getState().policyAccent === hex) return
  useAppearance.setState({ policyAccent: hex })
  render()
}

/** Settings that arrived from storage (first load, or another tab): show them, don't save them back. */
function adopt(next: Appearance): void {
  const { appearance } = useAppearance.getState()
  if (JSON.stringify(next) === JSON.stringify(appearance)) return
  useAppearance.setState({ appearance: next, scheme: resolveScheme(next.mode, next.palette, prefersDark()) })
  render()
}

function adoptLooks(next: Looks): void {
  if (JSON.stringify(next) === JSON.stringify(useAppearance.getState().looks)) return
  useAppearance.setState({ looks: next })
  render()
}

/** Pro started or stopped: the saved looks come back or step aside. */
function setProOn(on: boolean): void {
  if (useAppearance.getState().proOn === on) return
  useAppearance.setState({ proOn: on })
  render()
}

let started = false

/** Call once per page (new tab, popup) before the first render. */
export function initAppearance(): void {
  if (started) return
  started = true
  const { appearance, looks, proOn, scheme, policyAccent } = useAppearance.getState()
  applyToDocument(appearance, scheme, lookMirror(looks, proOn, policyAccent))

  // System mode follows the OS live.
  darkQuery?.addEventListener('change', () => {
    const { appearance: a } = useAppearance.getState()
    useAppearance.setState({ scheme: resolveScheme(a.mode, a.palette, prefersDark()), systemDark: prefersDark() })
    render()
  })

  // Pro looks follow Pro on the board; until usePro has loaded, the last known answer from the boot
  // copy stands. The popup keeps that answer: it never loads lib/pro.ts, because importing it
  // counts a new-tab visit (onboarding.ts) and would skew the rating prompt.
  if (typeof document !== 'undefined' && document.documentElement.hasAttribute('data-board')) {
    void import('../lib/pro')
      .then(({ usePro }) => {
        const follow = (s: ReturnType<typeof usePro.getState>) => {
          if (s.ready) setProOn(hasPro(s.state))
        }
        follow(usePro.getState())
        usePro.subscribe(follow)
      })
      .catch(() => {})
  }

  if (!HAS_STORAGE) return
  chrome.storage.local
    .get([STORAGE_KEY, LOOKS_KEY])
    .then((got) => {
      if (got[STORAGE_KEY]) adopt(parseSavedAppearance(got[STORAGE_KEY]))
      if (got[LOOKS_KEY]) adoptLooks(parseLooks(got[LOOKS_KEY]))
    })
    .catch(() => {})
    .finally(() => settle())
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const value = changes[STORAGE_KEY]?.newValue
    if (value && JSON.stringify(value) !== lastSaved) adopt(parseSavedAppearance(value))
    const looks = changes[LOOKS_KEY]?.newValue
    if (looks && JSON.stringify(looks) !== lastSavedLooks) adoptLooks(parseLooks(looks))
  })
}
