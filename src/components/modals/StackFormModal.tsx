import { useState } from 'react'
import { Link2, ListChecks } from 'lucide-react'
import { Modal, PrimaryButton, SecondaryButton, TextInput, Label, Segmented } from './Modal'
import { createFolder, createStack, createTodoStack, renameStack } from '../../lib/bookmarks'
import { locate } from '../../lib/folderPlan'
import { useStackableStore } from '../../store/useStackableStore'
import { openCheckout, usePro } from '../../lib/pro'
import { canMakeTodo, keepsTodoFree, offersTodo } from '../../lib/proPlan'

interface Props {
  mode: 'add' | 'edit'
  spaceId?: string
  stackId?: string
  initialTitle?: string
  /** A folder inside a stack (0.8.0): renamed in place, or made inside `parentId` (a stack or folder). */
  folder?: boolean
  parentId?: string
}

export function StackFormModal({ mode, spaceId, stackId, initialTitle = '', folder = false, parentId }: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const refresh = useStackableStore((s) => s.refresh)
  const reportError = useStackableStore((s) => s.reportError)
  const revealStack = useStackableStore((s) => s.revealStack)

  const [title, setTitle] = useState(initialTitle)
  // 0.6.0: a new stack holds links or is a to-do list; an existing one keeps its kind.
  const [picked, setPicked] = useState<'links' | 'todo'>('links')
  const [submitting, setSubmitting] = useState(false)
  // New to-do lists come with Pro (0.7.0), for early users too since 0.8.0 unless they already had
  // a list when 0.8.0 arrived. Lists that exist keep working.
  const proReady = usePro((s) => s.ready)
  const proState = usePro((s) => s.state)
  const keepsTodo = usePro((s) => keepsTodoFree(s))
  const trialUsed = usePro((s) => !!s.trialStartedAt)
  const startTrial = usePro((s) => s.startTrial)
  // School mode: under the company's pro lock To-do list is offered only to someone who can make one.
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro)
  const offerTodo = offersTodo({ lockPro, canMake: !proReady || canMakeTodo(proState, keepsTodo) })
  const kind = offerTodo ? picked : 'links'
  const todoLocked = mode === 'add' && !folder && kind === 'todo' && proReady && !canMakeTodo(proState, keepsTodo)
  const noun = folder ? 'folder' : 'stack'

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || todoLocked) return
    setSubmitting(true)
    try {
      let created: string | null = null
      if (mode === 'add' && folder && parentId) {
        created = await createFolder(parentId, title.trim())
      } else if (mode === 'add' && spaceId) {
        created = kind === 'todo' ? await createTodoStack(spaceId, title.trim()) : await createStack(spaceId, title.trim())
      } else if (mode === 'edit' && stackId) {
        await renameStack(stackId, title.trim())
      }
      await refresh()
      close()
      // A new list scrolls into view and its input takes focus, ready for the first item.
      if (created && spaceId && kind === 'todo') revealStack(spaceId, created)
      // A new folder opens where it landed (its parent too, if that was folded) and glows.
      const made = created && folder ? locate(useStackableStore.getState().tree, created) : null
      if (made) {
        useStackableStore.getState().unfoldFolders(made.path.map((f) => f.id))
        useStackableStore.getState().flashItem(made.container.id)
      }
    } catch (err) {
      reportError(mode === 'add' ? `create the ${noun}` : `rename the ${noun}`, err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={mode === 'add' ? `New ${noun}` : `Rename ${noun}`}
      onClose={close}
      footer={
        <>
          <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSubmit} disabled={!title.trim() || submitting || todoLocked}>
            {mode === 'add' ? 'Create' : 'Save'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        {mode === 'add' && !folder && offerTodo && (
          <div className="mb-3">
            <Segmented
              label="Stack type"
              value={kind}
              onChange={setPicked}
              options={[
                { value: 'links', label: 'Links', icon: <Link2 className="h-3.5 w-3.5" /> },
                { value: 'todo', label: 'To-do list', icon: <ListChecks className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>
        )}
        <Label>{folder ? 'Folder name' : kind === 'todo' ? 'List name' : 'Stack name'}</Label>
        <TextInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={folder ? 'e.g. Clients' : kind === 'todo' ? 'e.g. This week' : 'e.g. Control Tower'}
        />
        {todoLocked && (
          <div className="mt-2 rounded-md border border-line bg-sunken px-3 py-2 text-xs text-muted" data-todo-pro>
            {trialUsed
              ? 'To-do lists come with Stackboard Pro.'
              : 'To-do lists come with Stackboard Pro. Try it free for 14 days, no card needed.'}
            <div className="mt-2 flex gap-2">
              {!trialUsed && (
                <PrimaryButton type="button" onClick={() => void startTrial()}>
                  Start free trial
                </PrimaryButton>
              )}
              <SecondaryButton type="button" onClick={() => openCheckout('todo')}>
                Get Pro
              </SecondaryButton>
            </div>
          </div>
        )}
        {kind === 'todo' && !todoLocked && (
          <p className="mt-2 text-xs text-muted">
            To-dos sync through Chrome with your extension settings. They aren't bookmarks, so
            removing Stackboard deletes them.
          </p>
        )}
      </form>
    </Modal>
  )
}
