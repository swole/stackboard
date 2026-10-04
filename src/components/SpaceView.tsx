import { useState } from 'react'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Download, Check } from 'lucide-react'
import type { Space } from '../lib/types'
import { StackColumn } from './StackColumn'
import { AddStackPlaceholder } from './AddStackPlaceholder'
import { OpenTabsButton } from './OpenTabsButton'
import { exportBackup } from '../lib/bookmarks'
import { downloadJson } from '../lib/tabs'

interface Props {
  space: Space
}

export function SpaceView({ space }: Props) {
  const [copied, setCopied] = useState(false)

  const onExport = async () => {
    const backup = await exportBackup()
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(`stackboard-backup-${date}.json`, backup)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{space.emoji}</span>
          <h1 className="text-2xl font-bold text-ink-800">{space.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            title="Download a JSON backup of every space"
            className="flex items-center gap-1.5 rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-sm text-ink-700 hover:border-ink-200 hover:bg-cream-50"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-peach-600" />
                Exported
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Export
              </>
            )}
          </button>
          <OpenTabsButton space={space} />
        </div>
      </header>

      <div className="no-scrollbar flex-1 overflow-x-auto overflow-y-auto px-8 pb-8">
        <SortableContext
          items={space.stacks.map((s) => `st:${s.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-8">
            {space.stacks.map((stack) => (
              <StackColumn key={stack.id} stack={stack} />
            ))}
            <AddStackPlaceholder spaceId={space.id} />
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
