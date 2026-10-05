import { Plus } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'

interface Props {
  spaceId: string
}

export function AddStackPlaceholder({ spaceId }: Props) {
  const openModal = useStackableStore((s) => s.openModal)
  return (
    <button
      onClick={() => openModal({ kind: 'stack-add', spaceId })}
      // Lines up with the top of the stacks' link lists (below their headers).
      className="mt-8 flex h-fit w-full items-center justify-center gap-2 self-start rounded-xl border border-dashed border-line-strong bg-well px-4 py-3 text-sm text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent-text compact:mt-7 compact:py-2 wallpaper:mt-0 wallpaper:bg-panel/60 wallpaper:backdrop-blur-md"
    >
      <Plus className="h-4 w-4" />
      Add empty Stack
    </button>
  )
}
