import { Modal, SecondaryButton } from './Modal'
import { StarterPacks } from '../StarterPacks'
import { useStackableStore } from '../../store/useStackableStore'

/** Settings > Starter packs: add ready-made spaces to an existing board. */
export function PacksModal() {
  const close = useStackableStore((s) => s.closeModal)
  return (
    <Modal title="Starter packs" onClose={close} width="md" footer={<SecondaryButton onClick={close}>Done</SecondaryButton>}>
      <p className="mb-1 text-xs text-ink-500">Each pack adds a space you can edit like any other.</p>
      <StarterPacks variant="list" />
    </Modal>
  )
}
