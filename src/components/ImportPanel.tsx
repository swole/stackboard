import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { listSources, createPlannedSpace, type ImportSource } from '../lib/importChrome'
import { deleteSpace } from '../lib/bookmarks'
import { countPlanned, countPlannedFolders, countPlannedStack, plural, withLeadStack, type PlannedStack } from '../lib/importPlan'
import { loadFreeTidy } from '../lib/tidy'
import { offerTidyCoach } from '../lib/tidyCoach'
import { tidyInput } from '../lib/tidyPlan'
import { useStackableStore } from '../store/useStackableStore'

/** Chrome's folders with links in them; null while loading. 0.9.9: `skip` when a parent already read them. */
export function useImportSources(skip = false): ImportSource[] | null {
  const [sources, setSources] = useState<ImportSource[] | null>(null)
  useEffect(() => {
    if (skip) return
    let live = true
    listSources()
      .then((s) => live && setSources(s))
      .catch((err) => {
        // Used to look exactly like "no bookmarks to copy"; say why as well.
        useStackableStore.getState().reportError('read your bookmarks', err)
        if (live) setSources([])
      })
    return () => {
      live = false
    }
  }, [skip])
  return sources
}

interface Props {
  sources: ImportSource[]
  /** 'welcome' keeps the welcome screen up until the copy finishes. */
  variant: 'welcome' | 'modal'
  onDone?: () => void
  /** 0.9.7: Arc spaces (components/ArcImport.tsx) start all ticked, and the summary speaks of Arc. */
  from?: 'chrome' | 'arc'
  /** 0.9.7: Arc's Favorites row, a stack that goes first in the first space copied. */
  lead?: PlannedStack | null
  /**
   * 0.9.7: the line under an Arc list (arcSummary, passed in by the Arc importer so lib/arcImport.ts
   * loads only with it, outside the new tab's main bundle).
   */
  describe?: (p: ImportCounts) => string
}

/** What a copy would make, for the line under the list. */
export interface ImportCounts {
  spaces: number
  stacks: number
  folders: number
  favorites: number
  firstSpace: string | null
  skipped: number
}

export function ImportPanel({ sources, variant, onDone, from = 'chrome', lead = null, describe }: Props) {
  const refresh = useStackableStore((s) => s.refresh)
  const selectSpace = useStackableStore((s) => s.selectSpace)
  const flashItem = useStackableStore((s) => s.flashItem)
  const showToast = useStackableStore((s) => s.showToast)
  const celebrate = useStackableStore((s) => s.celebrate)
  const setOnboarding = useStackableStore((s) => s.setOnboarding)

  // The bookmarks bar is where people keep what they use; start with just that ticked. Someone moving
  // from Arc is moving all of it: every Arc space starts ticked.
  const [picked, setPicked] = useState<Set<string>>(() => {
    if (from === 'arc') return new Set(sources.map((s) => s.id))
    const bar = sources.find((s) => s.kind === 'bar') ?? sources[0]
    return new Set(bar ? [bar.id] : [])
  })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosen = useMemo(() => sources.filter((s) => picked.has(s.id)), [sources, picked])
  // Arc's Favorites ride with the first space copied, as its first stack.
  const leadOn = !!lead && chosen.length > 0
  const leadLinks = lead && leadOn ? countPlannedStack(lead) : 0
  const links = chosen.reduce((n, s) => n + s.plan.links, 0) + leadLinks
  const stacks = chosen.reduce((n, s) => n + s.plan.space.stacks.length, 0) + (leadOn ? 1 : 0)
  // Folders deeper down stay folders inside their stack (0.8.0).
  const nested = chosen.reduce((n, s) => n + s.plan.space.stacks.reduce((m, st) => m + countPlannedFolders(st.folders).folders, 0), 0)
  const skipped = chosen.reduce((n, s) => n + s.plan.skipped, 0)

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const copy = async () => {
    if (!links || progress) return
    setError(null)
    setProgress({ done: 0, total: links })
    if (variant === 'welcome') setOnboarding(true)
    // 0.9.6: the coach mark below needs to know whether the free tidy is used (storage only).
    loadFreeTidy()
    const created: string[] = []
    try {
      let base = 0
      for (const space of withLeadStack(chosen.map((s) => s.plan.space), leadOn ? lead : null)) {
        const id = await createPlannedSpace(space, (n) =>
          setProgress({ done: base + n, total: links }),
        )
        created.push(id)
        base += countPlanned(space)
      }
      await refresh()
      // 0.9.6: a new space big enough to tidy gets the coach mark on its Tidy button
      // (tidyCoachPlan.ts). Of several, the one with the most links, so that's the one to show.
      const { tree } = useStackableStore.getState()
      const made = created.flatMap((id) => tree?.spaces.find((s) => s.id === id) ?? [])
      const coached = offerTidyCoach(made.map((s) => ({ id: s.id, links: tidyInput(s).links.length })))
      const first = coached ?? created[0]
      selectSpace(first)
      flashItem(first)
      showToast({
        verb: 'Copied',
        title: chosen.length === 1 ? chosen[0].label : plural(chosen.length, from === 'arc' ? 'Arc space' : 'folder'),
        detail: plural(links, 'link'),
        duration: 7000,
        undo: async () => {
          for (const id of created) await deleteSpace(id)
          await refresh()
        },
      })
      celebrate()
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
      if (variant === 'welcome') setOnboarding(false)
    }
  }

  return (
    <div>
      <ul className="flex flex-col gap-1">
        {sources.map((s) => {
          const on = picked.has(s.id)
          return (
            <li key={s.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  on ? 'bg-accent-soft text-strong' : 'text-soft hover:bg-hover'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!!progress}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-base leading-none">{s.plan.space.emoji}</span>
                <span className="flex-1 truncate font-medium">{s.label}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {plural(s.plan.links, 'link')}
                  <span className="text-faint"> in </span>
                  {plural(s.plan.space.stacks.length, 'stack')}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {describe ? (
        <p data-arc-summary className="mt-3 text-xs leading-relaxed text-muted">
          {describe({
            spaces: chosen.length,
            stacks,
            folders: nested,
            favorites: leadLinks,
            firstSpace: chosen[0]?.label ?? null,
            skipped,
          })}
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {links
            ? `${chosen.length === 1 ? 'A new space' : `${chosen.length} new spaces`} with ${plural(stacks, 'stack')}, one per folder${
                nested ? `, and ${plural(nested, 'folder')} inside them` : ''
              }. Your originals stay where they are.`
            : 'Tick a folder to copy it into a space.'}
          {skipped > 0 &&
            ` ${plural(skipped, 'bookmarklet or browser page', 'bookmarklets or browser pages')} ${skipped === 1 ? 'stays' : 'stay'} behind: a new tab can't open ${skipped === 1 ? 'it' : 'them'}.`}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-danger">Copy failed: {error}</p>}

      <div className="mt-4 flex items-center justify-end gap-3">
        {progress ? (
          <div className="flex w-full items-center gap-3" role="status" aria-live="polite">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              Copying {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
            </span>
          </div>
        ) : (
          <button
            onClick={() => void copy()}
            disabled={!links}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-cta transition hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {links ? `Copy ${plural(links, 'link')}` : 'Copy'}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
