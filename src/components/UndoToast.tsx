import { useEffect, useRef } from 'react'
import { useStackableStore } from '../store/useStackableStore'
import { reducedMotion } from '../lib/motion'

const MOD = /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * Bottom-centre toast. Deletes stay instant; this is the way back. The countdown bar is a
 * CSS animation that pauses on hover, and the toast leaves when that animation ends.
 */
export function UndoToast() {
  const toast = useStackableStore((s) => s.toast)
  const dismiss = useStackableStore((s) => s.dismissToast)
  const busy = useRef(false)
  const barRef = useRef<HTMLSpanElement | null>(null)

  const undo = async () => {
    if (!toast?.undo || busy.current) return
    busy.current = true
    dismiss(toast.id)
    try {
      await toast.undo()
    } finally {
      busy.current = false
    }
  }

  // Ctrl/Cmd+Z while the toast is up, unless focus is in a text field (its own undo wins).
  useEffect(() => {
    if (!toast?.undo) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      if (typingInField()) return
      e.preventDefault()
      void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // re-bound each render so it always sees the current toast

  // No running countdown bar (reduced motion hides it) means no animationend: use a timer.
  useEffect(() => {
    if (!toast) return
    const bar = barRef.current
    const barRuns =
      !reducedMotion() && !!bar && typeof bar.getAnimations === 'function' && bar.getAnimations().length > 0
    if (barRuns) return
    const t = setTimeout(() => dismiss(toast.id), toast.duration)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  if (!toast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div
        key={toast.id}
        className="toast pointer-events-auto relative flex max-w-full items-center gap-3 overflow-hidden rounded-xl bg-ink-800 py-2 pl-4 pr-2 text-sm text-cream-100 shadow-[0_14px_34px_-12px_rgb(28_25_23/0.55)]"
      >
        <span className="min-w-0 truncate py-1">
          {toast.verb} <span className="font-semibold text-white">{toast.title}</span>
          {toast.detail && <span className="text-ink-300"> ({toast.detail})</span>}
        </span>
        {toast.undo ? (
          <button
            onClick={() => void undo()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold text-peach-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peach-300"
          >
            Undo
            <kbd className="font-sans text-[11px] font-normal text-ink-300">{MOD}Z</kbd>
          </button>
        ) : (
          <span className="w-2" />
        )}
        <span
          ref={barRef}
          aria-hidden
          className="toast-timer absolute inset-x-0 bottom-0 h-[2px] bg-peach-400/80"
          style={{ animationDuration: `${toast.duration}ms` }}
          onAnimationEnd={() => dismiss(toast.id)}
        />
      </div>
    </div>
  )
}
