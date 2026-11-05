import { useEffect, useState, type ReactNode } from 'react'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'
import { Check, Download, FolderInput, LifeBuoy, Link2, Package, Star, Upload } from 'lucide-react'
import { IS_EXTENSION, exportBackup, importBackup } from '../../lib/bookmarks'
import { downloadJson, openInNewTab, pickJsonFile } from '../../lib/tabs'
import { REVIEWS_URL, SHARE_URL, helpUrl } from '../../lib/onboarding'
import { prefs } from '../../lib/prefs'
import { usePro } from '../../lib/pro'
import { hasPro } from '../../lib/proPlan'
import type { BookmarkBackup } from '../../lib/types'
import { useStackableStore } from '../../store/useStackableStore'
import { AppearanceSettings, LayoutSetting } from '../AppearanceSettings'
import { CleanupScanEntry } from '../CleanupUpsell'
import { ProSection } from '../ProSection'
import { SnapshotsPanel } from '../SnapshotsPanel'

export function SettingsModal() {
  const close = useStackableStore((s) => s.closeModal)
  const openModal = useStackableStore((s) => s.openModal)
  const refresh = useStackableStore((s) => s.refresh)
  // Teams T8: settings the company's policy has switched off.
  const lock = useStackableStore((s) => s.tree?.company?.lock)
  // School mode: a paid key already active on this computer keeps its Pro card under the pro lock.
  const paidHere = usePro((s) => s.state.kind === 'pro' && !!s.license?.activationId)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1600)
    } catch {
      setStatus(SHARE_URL)
    }
  }

  const rate = () => {
    prefs.setRating('rated')
    void openInNewTab(REVIEWS_URL, true)
  }

  const onExport = async () => {
    setBusy(true)
    try {
      const backup = await exportBackup()
      downloadJson(`stackboard-backup-${new Date().toISOString().slice(0, 10)}.json`, backup)
      setStatus('Backup downloaded.')
    } finally {
      setBusy(false)
    }
  }

  const onImport = async () => {
    setBusy(true)
    try {
      const parsed = (await pickJsonFile()) as BookmarkBackup
      if (!parsed || parsed.version !== 1) {
        setStatus('Unsupported file (expected backup v1).')
        return
      }
      await importBackup(parsed)
      await refresh()
      const spaceCount = parsed.spaces.length
      setStatus(`Imported ${spaceCount} space${spaceCount === 1 ? '' : 's'}.`)
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Settings"
      onClose={close}
      width="lg"
      scrim="light"
      footer={<SecondaryButton onClick={close}>Close</SecondaryButton>}
    >
      <div className="flex flex-col gap-5">
        {lock?.appearance ? (
          <section data-managed-setting="Appearance">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</h3>
            <p className="mb-2.5 text-xs text-muted">Your company manages the look of your board. The layout is still yours.</p>
            <LayoutSetting />
          </section>
        ) : (
          <AppearanceSettings />
        )}

        {lock?.pro && !paidHere ? (
          <Managed title="Stackboard Pro">
            {/* What stays free sits here too: the clean-up scan, and snapshots taken before. */}
            <CleanupScanEntry />
            <SnapshotsPanel canTake={false} />
          </Managed>
        ) : (
          <ProSection />
        )}

        {lock?.importExport && lock.starterPacks ? (
          <Managed title="Add to your board" />
        ) : (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Add to your board
          </h3>
          <div className="flex flex-wrap gap-2">
            {!lock?.importExport && (
            <SecondaryButton onClick={() => openModal({ kind: 'import' })}>
              <span className="inline-flex items-center gap-1.5">
                <FolderInput className="h-3.5 w-3.5" />
                Copy from Chrome bookmarks
              </span>
            </SecondaryButton>
            )}
            {!lock?.starterPacks && (
            <SecondaryButton onClick={() => openModal({ kind: 'packs' })}>
              <span className="inline-flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Starter packs
              </span>
            </SecondaryButton>
            )}
          </div>
          {(lock?.importExport || lock?.starterPacks) && <p className="mt-1.5 text-xs text-muted">Your company manages the rest of this setting.</p>}
        </section>
        )}

        {lock?.importExport ? (
          <Managed title="Backup" />
        ) : (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Backup
          </h3>
          <p className="mb-2 text-xs text-muted">
            Stackboard stores everything in Chrome bookmarks under <code>Other bookmarks → Stackboard</code>.
            Use export/import for a portable JSON snapshot.
          </p>
          <div className="flex gap-2">
            <PrimaryButton onClick={onExport} disabled={busy}>
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </span>
            </PrimaryButton>
            <SecondaryButton onClick={onImport} disabled={busy}>
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Import JSON
              </span>
            </SecondaryButton>
          </div>
        </section>
        )}

        <KeysSection />

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Like Stackboard?
          </h3>
          <p className="mb-2 text-xs text-muted">
            It's free, with no ads and no account. A rating or a share is how other people find it.
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={rate}>
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5" />
                Rate it
              </span>
            </SecondaryButton>
            <SecondaryButton onClick={() => void copyLink()}>
              <span className="inline-flex items-center gap-1.5">
                {linkCopied ? <Check className="h-3.5 w-3.5 text-accent-text" /> : <Link2 className="h-3.5 w-3.5" />}
                {linkCopied ? 'Link copied' : 'Copy link to share'}
              </span>
            </SecondaryButton>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Help</h3>
          <p className="mb-2 text-xs text-muted">
            Found a bug, or stuck on something? The help page has quick answers, and its email button fills in your version.
          </p>
          <SecondaryButton
            data-help-link
            onClick={() => void openInNewTab(helpUrl(IS_EXTENSION ? chrome.runtime.getManifest().version : undefined), true)}
          >
            <span className="inline-flex items-center gap-1.5">
              <LifeBuoy className="h-3.5 w-3.5" />
              Help and bug reports
            </span>
          </SecondaryButton>
        </section>

        <section className="rounded-md border border-line bg-sunken px-3 py-2 text-xs text-muted">
          <div className="font-medium text-fg">Tip</div>
          You can also edit / inspect everything at <code>chrome://bookmarks</code>. Changes there appear in Stackboard on the next new tab.
        </section>

        {status && <div className="text-xs text-accent-text">{status}</div>}
      </div>
    </Modal>
  )
}

/** A section the company's Chrome policy has taken over (Teams T8, 0.8.0); `children` is what stays the person's own. */
function Managed({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section data-managed-setting={title}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <p className="text-xs text-muted">Your company manages this setting.</p>
      {children}
    </section>
  )
}

/** The board's keyboard shortcuts, plus the stash shortcut as Chrome has it set. */
function KeysSection() {
  const [stash, setStash] = useState('')
  // School mode: under the pro lock the command bar row shows only while Pro is on, without "(Pro)".
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro)
  const proOn = usePro((s) => s.ready && hasPro(s.state))
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.commands) return
    void chrome.commands
      .getAll()
      .then((all) => setStash(all.find((c) => c.name === 'stash-window')?.shortcut ?? ''))
      .catch(() => {})
  }, [])

  const rows: Array<[string, string]> = [
    ['/', 'Search every space'],
    ['1-9', 'Jump to a space, in sidebar order'],
    ['Esc', 'Clear the search'],
  ]
  // 0.9.0: the command bar is Pro; without Pro the same keys go to the search box.
  const barKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K'
  if (!lockPro) rows.push([barKey, 'Command bar: find a link, stack or space, or run an action (Pro)'])
  else if (proOn) rows.push([barKey, 'Command bar: find a link, stack or space, or run an action'])
  if (stash) rows.push([stash, 'Stash this window, from any tab'])
  // Teams T6 (free for everyone): the omnibox keyword in manifest.config.ts.
  rows.push(['go', "Go links: type go and a space in the address bar, then a link's name"])

  return (
    <section data-keys>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Keys</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([key, what]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="inline-block min-w-6 rounded border border-line bg-card px-1.5 text-center font-sans text-[11px] leading-5 text-fg">
                {key}
              </kbd>
            </dt>
            <dd className="text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
