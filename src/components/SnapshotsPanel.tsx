import { useEffect, useState, type ButtonHTMLAttributes } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { IS_EXTENSION } from '../lib/bookmarks'
import { DEMO_TREE } from '../lib/demoTree'
import { plural } from '../lib/importPlan'
import { listSnapshots, restoreAll, restoreSpace } from '../lib/snapshots'
import {
  SNAPSHOT_DAYS,
  countBackup,
  countSpace,
  countsText,
  dayKey,
  restoredName,
  shortDay,
  summaryLine,
  type Snapshot,
} from '../lib/snapshotPlan'
import { downloadJson } from '../lib/tabs'
import { backupStack } from '../lib/folderPlan'
import type { BookmarkBackup } from '../lib/types'
import { useStackableStore } from '../store/useStackableStore'

// Settings > Stackboard Pro > Daily snapshots (0.7.0). A restore only adds: the space comes back
// as a dated copy at the end of the board, and the snapshot stays for the next restore.

/** Two made-up days for the vite preview, built from the demo board. */
function demoSnapshots(): Snapshot[] {
  const backup: BookmarkBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: DEMO_TREE.spaces.map((s) => ({
      emoji: s.emoji,
      name: s.name,
      stacks: s.stacks.map((st) => ({ ...backupStack(st), ...(st.todo ? { todo: [] } : {}) })),
    })),
  }
  const now = Date.now()
  return [0, 1].map((ago) => {
    const at = now - ago * 86_400_000
    return { day: dayKey(new Date(at)), at, counts: countBackup(backup), backup }
  })
}

/**
 * `canTake` is false while Pro is off: no new snapshots are taken, but the ones already on this
 * computer can still be restored and downloaded, and the panel hides itself when there are none.
 */
export function SnapshotsPanel({ canTake = true }: { canTake?: boolean }) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Teams T8: a company that switched off import and export also gets no snapshot downloads.
  const noExport = useStackableStore((s) => !!s.tree?.company?.lock.importExport)
  const today = dayKey()

  useEffect(() => {
    let live = true
    const load = IS_EXTENSION ? listSnapshots() : Promise.resolve(demoSnapshots())
    load.then(
      (s) => live && setSnaps(s),
      () => live && setSnaps([]),
    )
    return () => {
      live = false
    }
  }, [])

  const restore = async (snap: Snapshot, which: number | 'all') => {
    if (busy) return
    const store = useStackableStore.getState()
    const title = which === 'all' ? plural(snap.backup.spaces.length, 'space') : restoredName(snap.backup.spaces[which].name, snap.day)
    const detail = which === 'all' ? `from ${shortDay(snap.day)}` : undefined
    if (!IS_EXTENSION) {
      store.showToast({ verb: 'Restored', title, detail, duration: 2200 })
      return
    }
    setBusy(true)
    let ids: string[] = []
    try {
      ids = which === 'all' ? await restoreAll(snap) : [await restoreSpace(snap, which)]
    } catch (err) {
      store.reportError(`restore ${title}`, err)
    }
    // Refresh either way, so a restore that stopped halfway still shows what it added.
    await store.refresh()
    setBusy(false)
    if (!ids.length) return
    store.selectSpace(ids[0])
    store.flashItem(ids[0])
    store.showToast({ verb: 'Restored', title, detail, duration: 4000 })
  }

  if (!canTake && (!snaps || snaps.length === 0)) return null

  return (
    <div data-snapshots className="mt-4">
      <h4 className="mb-1 text-xs font-medium text-fg">Daily snapshots</h4>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        {canTake
          ? `A copy of your board every day, kept for ${SNAPSHOT_DAYS} days on this computer. Restoring adds a dated copy, so nothing on your board now changes.`
          : 'New snapshots are paused with Pro. The ones below stay on this computer, and restoring still works.'}
      </p>

      {snaps && snaps.length === 0 && (
        <p data-snapshots-empty className="text-xs text-muted">
          Your first snapshot is taken the next time you open a new tab.
        </p>
      )}

      {snaps && snaps.length > 0 && (
        <ul className="grid max-h-72 gap-1 overflow-y-auto" data-snapshot-list>
          {snaps.map((s) => {
            const expanded = open === s.day
            return (
              <li key={s.day} data-snapshot={s.day} className="rounded-md border border-line bg-card">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : s.day)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  <span className="min-w-0 flex-1 truncate">{summaryLine(s)}</span>
                  {s.day === today && <span className="shrink-0 text-[11px] text-muted">Today</span>}
                </button>

                {expanded && (
                  <div className="border-t border-line px-2.5 py-2">
                    <ul className="grid gap-1.5">
                      {s.backup.spaces.map((sp, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs" data-snapshot-space={i}>
                          <span className="min-w-0 flex-1 truncate text-fg">
                            {sp.emoji} {sp.name}
                          </span>
                          <span className="shrink-0 text-muted">{countsText(countSpace(sp))}</span>
                          <SmallButton onClick={() => void restore(s, i)} disabled={busy} data-restore-space>
                            Restore
                          </SmallButton>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <SmallButton onClick={() => void restore(s, 'all')} disabled={busy} data-restore-all>
                        Restore all
                      </SmallButton>
                      {!noExport && (
                      <SmallButton onClick={() => downloadJson(`stackboard-snapshot-${s.day}.json`, s.backup)} data-snapshot-download>
                        <span className="inline-flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          Download
                        </span>
                      </SmallButton>
                      )}
                      {busy && <span className="text-xs text-muted">Restoring…</span>}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SmallButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="shrink-0 rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50"
    >
      {children}
    </button>
  )
}
