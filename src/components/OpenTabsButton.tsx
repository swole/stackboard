import { ExternalLink } from 'lucide-react'
import type { Space } from '../lib/types'
import { openAllInTabs } from '../lib/tabs'
import { useTwoStep } from '../hooks/useTwoStep'

interface Props {
  space: Space
}

export function OpenTabsButton({ space }: Props) {
  const confirmStep = useTwoStep()
  const count = space.stacks.reduce((acc, st) => acc + st.bookmarks.length, 0)
  const allBookmarks = space.stacks.flatMap((st) => st.bookmarks)

  const onClick = async () => {
    if (count === 0) return
    // More than 15 tabs takes a second click: the button asks "Open 23 tabs?" in place.
    if (count > 15 && !confirmStep.armed) {
      confirmStep.arm()
      return
    }
    confirmStep.disarm()
    await openAllInTabs(allBookmarks, `${space.emoji} ${space.name}`)
  }

  return (
    <button
      onClick={onClick}
      disabled={count === 0}
      title={confirmStep.armed ? 'Click again to open them all' : undefined}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm disabled:opacity-40 ${
        confirmStep.armed
          ? 'border-peach-500 bg-peach-500 font-medium text-white hover:bg-peach-600'
          : 'border-ink-100 bg-white text-ink-700 hover:border-ink-200 hover:bg-cream-50'
      }`}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {confirmStep.armed ? (
        `Open ${count} tabs?`
      ) : (
        <>
          Open tabs
          <span className="ml-0.5 rounded bg-ink-100 px-1.5 text-xs text-ink-600">{count}</span>
        </>
      )}
    </button>
  )
}
