import { useState } from 'react'
import { useDndMonitor } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { useAppearance } from '../store/useAppearance'

interface Props {
  spaceId: string
}

export function AddStackPlaceholder({ spaceId }: Props) {
  const openModal = useStackableStore((s) => s.openModal)
  // Packed (0.8.0): a stack drag previews the packed board by moving the stacks, and this button
  // isn't one of them, so it steps aside (keeping its space) until the drop.
  const packed = useAppearance((s) => s.appearance.layout === 'packed')
  const [stackDrag, setStackDrag] = useState(false)
  useDndMonitor({
    onDragStart: (e) => setStackDrag(String(e.active.id).startsWith('st:')),
    onDragEnd: () => setStackDrag(false),
    onDragCancel: () => setStackDrag(false),
  })
  return (
    <button
      onClick={() => openModal({ kind: 'stack-add', spaceId })}
      // Lines up with the top of the stacks' link lists (below their headers).
      className={`mt-8 flex h-fit w-full items-center justify-center gap-2 self-start rounded-xl border border-dashed border-line-strong bg-well px-4 py-3 text-sm text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent-text compact:mt-7 compact:py-2 wallpaper:mt-0 wallpaper:bg-panel/60 wallpaper:backdrop-blur-md ${
        packed && stackDrag ? 'invisible' : ''
      }`}
    >
      <Plus className="h-4 w-4" />
      Add empty Stack
    </button>
  )
}
