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
  const tree = useStackableStore((s) => s.tree)
  const [movingTo, setMovingTo] = useState<string | null>(null)

  const targets = (tree?.spaces ?? []).filter((s) => s.id !== currentSpaceId)

  const onMove = async (spaceId: string) => {
    setMovingTo(spaceId)
    try {
      const target = tree?.spaces.find((s) => s.id === spaceId)
      // Append to the end of the destination space's stack row.
      await moveStack(stackId, spaceId, target?.stacks.length ?? 0)
      await refresh()
      close()
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
