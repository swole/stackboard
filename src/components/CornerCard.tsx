import { X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'

// The shell the trial-end recap and the moment line share (0.9.0): the same corner card as the
// what's-new notes, so the three look like one family and never sit on top of each other.

export const PRIMARY = 'rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover'
export const QUIET = 'rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-fg'

export function CornerCard({ data, onClose, children }: { data: Record<string, string>; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside
      {...data}
      role="note"
      className="pop-in fixed bottom-4 right-4 z-30 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-raised p-4 text-sm shadow-float"
    >
      <button
        onClick={onClose}
        className="absolute right-2.5 top-2.5 rounded p-1 text-faint hover:bg-hover hover:text-soft"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {children}
    </aside>
  )
}

/** Settings, scrolled to the Stackboard Pro section. */
export function openProSettings(): void {
  useStackableStore.getState().openModal({ kind: 'settings' })
  setTimeout(() => document.querySelector('[data-pro]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
}
