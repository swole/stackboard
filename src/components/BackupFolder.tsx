import { useEffect, useState, type ButtonHTMLAttributes } from 'react'
import { FolderOpen } from 'lucide-react'
import {
  allowFolder,
  backupToday,
  chooseFolder,
  folderPermission,
  folderSupported,
  forgetFolder,
  getFolder,
  readLast,
  type BackupDir,
} from '../lib/backupFolder'
import { lastBackupText } from '../lib/backupPlan'
import { dayKey } from '../lib/snapshotPlan'
import { useStackableStore } from '../store/useStackableStore'

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'none' }
  | { kind: 'set'; dir: BackupDir; allowed: boolean; last: { day: string } | null }

/**
 * Settings > daily snapshots > Back up to a folder (Pro, 0.9.0): each day's snapshot also goes to a
 * folder the person picks, such as their Google Drive, OneDrive or Dropbox folder. The file goes
 * straight from the browser to that folder. When Chrome wants an OK again, this shows a button for it,
 * never a pop-up.
 */
export function BackupFolder() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!folderSupported()) return setState({ kind: 'unsupported' })
    const dir = await getFolder()
    if (!dir) return setState({ kind: 'none' })
    const [perm, last] = await Promise.all([folderPermission(dir), readLast()])
    setState({ kind: 'set', dir, allowed: perm === 'granted', last })
  }

  useEffect(() => {
    void load().catch(() => setState({ kind: 'none' }))
  }, [])

  const act = async (what: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      useStackableStore.getState().reportError(what, err)
    }
    await load().catch(() => {})
    setBusy(false)
  }

  const now = (dir: BackupDir) =>
    act('back up your board', async () => {
      const done = await backupToday({ force: true })
      if (done === 'written') useStackableStore.getState().showToast({ verb: 'Backed up to', title: dir.name, duration: 2500 })
      else if (done === 'empty') useStackableStore.getState().showToast({ verb: 'Nothing to back up:', title: 'the board is empty', duration: 2500 })
    })
  const choose = () =>
    act('choose a backup folder', async () => {
      const dir = await chooseFolder()
      if (dir) await backupToday({ force: true })
    })
  const allow = (dir: BackupDir) =>
    act('allow backups', async () => {
      if (await allowFolder(dir)) await backupToday()
    })
  const stop = () => act('stop backups', forgetFolder)

  if (state.kind === 'loading') return null

  return (
    <div data-backup-folder className="mt-3 rounded-md border border-line bg-card px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg">
        <FolderOpen className="h-3.5 w-3.5 text-accent-text" />
        Back up to a folder
      </div>

      {state.kind === 'unsupported' && (
        <p className="text-xs leading-relaxed text-muted">This browser can't save files to a folder on your computer, so snapshots stay inside Stackboard.</p>
      )}

      {state.kind === 'none' && (
        <>
          <p className="mb-2 text-xs leading-relaxed text-muted">
            Pick a folder your cloud drive syncs, like Google Drive, OneDrive or Dropbox. Each day's snapshot is saved there too, as a file
            you can import on any computer.
          </p>
          <Small onClick={() => void choose()} disabled={busy} data-backup-choose>
            Choose a folder
          </Small>
        </>
      )}

      {state.kind === 'set' && (
        <>
          <p className="mb-2 text-xs leading-relaxed text-muted">
            {state.allowed ? (
              <>
                Saving each day's snapshot to <span data-backup-name className="font-medium text-fg">{state.dir.name}</span>.{' '}
                <span data-backup-last>{lastBackupText(state.last, dayKey())}.</span>
              </>
            ) : (
              <>
                Chrome needs your OK to keep saving to <span data-backup-name className="font-medium text-fg">{state.dir.name}</span>. If it
                offers Allow on every visit, pick that and it won't ask again.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.allowed ? (
              <Small onClick={() => void now(state.dir)} disabled={busy} data-backup-now>
                Back up now
              </Small>
            ) : (
              <Small onClick={() => void allow(state.dir)} disabled={busy} data-backup-allow>
                Allow backups to {state.dir.name}
              </Small>
            )}
            <Small onClick={() => void choose()} disabled={busy}>
              Change folder
            </Small>
            <Small onClick={() => void stop()} disabled={busy} data-backup-stop>
              Stop
            </Small>
          </div>
        </>
      )}
    </div>
  )
}

function Small({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
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
