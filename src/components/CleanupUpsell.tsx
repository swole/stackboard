import { openCheckout, usePro } from '../lib/pro'
import { useStackableStore } from '../store/useStackableStore'
import { PrimaryButton, SecondaryButton } from './modals/Modal'

// Free scan, paid fix (0.9.0): without Pro, clean-up still finds the duplicates and the links nobody
// opens, all on this computer; removing them and checking for dead links stay Pro. School mode: the
// scan stays, with no word about Pro while the company's pro lock is on.

/** Settings > Stackboard Pro, without Pro or the trial: the way into the free scan. */
export function CleanupScanEntry() {
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro)
  return (
    <div data-cleanup-scan-entry className="mt-4">
      <div className="mb-1 text-xs font-medium text-fg">Clean up</div>
      <p className="mb-2 text-xs text-muted">
        {lockPro
          ? 'See which links you saved twice or never open.'
          : 'See which links you saved twice or never open. The scan is free, and removing them in one click comes with Pro.'}
      </p>
      <SecondaryButton onClick={() => useStackableStore.getState().openModal({ kind: 'cleanup' })} data-cleanup-scan>
        Scan your board
      </SecondaryButton>
    </div>
  )
}

/** The clean-up dialog's footer without Pro: the trial while it's unused, then Get Pro. School mode: Close only. */
export function CleanupProFooter({ onClose }: { onClose: () => void }) {
  const trialUsed = usePro((s) => !!s.trialStartedAt)
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro)
  const buy = () => openCheckout('cleanup')
  if (lockPro) return <SecondaryButton onClick={onClose}>Close</SecondaryButton>
  return (
    <>
      <span data-cleanup-free className="mr-auto text-xs text-muted">
        {trialUsed ? 'Removing links in one click comes with Pro.' : 'Removing links in one click comes with Pro. Try it free for 14 days.'}
      </span>
      <SecondaryButton onClick={onClose}>Close</SecondaryButton>
      {trialUsed ? (
        <PrimaryButton onClick={buy} data-cleanup-get-pro>
          Get Pro
        </PrimaryButton>
      ) : (
        <PrimaryButton onClick={() => void usePro.getState().startTrial()} data-cleanup-trial>
          Start free trial
        </PrimaryButton>
      )}
    </>
  )
}
