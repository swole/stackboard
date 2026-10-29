import { useState } from 'react'
import { Link2, ListChecks } from 'lucide-react'
import { Modal, PrimaryButton, SecondaryButton, TextInput, Label, Segmented } from './Modal'
import { createStack, createTodoStack, renameStack } from '../../lib/bookmarks'
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
  const reportError = useStackableStore((s) => s.reportError)
  const revealStack = useStackableStore((s) => s.revealStack)

  const [title, setTitle] = useState(initialTitle)
  // 0.6.0: a new stack holds links or is a to-do list; an existing one keeps its kind.
  const [kind, setKind] = useState<'links' | 'todo'>('links')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      let created: string | null = null
      if (mode === 'add' && spaceId) {
        created = kind === 'todo' ? await createTodoStack(spaceId, title.trim()) : await createStack(spaceId, title.trim())
      } else if (mode === 'edit' && stackId) {
        await renameStack(stackId, title.trim())
      }
      await refresh()
      close()
      // A new list scrolls into view and its input takes focus, ready for the first item.
      if (created && spaceId && kind === 'todo') revealStack(spaceId, created)
    } catch (err) {
      reportError(mode === 'add' ? 'create the stack' : 'rename the stack', err)
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
        {mode === 'add' && (
          <div className="mb-3">
            <Segmented
              label="Stack type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'links', label: 'Links', icon: <Link2 className="h-3.5 w-3.5" /> },
                { value: 'todo', label: 'To-do list', icon: <ListChecks className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>
        )}
        <Label>{kind === 'todo' ? 'List name' : 'Stack name'}</Label>
        <TextInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'todo' ? 'e.g. This week' : 'e.g. Control Tower'}
        />
        {kind === 'todo' && (
          <p className="mt-2 text-xs text-muted">
            To-dos sync through Chrome with your extension settings. They aren't bookmarks, so
            removing Stackboard deletes them.
          </p>
        )}
      </form>
    </Modal>
  )
}
