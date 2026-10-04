import { useState } from 'react'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'
import { Check, Download, FolderInput, Link2, Package, Star, Upload } from 'lucide-react'
import { exportBackup, importBackup } from '../../lib/bookmarks'
import { downloadJson, openInNewTab, pickJsonFile } from '../../lib/tabs'
import { REVIEWS_URL, SHARE_URL } from '../../lib/onboarding'
import { prefs } from '../../lib/prefs'
import type { BookmarkBackup } from '../../lib/types'
import { useStackableStore } from '../../store/useStackableStore'

export function SettingsModal() {
  const close = useStackableStore((s) => s.closeModal)
  const openModal = useStackableStore((s) => s.openModal)
  const refresh = useStackableStore((s) => s.refresh)
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
      width="md"
      footer={<SecondaryButton onClick={close}>Close</SecondaryButton>}
    >
      <div className="flex flex-col gap-4">
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Add to your board
          </h3>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => openModal({ kind: 'import' })}>
              <span className="inline-flex items-center gap-1.5">
                <FolderInput className="h-3.5 w-3.5" />
                Copy from Chrome bookmarks
              </span>
            </SecondaryButton>
            <SecondaryButton onClick={() => openModal({ kind: 'packs' })}>
              <span className="inline-flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Starter packs
              </span>
            </SecondaryButton>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Backup
          </h3>
          <p className="mb-2 text-xs text-ink-500">
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

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Like Stackboard?
          </h3>
          <p className="mb-2 text-xs text-ink-500">
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
                {linkCopied ? <Check className="h-3.5 w-3.5 text-peach-600" /> : <Link2 className="h-3.5 w-3.5" />}
                {linkCopied ? 'Link copied' : 'Copy link to share'}
              </span>
            </SecondaryButton>
          </div>
        </section>

        <section className="rounded-md border border-ink-100 bg-cream-50 px-3 py-2 text-xs text-ink-500">
          <div className="font-medium text-ink-700">Tip</div>
          You can also edit / inspect everything at <code>chrome://bookmarks</code>. Changes there appear in Stackboard on the next new tab.
        </section>

        {status && <div className="text-xs text-peach-700">{status}</div>}
      </div>
    </Modal>
  )
}
