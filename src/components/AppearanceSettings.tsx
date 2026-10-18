import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import {
  BLUR_MAX,
  DIM_MAX,
  PALETTES,
  onlyScheme,
  paletteInfo,
  resolveScheme,
  variantName,
  type BgKind,
  type Density,
  type GradientId,
  type Mode,
  type PaletteId,
  type Scheme,
} from '../lib/appearance'
import { deleteBgImage, loadBgImage, prepareBgImage, saveBgImage } from '../lib/bgImage'
import { useAppearance } from '../store/useAppearance'

/**
 * Settings > Appearance (0.5.0). Every change applies to the board behind the dialog at once,
 * which is the preview; the palette swatches are small boards drawn in their own palette.
 */
export function AppearanceSettings() {
  const a = useAppearance((s) => s.appearance)
  const scheme = useAppearance((s) => s.scheme)
  const systemDark = useAppearance((s) => s.systemDark)
  const update = useAppearance((s) => s.update)
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

  const info = paletteInfo(a.palette)
  const only = onlyScheme(a.palette)
  const shown = variantName(a.palette, scheme)
  let note = `Showing ${shown}.`
  if (only && a.mode !== 'system' && a.mode !== only) note = `${info.name} only comes in ${only}, so it stays ${only}.`
  else if (only) note += ` It only comes in ${only}.`
  else if (a.mode === 'system') {
    note += ` Switches to ${variantName(a.palette, scheme === 'dark' ? 'light' : 'dark')} when your system turns ${scheme === 'dark' ? 'light' : 'dark'}.`
  }

  return (
    <section data-appearance>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</h3>

      <div role="radiogroup" aria-label="Palette" className="grid grid-cols-4 gap-2.5">
        {PALETTES.map((p) => {
          const s = resolveScheme(a.mode, p.id, systemDark)
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
          <Segmented<Mode>
            label="Mode"
            value={a.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" /> },
              { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
              { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
            ]}
          />
          <p data-mode-note className="mt-1.5 text-xs leading-relaxed text-muted">
            {note}
          </p>
        </div>

        <RowLabel>Background</RowLabel>
        <div>
          <Segmented<BgKind>
            label="Background"
            value={a.bg.kind}
            onChange={chooseBackground}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: busy ? 'Saving…' : 'Image' },
            ]}
          />
          {a.bg.kind === 'gradient' && (
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
          {a.bg.kind === 'image' && (
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
      </div>
    </section>
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

function Segmented<T extends string>(props: {
  label: string
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode }>
  onChange: (value: T) => void
}) {
  const { label, value, options, onChange } = props
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit flex-wrap rounded-lg bg-sunken p-0.5 ring-1 ring-line">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-option={o.value}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              on ? 'bg-card text-strong shadow-xs ring-1 ring-line' : 'text-muted hover:text-fg'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
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
