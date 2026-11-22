import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { IS_EXTENSION } from '../lib/bookmarks'
import { dismissKeepHint, shouldShowKeepHint } from '../lib/onboarding'
import { useReveal } from '../lib/reveal'
import { REVEAL_KEY, revealDue } from '../lib/revealPlan'

/**
 * First new tabs after an install (0.4.0): Chrome asks whether to keep an extension's new
 * tab page, and "Change it back" silently switches Stackboard off. Say which button to press.
 * 0.9.9: it sits in the page's flow above the search bar (floating, it covered the bar on every
 * fresh tab). While a first-run reveal may still show it waits, since the reveal says the same
 * thing itself; once the reveal's board is kept it stays away for good.
 */
export function KeepItHint() {
  const [show, setShow] = useState(false)
  // Until storage answers, assume the reveal is coming, so the pill never flashes before it.
  const [waiting, setWaiting] = useState(IS_EXTENSION)
  const revealing = useReveal((s) => s.phase !== 'off' || s.spaceId !== null)

  useEffect(() => {
    let live = true
    void shouldShowKeepHint().then((yes) => live && setShow(yes))
    if (!IS_EXTENSION) return
    void chrome.storage.local.get(REVEAL_KEY).then((got) => live && setWaiting(revealDue(got[REVEAL_KEY])))
    // FirstRun clears the mark when there is nothing to reveal or the person picks the full list.
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && REVEAL_KEY in changes) setWaiting(revealDue(changes[REVEAL_KEY].newValue))
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => {
      live = false
      chrome.storage.onChanged.removeListener(onChange)
    }
  }, [])

  if (!show || waiting || revealing) return null

  const close = () => {
    setShow(false)
    void dismissKeepHint()
  }

  return (
    <div role="note" data-keep-hint className="flex shrink-0 justify-center px-4 pt-3">
      <div className="pop-in flex items-center gap-3 rounded-full bg-inverse py-1.5 pl-4 pr-1.5 text-sm text-on-inverse shadow-toast ring-1 ring-on-inverse/10 ring-inset">
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
