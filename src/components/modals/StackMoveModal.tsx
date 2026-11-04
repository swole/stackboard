import { useState } from 'react'
import { Modal, SecondaryButton } from './Modal'
import { moveStack } from '../../lib/bookmarks'
import { useStackableStore } from '../../store/useStackableStore'

interface Props {
  stackId: string
  title: string
  currentSpaceId: string
}

export function StackMoveModal({ stackId, title, currentSpaceId }: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const refresh = useStackableStore((s) => s.refresh)
  const reportError = useStackableStore((s) => s.reportError)
  const tree = useStackableStore((s) => s.tree)
  const [movingTo, setMovingTo] = useState<string | null>(null)

  // Company spaces (Teams, 0.8.0) are read-only, so nothing moves into them.
  const targets = (tree?.spaces ?? []).filter((s) => s.id !== currentSpaceId && !s.company)

  const onMove = async (spaceId: string) => {
    setMovingTo(spaceId)
    try {
      // Last in the destination space (no index: loose links in its folder can't shift it).
      await moveStack(stackId, spaceId)
      await refresh()
      close()
    } catch (err) {
      reportError('move the stack', err)
    } finally {
      setMovingTo(null)
    }
  }

  return (
    <Modal
      title={`Move “${title}” to…`}
      onClose={close}
      footer={<SecondaryButton onClick={close}>Cancel</SecondaryButton>}
    >
      {targets.length === 0 ? (
        <p className="text-sm text-muted">
          There’s nowhere to move this stack — create another space first.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {targets.map((s) => (
            <button
              key={s.id}
              onClick={() => onMove(s.id)}
              disabled={movingTo !== null}
              className="flex items-center gap-2.5 rounded-md border border-line bg-card px-3 py-2 text-left text-sm text-fg hover:border-accent-line hover:bg-accent-soft disabled:opacity-50"
            >
              <span className="text-base leading-none">{s.emoji}</span>
              <span className="flex-1 truncate">{s.name || 'Untitled'}</span>
              <span className="text-xs text-muted">
                {s.stacks.length} stack{s.stacks.length === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
