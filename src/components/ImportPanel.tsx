import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { listSources, createPlannedSpace, type ImportSource } from '../lib/importChrome'
import { deleteSpace } from '../lib/bookmarks'
import { plural } from '../lib/importPlan'
import { useStackableStore } from '../store/useStackableStore'

/** Chrome's folders with links in them; null while loading. */
export function useImportSources(): ImportSource[] | null {
  const [sources, setSources] = useState<ImportSource[] | null>(null)
  useEffect(() => {
    let live = true
    listSources()
      .then((s) => live && setSources(s))
      .catch(() => live && setSources([]))
    return () => {
      live = false
    }
  }, [])
  return sources
}

interface Props {
  sources: ImportSource[]
  /** 'welcome' keeps the welcome screen up until the copy finishes. */
  variant: 'welcome' | 'modal'
  onDone?: () => void
}

export function ImportPanel({ sources, variant, onDone }: Props) {
  const refresh = useStackableStore((s) => s.refresh)
  const selectSpace = useStackableStore((s) => s.selectSpace)
  const flashItem = useStackableStore((s) => s.flashItem)
  const showToast = useStackableStore((s) => s.showToast)
  const celebrate = useStackableStore((s) => s.celebrate)
  const setOnboarding = useStackableStore((s) => s.setOnboarding)

  // The bookmarks bar is where people keep what they use; start with just that ticked.
  const [picked, setPicked] = useState<Set<string>>(() => {
    const bar = sources.find((s) => s.kind === 'bar') ?? sources[0]
    return new Set(bar ? [bar.id] : [])
  })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosen = useMemo(() => sources.filter((s) => picked.has(s.id)), [sources, picked])
  const links = chosen.reduce((n, s) => n + s.plan.links, 0)
  const stacks = chosen.reduce((n, s) => n + s.plan.space.stacks.length, 0)
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
    const created: string[] = []
    try {
      let base = 0
      for (const source of chosen) {
        const id = await createPlannedSpace(source.plan.space, (n) =>
          setProgress({ done: base + n, total: links }),
        )
        created.push(id)
        base += source.plan.links
      }
      await refresh()
      selectSpace(created[0])
      flashItem(created[0])
      showToast({
        verb: 'Copied',
        title: chosen.length === 1 ? chosen[0].label : plural(chosen.length, 'folder'),
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
                  on ? 'bg-peach-50 text-ink-800' : 'text-ink-600 hover:bg-cream-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!!progress}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 accent-peach-500"
                />
                <span className="text-base leading-none">{s.plan.space.emoji}</span>
                <span className="flex-1 truncate font-medium">{s.label}</span>
                <span className="shrink-0 tabular-nums text-ink-400">
                  {plural(s.plan.links, 'link')}
                  <span className="text-ink-300"> in </span>
                  {plural(s.plan.space.stacks.length, 'stack')}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        {links
          ? `${chosen.length === 1 ? 'A new space' : `${chosen.length} new spaces`} with ${plural(stacks, 'stack')}, one per folder. Your originals stay where they are.`
          : 'Tick a folder to copy it into a space.'}
        {skipped > 0 &&
          ` ${plural(skipped, 'bookmarklet or browser page', 'bookmarklets or browser pages')} ${skipped === 1 ? 'stays' : 'stay'} behind: a new tab can't open ${skipped === 1 ? 'it' : 'them'}.`}
      </p>

      {error && <p className="mt-2 text-xs text-peach-700">Copy failed: {error}</p>}

      <div className="mt-4 flex items-center justify-end gap-3">
        {progress ? (
          <div className="flex w-full items-center gap-3" role="status" aria-live="polite">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-peach-500 transition-[width] duration-150"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-ink-500">
              Copying {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
            </span>
          </div>
        ) : (
          <button
            onClick={() => void copy()}
            disabled={!links}
            className="inline-flex items-center gap-1.5 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgb(201_90_34/0.8)] transition hover:bg-peach-600 disabled:opacity-40 disabled:shadow-none"
          >
            {links ? `Copy ${plural(links, 'link')}` : 'Copy'}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
