import { useState, lazy, Suspense } from 'react'
import type { EmojiStyle, Theme } from 'emoji-picker-react'
import { Modal, PrimaryButton, SecondaryButton, TextInput, Label } from './Modal'
import { createSpace, renameSpace } from '../../lib/bookmarks'
import { useStackableStore } from '../../store/useStackableStore'
import { DEFAULT_EMOJI } from '../../lib/icon'
import { useAppearance } from '../../store/useAppearance'
import { StarterPacks } from '../StarterPacks'

const EmojiPicker = lazy(() => import('emoji-picker-react'))
// The system's own emoji (0.9.7), so opening the picker fetches nothing: the default Apple set loads
// its images from cdn.jsdelivr.net.
const PICKER_STYLE = { emojiStyle: 'native' as EmojiStyle }

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
  const reportError = useStackableStore((s) => s.reportError)
  // 0.9.7 (U5): a new space can start from a starter pack, unless the company switched packs off (Teams T8).
  const packsLocked = useStackableStore((s) => !!s.tree?.company?.lock.starterPacks)
  // The picker's own light/dark set picks its category icons; index.css maps its colours.
  const scheme = useAppearance((s) => s.scheme)

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
    } catch (err) {
      reportError(mode === 'add' ? 'create the space' : 'save the space', err)
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
            className="flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-card text-xl hover:bg-hover"
          >
            {emoji}
          </button>
          {showPicker && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-xs text-muted">Loading…</div>}>
                <EmojiPicker
                  onEmojiClick={(d) => {
                    setEmoji(d.emoji)
                    setShowPicker(false)
                  }}
                  width="100%"
                  height={320}
                  theme={scheme as Theme}
                  {...PICKER_STYLE}
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
      {/* Outside the form, so a pack chip can never submit it. A pack is a whole space with its
          stacks; adding one opens it and closes this dialog. */}
      {mode === 'add' && !packsLocked && (
        <div data-new-space-packs className="mt-4 border-t border-line pt-3">
          <div className="mb-2 text-xs font-medium text-soft">Or start from a pack</div>
          <StarterPacks variant="dialog" onAdded={close} />
        </div>
      )}
    </Modal>
  )
}
