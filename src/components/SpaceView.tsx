import { useMemo, useRef, useState } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { Download, Check, Lock } from 'lucide-react'
import type { Space } from '../lib/types'
import { StackColumn } from './StackColumn'
import { AddStackPlaceholder } from './AddStackPlaceholder'
import { OpenTabsButton } from './OpenTabsButton'
import { TidyButton } from './TidyButton'
import { exportBackup } from '../lib/bookmarks'
import { downloadJson } from '../lib/tabs'
import { useStackableStore } from '../store/useStackableStore'
import { useAppearance } from '../store/useAppearance'
import { packedSorting, usePackedGrid } from '../hooks/usePackedGrid'

interface Props {
  space: Space
}

export function SpaceView({ space }: Props) {
  const [copied, setCopied] = useState(false)
  // Teams T8: a company that locks import and export also hides the backup download here.
  const exportLocked = useStackableStore((s) => !!s.tree?.company?.lock.importExport)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const canAdd = !space.company
  // 0.8.0: Packed (the default) tucks each stack under the one above it; Rows is the plain grid.
  const packed = useAppearance((s) => s.appearance.layout === 'packed')
  const packing = usePackedGrid(gridRef, packed, space.stacks.map((s) => s.id).join(' ') + (canAdd ? ' +add' : ''))
  // A stack dragged in Packed previews the packed board the drop makes; Rows keeps dnd-kit's own.
  const sorting = useMemo(() => (packed ? packedSorting(packing) : rectSortingStrategy), [packed, packing])

  const onExport = async () => {
    const backup = await exportBackup()
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(`stackboard-backup-${date}.json`, backup)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 px-8 py-5 compact:px-6 compact:py-3.5">
        <div className="on-wallpaper flex min-w-0 items-center gap-2.5">
          <span className="text-2xl leading-none">{space.emoji}</span>
          <h1 className="truncate text-2xl font-bold text-strong">{space.name}</h1>
          {space.company && (
            <span
              data-company-hint
              className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 text-xs text-muted"
              title="Your IT team sets this space through Chrome, so it can't be changed here. Your own spaces work as usual."
            >
              <Lock className="h-3 w-3" />
              From your company
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TidyButton space={space} />
          {!exportLocked && (
          <button
            onClick={onExport}
            data-export-button
            title="Download a JSON backup of every space"
            className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-fg hover:border-line-strong hover:bg-hover"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-accent-text" />
                Exported
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Export
              </>
            )}
          </button>
          )}
          <OpenTabsButton space={space} />
        </div>
      </header>

      {/* 0.5.0: stacks wrap into rows that use the whole width (they used to be one row of fixed
          260px columns that scrolled sideways and left the bottom of the screen empty).
          0.8.0: the vertical gap lives in --stack-gap: Rows uses it as the row gap, and Packed
          (hooks/usePackedGrid.ts) adds it under each stack. */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-8 pb-8 compact:px-6 compact:pb-6">
        <SortableContext items={space.stacks.map((s) => `st:${s.id}`)} strategy={sorting}>
          <div
            ref={gridRef}
            data-stack-grid
            className="grid grid-cols-[repeat(auto-fill,minmax(244px,1fr))] items-start gap-x-6 gap-y-(--stack-gap) [--stack-gap:--spacing(7)] compact:grid-cols-[repeat(auto-fill,minmax(212px,1fr))] compact:gap-x-4 compact:[--stack-gap:--spacing(5)] wallpaper:[--stack-gap:--spacing(6)] compact:wallpaper:[--stack-gap:--spacing(4)]"
          >
            {space.stacks.map((stack) => (
              <StackColumn key={stack.id} stack={stack} />
            ))}
            {canAdd && <AddStackPlaceholder spaceId={space.id} />}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
