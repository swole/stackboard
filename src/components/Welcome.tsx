import { useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { ImportPanel, useImportSources } from './ImportPanel'
import type { ImportSource } from '../lib/importChrome'
import { LazyArcImport as ArcImport } from './ArcImportLazy'
import { StarterPacks } from './StarterPacks'
import { Segmented } from './modals/Modal'

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })

export type ImportFrom = 'chrome' | 'arc'

/**
 * What the welcome screen leads with (0.9.11). 'import': the person's bookmarks, then packs (the default).
 * 'packs': a thin bookmarks folder (under 5 links) puts the starter packs first, the import below them.
 * 'fresh': "Start fresh" on the reveal, packs and a blank space with no import.
 */
export type WelcomeLead = 'import' | 'packs' | 'fresh'

/** Chrome bookmarks or an Arc file (0.9.7), on the welcome screen and in Settings' import dialog. */
export function ImportFromSwitch({ value, onChange }: { value: ImportFrom; onChange: (from: ImportFrom) => void }) {
  return (
    <Segmented<ImportFrom>
      label="Bring in from"
      value={value}
      onChange={onChange}
      options={[
        { value: 'chrome', label: 'From Chrome' },
        { value: 'arc', label: 'From Arc' },
      ]}
    />
  )
}

/**
 * The empty board (0.4.0). Leads with the user's own bookmarks when Chrome has any, then
 * starter packs, then a blank space. Stays up while an import runs (store.onboarding).
 * 0.9.7: Arc's spaces can come in too (Arc stops working on 22 December 2026): a second tab beside
 * Chrome's bookmarks, or, when Chrome has none to copy, a section of its own in the same place.
 */
export function Welcome({ sources: given, lead = 'import' }: { sources?: ImportSource[]; lead?: WelcomeLead } = {}) {
  const openModal = useStackableStore((s) => s.openModal)
  // Teams T8: a company can switch off copying bookmarks in and the starter packs.
  const lock = useStackableStore((s) => s.tree?.company?.lock)
  // 0.9.9: the first-run reveal (Reveal.tsx) has read the sources already when it hands over.
  const read = useImportSources(!!given)
  const sources = given ?? read
  const fresh = lead === 'fresh'
  const hasSources = !fresh && !!sources && sources.length > 0 && !lock?.importExport
  const arcOnly = !fresh && sources !== null && !hasSources && !lock?.importExport
  const importShown = hasSources || arcOnly
  const [from, setFrom] = useState<ImportFrom>('chrome')
  // The page is a flex column, so packs-first is a matter of order.
  const packsFirst = lead === 'packs' && importShown
  const at = (n: number): CSSProperties => (packsFirst ? { order: n } : {})

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[768px] flex-col justify-center px-10 py-14">
        <StackArt />
        <h2 className="rise on-wallpaper mt-7 text-[32px] font-bold leading-tight tracking-tight text-strong" style={delay(90)}>
          Welcome to Stackboard
        </h2>
        <p className="rise on-wallpaper mt-2 max-w-lg text-[15px] leading-relaxed text-muted" style={delay(150)}>
          Your new tab, sorted into spaces of link stacks. Everything is saved as ordinary Chrome
          bookmarks, so it syncs with Chrome and works offline.
        </p>

        {sources === null && <div className="mt-8 h-44 animate-pulse rounded-2xl bg-card/60" />}

        {hasSources && (
          <section
            data-welcome="import"
            className="rise mt-8 rounded-2xl border border-accent-line/50 bg-card p-5 shadow-panel"
            style={{ ...delay(210), ...at(2) }}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div>
                <h3 className="text-base font-semibold text-strong">Bring in your bookmarks</h3>
                <p className="mb-3 mt-0.5 text-sm text-muted">Start with the links you already use.</p>
              </div>
              <ImportFromSwitch value={from} onChange={setFrom} />
            </div>
            {from === 'arc' ? <ArcImport variant="welcome" /> : <ImportPanel sources={sources} variant="welcome" />}
          </section>
        )}

        {arcOnly && (
          <section
            data-welcome="arc"
            className="rise mt-8 rounded-2xl border border-accent-line/50 bg-card p-5 shadow-panel"
            style={{ ...delay(210), ...at(2) }}
          >
            <h3 className="text-base font-semibold text-strong">Moving from Arc?</h3>
            <p className="mb-3 mt-0.5 text-sm text-muted">Bring your Arc spaces, with their folders and pinned tabs.</p>
            <ArcImport variant="welcome" />
          </section>
        )}

        {sources !== null && !lock?.starterPacks && (
          <section data-welcome="packs" className="rise mt-7" style={{ ...delay(importShown ? 270 : 210), ...at(1) }}>
            <h3 className="on-wallpaper mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
              {importShown && !packsFirst ? 'Or start from a pack' : 'Start from a pack'}
            </h3>
            <StarterPacks variant="chips" />
          </section>
        )}

        {sources !== null && (
          <div className="rise on-wallpaper mt-6 flex items-center gap-2 text-sm text-muted" style={{ ...delay(importShown ? 330 : 270), ...at(3) }}>
            Or start with a blank space:
            <button
              onClick={() => openModal({ kind: 'space-add' })}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-accent-text hover:bg-accent-soft"
            >
              <Plus className="h-3.5 w-3.5" />
              New space
            </button>
          </div>
        )}

        <p className="rise on-wallpaper mt-12 text-xs text-muted" style={{ ...delay(390), ...at(4) }}>
          Saved under Other bookmarks › Stackboard. No account, and your bookmarks stay in your browser.
        </p>
      </div>
    </div>
  )
}

/** The brand mark as a small board whose cards deal in, column by column. Colours follow the palette. */
export function StackArt({ size = 92 }: { size?: number }) {
  const cards: Array<[number, number, number, number, number]> = [
    // x, y, h, opacity, column
    [22, 20, 30, 1, 0],
    [22, 55, 20, 0.82, 0],
    [49, 20, 20, 1, 1],
    [49, 45, 20, 0.82, 1],
    [49, 70, 20, 0.64, 1],
    [76, 20, 37, 1, 2],
  ]
  return (
    <svg viewBox="0 0 118 112" width={size} height={Math.round((size * 112) / 118)} className="stack-art rise" aria-hidden>
      <defs>
        <linearGradient id="sb-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--sb-brand-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--sb-brand-to)' }} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="110" height="104" rx="26" fill="url(#sb-tile)" />
      {cards.map(([x, y, h, o, col], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width="20"
          height={h}
          rx="5"
          opacity={o}
          style={{ fill: 'var(--sb-brand-ink)', animationDelay: `${160 + col * 90 + i * 25}ms` }}
        />
      ))}
    </svg>
  )
}
