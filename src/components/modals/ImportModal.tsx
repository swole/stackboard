import { useState } from 'react'
import { Modal, SecondaryButton } from './Modal'
import { ImportPanel, useImportSources } from '../ImportPanel'
import { LazyArcImport as ArcImport } from '../ArcImportLazy'
import { ImportFromSwitch, type ImportFrom } from '../Welcome'
import { useStackableStore } from '../../store/useStackableStore'

/**
 * Settings > Copy from Chrome bookmarks: the welcome screen's importer for a board that has content.
 * 0.9.7: Arc's spaces too, from Arc's sidebar file or its export (Settings > Copy from Arc opens here).
 */
export function ImportModal({ from: initial = 'chrome' }: { from?: ImportFrom }) {
  const close = useStackableStore((s) => s.closeModal)
  const sources = useImportSources()
  const [from, setFrom] = useState<ImportFrom>(initial)
  return (
    <Modal title="Bring in your bookmarks" onClose={close} width="md" footer={<SecondaryButton onClick={close}>Close</SecondaryButton>}>
      <div className="mb-3">
        <ImportFromSwitch value={from} onChange={setFrom} />
      </div>
      {from === 'arc' ? (
        <ArcImport variant="modal" onDone={close} />
      ) : sources === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-sunken" />
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted">Chrome has no other bookmarks to copy.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            Each folder you tick becomes a new space. Copying twice makes a second copy.
          </p>
          <ImportPanel sources={sources} variant="modal" onDone={close} />
        </>
      )}
    </Modal>
  )
}
