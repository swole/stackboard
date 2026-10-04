import type { CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { ImportPanel, useImportSources } from './ImportPanel'
import { StarterPacks } from './StarterPacks'

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })

/**
 * The empty board (0.4.0). Leads with the user's own bookmarks when Chrome has any, then
 * starter packs, then a blank space. Stays up while an import runs (store.onboarding).
 */
export function Welcome() {
  const openModal = useStackableStore((s) => s.openModal)
  const sources = useImportSources()
  const hasSources = !!sources && sources.length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[768px] flex-col justify-center px-10 py-14">
        <StackArt />
        <h2 className="rise mt-7 text-[32px] font-bold leading-tight tracking-tight text-ink-800" style={delay(90)}>
          Welcome to Stackboard
        </h2>
        <p className="rise mt-2 max-w-lg text-[15px] leading-relaxed text-ink-500" style={delay(150)}>
          Your new tab, sorted into spaces of link stacks. Everything is saved as ordinary Chrome
          bookmarks, so it syncs with Chrome and works offline.
        </p>

        {sources === null && <div className="mt-8 h-44 animate-pulse rounded-2xl bg-white/60" />}

        {hasSources && (
          <section
            data-welcome="import"
            className="rise mt-8 rounded-2xl border border-peach-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgb(130_56_28/0.45)]"
            style={delay(210)}
          >
            <h3 className="text-base font-semibold text-ink-800">Bring in your bookmarks</h3>
            <p className="mb-3 mt-0.5 text-sm text-ink-500">Start with the links you already use.</p>
            <ImportPanel sources={sources} variant="welcome" />
          </section>
        )}

        {sources !== null && (
          <section data-welcome="packs" className="rise mt-7" style={delay(hasSources ? 270 : 210)}>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              {hasSources ? 'Or start from a pack' : 'Start from a pack'}
            </h3>
            <StarterPacks variant="chips" />
          </section>
        )}

        {sources !== null && (
          <div className="rise mt-6 flex items-center gap-2 text-sm text-ink-500" style={delay(hasSources ? 330 : 270)}>
            Or start with a blank space:
            <button
              onClick={() => openModal({ kind: 'space-add' })}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-peach-700 hover:bg-peach-100"
            >
              <Plus className="h-3.5 w-3.5" />
              New space
            </button>
          </div>
        )}

        <p className="rise mt-12 text-xs text-ink-400" style={delay(390)}>
          Saved under Other bookmarks › Stackboard. No account, and nothing leaves your browser.
        </p>
      </div>
    </div>
  )
}

/** The brand mark as a small board whose cards deal in, column by column. */
function StackArt() {
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
    <svg viewBox="0 0 118 112" width="92" height="87" className="stack-art rise" aria-hidden>
      <defs>
        <linearGradient id="sb-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f28f4f" />
          <stop offset="1" stopColor="#d2581d" />
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
          fill="#fff"
          opacity={o}
          style={{ animationDelay: `${160 + col * 90 + i * 25}ms` }}
        />
      ))}
    </svg>
  )
}
