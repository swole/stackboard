import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { dismissKeepHint, shouldShowKeepHint } from '../lib/onboarding'
import { useStackableStore } from '../store/useStackableStore'
import { dismissedAnnouncements } from '../lib/company'
import { showAnnouncement } from '../lib/managedPlan'

/**
 * First new tabs after an install (0.4.0): Chrome asks whether to keep an extension's new
 * tab page, and "Change it back" silently switches Stackboard off. Say which button to press.
 */
export function KeepItHint() {
  const [show, setShow] = useState(false)
  // A company announcement line (Teams, 0.8.0) holds the top edge: sit just below it.
  const belowLine = useStackableStore((s) => showAnnouncement(s.tree?.company?.announcement, dismissedAnnouncements()))

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
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${belowLine ? 'top-12' : 'top-3'}`}
    >
      <div className="pop-in pointer-events-auto flex items-center gap-3 rounded-full bg-inverse py-1.5 pl-4 pr-1.5 text-sm text-on-inverse shadow-toast ring-1 ring-on-inverse/10 ring-inset">
        <span>
          If Chrome asks whether to keep this page, choose{' '}
          <span className="rounded-md bg-on-inverse/10 px-1.5 py-0.5 font-semibold text-inverse-strong">Keep it</span>
        </span>
        <button
          onClick={close}
          className="rounded-full p-1.5 text-inverse-muted hover:bg-on-inverse/10 hover:text-inverse-strong"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
