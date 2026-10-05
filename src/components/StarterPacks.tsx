import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { STARTER_PACKS, type StarterPack } from '../lib/starterPacks'
import { createPlannedSpace } from '../lib/importChrome'
import { countPlanned, plural } from '../lib/importPlan'
import { useStackableStore } from '../store/useStackableStore'

interface Props {
  /** 'chips' on the welcome screen (adding one opens it); 'list' in Settings (add several). */
  variant: 'chips' | 'list'
}

export function StarterPacks({ variant }: Props) {
  const refresh = useStackableStore((s) => s.refresh)
  const selectSpace = useStackableStore((s) => s.selectSpace)
  const flashItem = useStackableStore((s) => s.flashItem)
  const setOnboarding = useStackableStore((s) => s.setOnboarding)
  const celebrate = useStackableStore((s) => s.celebrate)
  const [busy, setBusy] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  const add = async (pack: StarterPack) => {
    if (busy) return
    setBusy(pack.id)
    if (variant === 'chips') setOnboarding(true)
    try {
      const id = await createPlannedSpace(pack)
      await refresh()
      selectSpace(id)
      flashItem(id)
      setAdded((prev) => new Set(prev).add(pack.id))
      celebrate()
    } finally {
      setBusy(null)
      if (variant === 'chips') setOnboarding(false)
    }
  }

  if (variant === 'chips') {
    return (
      <div className="flex flex-wrap gap-2">
        {STARTER_PACKS.map((p) => (
          <button
            key={p.id}
            onClick={() => void add(p)}
            disabled={!!busy}
            title={`${p.blurb} (${plural(countPlanned(p), 'link')})`}
            className="group/pack inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm text-fg shadow-xs transition hover:-translate-y-px hover:border-accent-line hover:text-strong hover:shadow-chip disabled:opacity-60"
          >
            <span className="text-base leading-none">{p.emoji}</span>
            {p.name}
            <Plus className="h-3.5 w-3.5 text-ghost transition-colors group-hover/pack:text-accent" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {STARTER_PACKS.map((p) => {
        const done = added.has(p.id)
        return (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <span className="text-xl leading-none">{p.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-strong">{p.name}</div>
              <div className="truncate text-xs text-muted">
                {p.blurb}, {plural(countPlanned(p), 'link')}
              </div>
            </div>
            <button
              onClick={() => void add(p)}
              disabled={!!busy || done}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-fg hover:border-accent-line hover:bg-accent-soft disabled:opacity-60"
            >
              {done ? (
                <>
                  <Check className="h-3.5 w-3.5 text-accent-text" /> Added
                </>
              ) : busy === p.id ? (
                'Adding'
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Add
                </>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
