import { useState, lazy, Suspense } from 'react'
import { Modal, PrimaryButton, SecondaryButton, TextInput, Label } from './Modal'
import { createSpace, renameSpace } from '../../lib/bookmarks'
import { useStackableStore } from '../../store/useStackableStore'
import { DEFAULT_EMOJI } from '../../lib/icon'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

interface Props {
  mode: 'add' | 'edit'
  initialName?: string
  initialEmoji?: string
  spaceId?: string
  focusField?: 'emoji' | 'name'
}

export function SpaceFormModal({ mode, initialName = '', initialEmoji = DEFAULT_EMOJI, spaceId, focusField }: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const refresh = useStackableStore((s) => s.refresh)
  const selectSpace = useStackableStore((s) => s.selectSpace)

  const [name, setName] = useState(initialName)
  const [emoji, setEmoji] = useState(initialEmoji || DEFAULT_EMOJI)
  const [showPicker, setShowPicker] = useState(focusField === 'emoji')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      if (mode === 'add') {
        const id = await createSpace(name.trim(), emoji)
        await refresh()
        selectSpace(id)
      } else if (spaceId) {
        await renameSpace(spaceId, name.trim(), emoji)
        await refresh()
      }
      close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={mode === 'add' ? 'New space' : 'Edit space'}
      onClose={close}
      footer={
        <>
          <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSubmit} disabled={!name.trim() || submitting}>
            {mode === 'add' ? 'Create' : 'Save'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <Label>Icon</Label>
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-ink-200 bg-white text-xl hover:bg-cream-50"
          >
            {emoji}
          </button>
          {showPicker && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-xs text-ink-400">Loading…</div>}>
                <EmojiPicker
                  onEmojiClick={(d) => {
                    setEmoji(d.emoji)
                    setShowPicker(false)
                  }}
                  width="100%"
                  height={320}
                />
              </Suspense>
            </div>
          )}
        </div>
        <div>
          <Label>Name</Label>
          <TextInput
            autoFocus={focusField !== 'emoji'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Side projects"
          />
        </div>
      </form>
    </Modal>
  )
}
