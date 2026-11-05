import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Clock, Monitor, Moon, Sparkles, Sun } from 'lucide-react'
import {
  BLUR_MAX,
  DIM_MAX,
  PALETTES,
  onlyScheme,
  paletteInfo,
  schemeNow,
  variantName,
  type BgKind,
  type Density,
  type GradientId,
  type Layout,
  type Mode,
  type PaletteId,
  type Scheme,
} from '../lib/appearance'
import { deleteBgImage, loadBgImage, prepareBgImage, saveBgImage } from '../lib/bgImage'
import {
  ACCENT_PRESETS,
  DEFAULT_FONT_STACK,
  FONTS,
  TILES,
  WALLPAPERS,
  effectiveLooks,
  onAccentFor,
  type TileSize,
} from '../lib/looks'
import { useAppearance } from '../store/useAppearance'
import { useStackableStore } from '../store/useStackableStore'
import { Segmented } from './modals/Modal'
import { KeepWithPro } from './KeepWithPro'

/**
 * Settings > Appearance (0.5.0). Every change applies to the board behind the dialog at once,
 * which is the preview; the palette swatches are small boards drawn in their own palette.
 */
export function AppearanceSettings() {
  const a = useAppearance((s) => s.appearance)
  const scheme = useAppearance((s) => s.scheme)
  const systemDark = useAppearance((s) => s.systemDark)
  const update = useAppearance((s) => s.update)
  // The Pro looks on screen (0.7.0), a free user's try-on included (0.9.0).
  const onScreen = useAppearance((s) => s.trying ?? effectiveLooks(s.looks, s.proOn))
  const proOn = useAppearance((s) => s.proOn)
  // School mode: under the company's pro lock, Pro looks show only with Pro on, and nothing is tried on.
  const noTryOn = useStackableStore((s) => !!s.tree?.company?.lock.pro) && !proOn
  // A Pro wallpaper stands in for the free background while it shows.
  const wallpaperShown = !!onScreen.wallpaper
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [hasImage, setHasImage] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadBgImage()
      .then((r) => live && setHasImage(!!r))
      .catch(() => live && setHasImage(false))
    return () => {
      live = false
    }
  }, [a.bg.imageRev])

  const chooseBackground = (kind: BgKind) => {
    setError(null)
    // Picking a free background puts away the Pro wallpaper that was showing.
    if (wallpaperShown) useAppearance.getState().updateLooks({ wallpaper: null })
    // No picture saved yet: picking "Image" goes straight to the file chooser.
    if (kind === 'image' && !hasImage) {
      fileRef.current?.click()
      return
    }
    update({ bg: { kind } })
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // the same file can be picked again later
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await saveBgImage(await prepareBgImage(file))
      setHasImage(true)
      update({ bg: { kind: 'image', imageRev: Date.now() } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removeImage = async () => {
    setError(null)
    await deleteBgImage().catch(() => {})
    setHasImage(false)
    update({ bg: { kind: 'solid', imageRev: Date.now() } })
  }

  // Time of day (Pro, 0.9.0) sits beside the free modes; underneath, the free mode goes back to
  // System, which is what shows if Pro stops.
  const timed = !!onScreen.timeOfDay
  const pickMode = (mode: Mode | 'time') => {
    const { updateLooks, proOn: pro } = useAppearance.getState()
    if (mode === 'time') {
      if (pro && a.mode !== 'system') update({ mode: 'system' })
      updateLooks({ timeOfDay: true })
      return
    }
    if (timed) updateLooks({ timeOfDay: false })
    update({ mode })
  }
  const hour = new Date().getHours()

  const info = paletteInfo(a.palette)
  const only = onlyScheme(a.palette)
  const shown = variantName(a.palette, scheme)
  let note = `Showing ${shown}.`
  if (timed) {
    note = only ? `${info.name} only comes in ${only}, so it stays ${only}.` : `Showing ${shown}. Light from 7 am, dark from 7 pm.`
    if (!proOn) note += ' Time of day is part of Pro: your board shows it until you close Settings.'
  } else if (only && a.mode !== 'system' && a.mode !== only) note = `${info.name} only comes in ${only}, so it stays ${only}.`
  else if (only) note += ` It only comes in ${only}.`
  else if (a.mode === 'system') {
    note += ` Switches to ${variantName(a.palette, scheme === 'dark' ? 'light' : 'dark')} when your system turns ${scheme === 'dark' ? 'light' : 'dark'}.`
  }

  return (
    <section data-appearance>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</h3>

      <div role="radiogroup" aria-label="Palette" className="grid grid-cols-4 gap-2.5">
        {PALETTES.map((p) => {
          const s = schemeNow(a.mode, p.id, systemDark, timed, hour)
          return (
            <PaletteOption
              key={p.id}
              id={p.id}
              name={p.name}
              scheme={s}
              detail={variantLabel(p.id, s)}
              selected={p.id === a.palette}
              onPick={() => update({ palette: p.id })}
            />
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-3.5">
        <RowLabel>Mode</RowLabel>
        <div>
          <Segmented<Mode | 'time'>
            label="Mode"
            value={timed ? 'time' : a.mode}
            onChange={pickMode}
            options={[
              { value: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" /> },
              { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
              { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
              ...(noTryOn ? [] : [{ value: 'time' as const, label: 'Time of day', icon: <Clock className="h-3.5 w-3.5" /> }]),
            ]}
          />
          <p data-mode-note className="mt-1.5 text-xs leading-relaxed text-muted">
            {note}
          </p>
        </div>

        <RowLabel>Background</RowLabel>
        <div>
          <Segmented<BgKind | 'wallpaper'>
            label="Background"
            value={wallpaperShown ? 'wallpaper' : a.bg.kind}
            onChange={(kind) => kind !== 'wallpaper' && chooseBackground(kind)}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: busy ? 'Saving…' : 'Image' },
            ]}
          />
          {wallpaperShown && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted">Showing a Pro wallpaper. Pick one of these to go back.</p>
          )}
          {!wallpaperShown && a.bg.kind === 'gradient' && (
            <div role="radiogroup" aria-label="Gradient" className="mt-2.5 grid grid-cols-3 gap-2">
              {([1, 2, 3] as GradientId[]).map((g) => {
                const on = a.bg.gradient === g
                return (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Gradient ${g}`}
                    data-gradient-option={g}
                    onClick={() => update({ bg: { gradient: g } })}
                    className={`h-11 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      on ? 'ring-2 ring-focus' : 'ring-1 ring-line hover:ring-line-strong'
                    }`}
                    style={{ background: `var(--sb-gradient-${g})` }}
                  />
                )
              })}
            </div>
          )}
          {!wallpaperShown && a.bg.kind === 'image' && (
            <ImageControls
              busy={busy}
              onReplace={() => fileRef.current?.click()}
              onRemove={() => void removeImage()}
            />
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            data-bg-file
            onChange={(e) => void onFile(e)}
          />
        </div>

        <RowLabel>Density</RowLabel>
        <Segmented<Density>
          label="Density"
          value={a.density}
          onChange={(density) => update({ density })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />

        <RowLabel>Layout</RowLabel>
        <LayoutSwitch value={a.layout} onChange={(layout) => update({ layout })} />
      </div>

      {!noTryOn && <ProLooks />}
    </section>
  )
}

function LayoutSwitch({ value, onChange }: { value: Layout; onChange: (layout: Layout) => void }) {
  return (
    <Segmented<Layout>
      label="Layout"
      value={value}
      onChange={onChange}
      options={[
        { value: 'packed', label: 'Packed' },
        { value: 'rows', label: 'Rows' },
      ]}
    />
  )
}

/**
 * Packed or Rows on its own (0.8.0), for when the company manages the rest of Appearance (Teams
 * T8): the lock covers the look of the board, and the layout stays the person's own choice.
 */
export function LayoutSetting() {
  const layout = useAppearance((s) => s.appearance.layout)
  const update = useAppearance((s) => s.update)
  return (
    <div data-layout-setting className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3">
      <RowLabel>Layout</RowLabel>
      <LayoutSwitch value={layout} onChange={(next) => update({ layout: next })} />
    </div>
  )
}

/**
 * Pro looks (0.7.0): accent, font, tile size and wallpaper. What was picked before stays saved for
 * when Pro comes back. 0.9.0: without Pro every control is a try-on: the board shows the picks
 * until Settings closes, nothing is saved, and the trial keeps them.
 */
function ProLooks() {
  const looks = useAppearance((s) => s.trying ?? effectiveLooks(s.looks, s.proOn))
  const trying = useAppearance((s) => !!s.trying)
  const proOn = useAppearance((s) => s.proOn)
  // Closing Settings puts the free look back.
  useEffect(() => () => useAppearance.getState().endTry(), [])
  const updateLooks = useAppearance((s) => s.updateLooks)
  const policyAccent = useAppearance((s) => s.policyAccent)
  const custom = looks.accent && !ACCENT_PRESETS.some((p) => p.hex === looks.accent) ? looks.accent : null

  return (
    <div data-pro-looks={proOn ? 'on' : 'off'} data-looks-trying={trying ? '' : undefined} className="mt-5 border-t border-line pt-4">
      <h4 className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Sparkles className="h-3.5 w-3.5" />
        Pro looks
      </h4>
      {!proOn && !trying && (
        <p data-pro-looks-note className="mb-1 text-xs leading-relaxed text-muted">
          Part of Stackboard Pro. Try any of them: your board shows each pick until you close Settings.
        </p>
      )}
      {!proOn && trying && <KeepWithPro data-looks-keep="" text="Trying Pro looks. Keep this look:" />}
      <fieldset className="mt-2.5 grid min-w-0 grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-3.5">
        <RowLabel>Accent</RowLabel>
        {policyAccent ? (
          <p data-policy-accent className="flex items-center gap-2 pt-1 text-xs text-muted">
            <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-line" style={{ background: policyAccent }} />
            Your company sets this colour.
          </p>
        ) : (
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button
            type="button"
            role="radio"
            aria-checked={looks.accent === null}
            data-accent-option="palette"
            onClick={() => updateLooks({ accent: null })}
            className={`h-6 rounded-full px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              looks.accent === null ? 'bg-card text-strong ring-2 ring-focus' : 'text-muted ring-1 ring-line hover:text-fg hover:ring-line-strong'
            }`}
          >
            Palette
          </button>
          {ACCENT_PRESETS.map((p) => {
            const on = looks.accent === p.hex
            return (
              <button
                key={p.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={p.name}
                title={p.name}
                data-accent-option={p.hex}
                onClick={() => updateLooks({ accent: p.hex })}
                className={`flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  on ? 'ring-2 ring-focus ring-offset-2 ring-offset-raised' : 'ring-1 ring-line'
                }`}
                style={{ background: p.hex }}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3.5} style={{ color: onAccentFor(p.hex) }} />}
              </button>
            )
          })}
          <label
            title="Any colour"
            className={`relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full focus-within:ring-2 focus-within:ring-focus ${
              custom ? 'ring-2 ring-focus ring-offset-2 ring-offset-raised' : 'ring-1 ring-line'
            }`}
            style={{
              background: custom ?? 'conic-gradient(from 90deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)',
            }}
          >
            <input
              type="color"
              aria-label="Pick any colour"
              data-accent-custom
              value={looks.accent ?? '#2563eb'}
              onChange={(e) => updateLooks({ accent: e.target.value }, { gentle: true })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            {custom && <Check className="pointer-events-none h-3 w-3" strokeWidth={3.5} style={{ color: onAccentFor(custom) }} />}
          </label>
        </div>
        )}

        <RowLabel>Font</RowLabel>
        <div role="radiogroup" aria-label="Font" className="grid grid-cols-3 gap-1.5">
          {FONTS.map((f) => {
            const on = looks.font === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-font-option={f.id}
                onClick={() => updateLooks({ font: f.id })}
                className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  on ? 'bg-card ring-2 ring-focus' : 'ring-1 ring-line hover:ring-line-strong'
                }`}
              >
                <span className="text-[15px] leading-none text-strong" style={{ fontFamily: f.stack || DEFAULT_FONT_STACK }}>
                  Aa
                </span>
                <span className="truncate text-xs text-muted">{f.name}</span>
              </button>
            )
          })}
        </div>

        <RowLabel>Tile size</RowLabel>
        <Segmented<TileSize>
          label="Tile size"
          value={looks.tile}
          onChange={(tile) => updateLooks({ tile })}
          options={TILES.map((t) => ({ value: t.id, label: t.name }))}
        />

        <RowLabel>Wallpaper</RowLabel>
        <div>
          <div role="radiogroup" aria-label="Wallpaper" className="grid grid-cols-4 gap-2">
            {WALLPAPERS.map((w) => {
              const on = looks.wallpaper === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-wallpaper-option={w.id}
                  title={w.moving ? `${w.name}: moves slowly` : w.name}
                  onClick={() => updateLooks({ wallpaper: on ? null : w.id })}
                  className="group/wp flex min-w-0 flex-col gap-1 rounded-lg text-left focus-visible:outline-none"
                >
                  <span
                    data-wallpaper-preview={w.id}
                    className={`relative block aspect-[16/10] overflow-hidden rounded-lg group-focus-visible/wp:ring-2 group-focus-visible/wp:ring-focus ${
                      on ? 'ring-2 ring-focus' : 'ring-1 ring-line group-hover/wp:ring-line-strong'
                    }`}
                  />
                  <span className="truncate px-0.5 text-[11px] text-muted">{w.name}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Click a wallpaper again to take it off. Drift, Tide and Orbit move slowly, and hold still when your computer asks for less motion.
          </p>
        </div>
      </fieldset>
    </div>
  )
}

/** "Mocha", "Latte", "Dark", or "Dark only" for a palette with a single version. */
function variantLabel(id: PaletteId, scheme: Scheme): string {
  const only = onlyScheme(id)
  if (only) return only === 'dark' ? 'Dark only' : 'Light only'
  const name = paletteInfo(id).name
  const v = variantName(id, scheme)
  const rest = v.startsWith(name) ? v.slice(name.length).trim() : v
  return rest || (scheme === 'dark' ? 'Dark' : 'Light')
}

function RowLabel({ children }: { children: ReactNode }) {
  return <div className="pt-1.5 text-xs font-medium text-soft">{children}</div>
}

function PaletteOption(props: {
  id: PaletteId
  name: string
  scheme: Scheme
  detail: string
  selected: boolean
  onPick: () => void
}) {
  const { id, name, scheme, detail, selected, onPick } = props
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-palette-option={id}
      onClick={onPick}
      className="group/swatch flex min-w-0 flex-col gap-1.5 rounded-lg text-left focus-visible:outline-none"
    >
      <span
        className={`relative block aspect-[16/10] rounded-lg transition-shadow group-focus-visible/swatch:ring-2 group-focus-visible/swatch:ring-focus ${
          selected ? 'ring-2 ring-focus' : 'ring-1 ring-line group-hover/swatch:ring-line-strong'
        }`}
      >
        <MiniBoard palette={id} scheme={scheme} />
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-focus text-canvas">
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          </span>
        )}
      </span>
      <span className="min-w-0 px-0.5 leading-tight">
        <span className="block truncate text-xs font-medium text-fg">{name}</span>
        <span className="block truncate text-[11px] text-muted">{detail}</span>
      </span>
    </button>
  )
}

/** A thumbnail board drawn with the real tokens of one palette variant. */
function MiniBoard({ palette, scheme }: { palette: PaletteId; scheme: Scheme }) {
  const stacks = [3, 4, 2]
  return (
    <span
      aria-hidden
      data-palette={palette}
      data-scheme={scheme}
      className="absolute inset-0 overflow-hidden rounded-lg bg-canvas"
    >
      <span className="absolute inset-y-0 left-0 w-[22%] border-r border-line bg-panel">
        <span className="absolute left-[20%] top-[13%] h-[5px] w-[42%] rounded-full bg-accent" />
        <span className="absolute left-[20%] top-[32%] h-[4px] w-[60%] rounded-full bg-selected" />
        <span className="absolute left-[20%] top-[45%] h-[4px] w-[48%] rounded-full bg-line-strong" />
        <span className="absolute left-[20%] top-[58%] h-[4px] w-[54%] rounded-full bg-line-strong" />
      </span>
      <span className="absolute left-[28%] right-[6%] top-[15%] grid grid-cols-3 items-start gap-[6%]">
        {stacks.map((n, c) => (
          <span key={c} className="flex flex-col gap-[3px] rounded-[3px] bg-well p-[2px]">
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className="flex h-[7px] items-center gap-[2px] rounded-[2px] bg-card px-[2px]">
                <span className={`h-[3px] w-[3px] shrink-0 rounded-full ${c === 0 && i === 0 ? 'bg-accent' : 'bg-faint'}`} />
                <span className="h-[2px] flex-1 rounded-full bg-muted opacity-60" />
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}

function ImageControls({ busy, onReplace, onRemove }: { busy: boolean; onReplace: () => void; onRemove: () => void }) {
  const dim = useAppearance((s) => s.appearance.bg.dim)
  const blur = useAppearance((s) => s.appearance.bg.blur)
  const rev = useAppearance((s) => s.appearance.bg.imageRev)
  const update = useAppearance((s) => s.update)
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let url: string | null = null
    void loadBgImage()
      .then((r) => {
        if (!r || !live) return
        url = URL.createObjectURL(r.blob)
        setThumb(url)
      })
      .catch(() => {})
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [rev])

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        {thumb ? (
          <img src={thumb} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover ring-1 ring-line" />
        ) : (
          <span className="h-10 w-16 shrink-0 rounded-md bg-sunken ring-1 ring-line" />
        )}
        <button
          type="button"
          onClick={onReplace}
          disabled={busy}
          className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Replace'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md px-2 py-1 text-xs text-muted hover:bg-danger-soft hover:text-danger"
        >
          Remove
        </button>
      </div>
      <Slider label="Dim" value={dim} max={DIM_MAX} unit="%" onChange={(v) => update({ bg: { dim: v } }, { gentle: true })} />
      <Slider label="Blur" value={blur} max={BLUR_MAX} unit="px" onChange={(v) => update({ bg: { blur: v } }, { gentle: true })} />
      <p className="text-xs leading-relaxed text-muted">
        Kept on this device only. Big photos are resized to fit your screen.
      </p>
    </div>
  )
}

function Slider(props: { label: string; value: number; max: number; unit: string; onChange: (v: number) => void }) {
  const { label, value, max, unit, onChange } = props
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-9 shrink-0 text-xs text-soft">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        data-slider={label.toLowerCase()}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
        {value}
        {unit}
      </span>
    </div>
  )
}
