import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { dismissKeepHint, shouldShowKeepHint } from '../lib/onboarding'

/**
 * First new tabs after an install (0.4.0): Chrome asks whether to keep an extension's new
 * tab page, and "Change it back" silently switches Stackboard off. Say which button to press.
 */
export function KeepItHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let live = true
    void shouldShowKeepHint().then((yes) => live && setShow(yes))
    return () => {
      live = false
    }
  }, [])

  if (!show) return null

  const close = () => {
    setShow(false)
    void dismissKeepHint()
  }

  return (
    <div
      role="note"
      data-keep-hint
      className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4"
    >
      <div className="pop-in pointer-events-auto flex items-center gap-3 rounded-full bg-ink-800 py-1.5 pl-4 pr-1.5 text-sm text-cream-100 shadow-[0_14px_34px_-14px_rgb(28_25_23/0.6)]">
        <span>
          If Chrome asks whether to keep this page, choose{' '}
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-semibold text-white">Keep it</span>
        </span>
        <button
          onClick={close}
          className="rounded-full p-1.5 text-ink-300 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
