import { useState } from 'react'
import { Modal, PrimaryButton, SecondaryButton, TextInput, Label } from './Modal'
import { createBookmark, updateBookmark } from '../../lib/bookmarks'
import { useStackableStore } from '../../store/useStackableStore'

interface Props {
  mode: 'add' | 'edit'
  stackId: string
  bookmarkId?: string
  initialTitle?: string
  initialUrl?: string
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^chrome:\/\//i.test(trimmed)) return trimmed
  if (/^file:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function BookmarkFormModal({
  mode,
  stackId,
  bookmarkId,
  initialTitle = '',
  initialUrl = '',
}: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const refresh = useStackableStore((s) => s.refresh)

  const [title, setTitle] = useState(initialTitle)
  const [url, setUrl] = useState(initialUrl)
  const [submitting, setSubmitting] = useState(false)

  const onUrlBlur = () => {
    if (!title.trim() && url.trim()) {
      setTitle(hostnameOf(normalizeUrl(url)))
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = normalizeUrl(url)
    if (!u) return
    const t = title.trim() || hostnameOf(u)
    setSubmitting(true)
    try {
      if (mode === 'add') {
        await createBookmark(stackId, t, u)
      } else if (bookmarkId) {
        await updateBookmark(bookmarkId, t, u)
      }
      await refresh()
      close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={mode === 'add' ? 'New bookmark' : 'Edit bookmark'}
      onClose={close}
      footer={
        <>
          <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSubmit} disabled={!url.trim() || submitting}>
            {mode === 'add' ? 'Add' : 'Save'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <Label>URL</Label>
          <TextInput
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={onUrlBlur}
            placeholder="https://example.com"
          />
        </div>
        <div>
          <Label>Title</Label>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto from hostname if blank"
          />
        </div>
      </form>
    </Modal>
  )
}
