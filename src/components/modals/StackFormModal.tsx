import { useState } from 'react'
import { Modal, PrimaryButton, SecondaryButton, TextInput, Label } from './Modal'
import { createStack, renameStack } from '../../lib/bookmarks'
import { useStackableStore } from '../../store/useStackableStore'

interface Props {
  mode: 'add' | 'edit'
  spaceId?: string
  stackId?: string
  initialTitle?: string
}

export function StackFormModal({ mode, spaceId, stackId, initialTitle = '' }: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const refresh = useStackableStore((s) => s.refresh)

  const [title, setTitle] = useState(initialTitle)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      if (mode === 'add' && spaceId) {
        await createStack(spaceId, title.trim())
      } else if (mode === 'edit' && stackId) {
        await renameStack(stackId, title.trim())
      }
      await refresh()
      close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={mode === 'add' ? 'New stack' : 'Rename stack'}
      onClose={close}
      footer={
        <>
          <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSubmit} disabled={!title.trim() || submitting}>
            {mode === 'add' ? 'Create' : 'Save'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <Label>Stack name</Label>
        <TextInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Control Tower"
        />
      </form>
    </Modal>
  )
}
