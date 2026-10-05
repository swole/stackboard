import { useState } from 'react'
import { Modal, DangerButton, SecondaryButton } from './Modal'
import { useStackableStore } from '../../store/useStackableStore'

interface Props {
  targetKind: 'space' | 'stack' | 'bookmark'
  id: string
  name: string
  childCount: number
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function ConfirmDeleteModal({ targetKind, id, name, childCount }: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const tree = useStackableStore((s) => s.tree)
  const removeWithUndo = useStackableStore((s) => s.removeWithUndo)
  const [submitting, setSubmitting] = useState(false)

  const onConfirm = async () => {
    setSubmitting(true)
    let detail: string | undefined
    if (targetKind === 'space') {
      const space = tree?.spaces.find((s) => s.id === id)
      const links = space?.stacks.reduce((n, st) => n + st.bookmarks.length, 0) ?? 0
      detail = `${plural(space?.stacks.length ?? childCount, 'stack')}, ${plural(links, 'link')}`
    } else if (targetKind === 'stack') {
      detail = plural(childCount, 'link')
    }
    // Close first so the undo toast is what's left on screen.
    close()
    await removeWithUndo(targetKind, id, name || 'Untitled', detail)
  }

  const noun =
    targetKind === 'space' ? 'space' : targetKind === 'stack' ? 'stack' : 'bookmark'
  const childLabel = targetKind === 'bookmark' ? null
    : targetKind === 'space'
      ? `Stacks and bookmarks inside will be deleted.`
      : childCount === 0
        ? null
        : `${childCount} bookmark${childCount === 1 ? '' : 's'} inside will be deleted.`

  return (
    <Modal
      title={`Delete ${noun}?`}
      onClose={close}
      footer={
        <>
          <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          <DangerButton onClick={onConfirm} disabled={submitting}>
            Delete
          </DangerButton>
        </>
      }
    >
      <p className="text-sm text-fg">
        Delete <span className="font-semibold">{name || 'Untitled'}</span>?
      </p>
      {childLabel && <p className="mt-2 text-xs text-muted">{childLabel}</p>}
      <p className="mt-2 text-xs text-muted">You can undo this for a few seconds afterwards.</p>
    </Modal>
  )
}
