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
      className="flex h-fit w-[260px] shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-dashed border-ink-200 bg-white/30 px-4 py-3 text-sm text-ink-500 hover:border-peach-300 hover:bg-peach-50 hover:text-peach-700"
      style={{ marginTop: 28 }}
    >
      <Plus className="h-4 w-4" />
      Add empty Stack
    </button>
  )
}
