import { useEffect, useState } from 'react'
import { IS_EXTENSION } from '../lib/bookmarks'
import { usePro } from '../lib/pro'
import { checkAiFileReady, loadAiFile, setAiFile, useAiFile } from '../lib/aiFile'
import { useStackableStore } from '../store/useStackableStore'
import { PrimaryButton, SecondaryButton } from './modals/Modal'

/**
 * Settings > Stackboard Pro > "Let AI pick the stack" (0.9.0). Off by default, and switching it on
 * first says what gets sent. Only with an active Pro key (the server checks it; a trial has none),
 * and only once the server says it's switched on. School mode: never under the company's ai lock.
 */
export function AiFileSetting() {
  const hasKey = usePro((s) => s.state.kind === 'pro' && !!s.license?.activationId)
  const aiLocked = useStackableStore((s) => !!s.tree?.company?.lock.ai)
  const on = useAiFile((s) => s.on)
  const ready = useAiFile((s) => s.ready)
  const [notice, setNotice] = useState(false)

  useEffect(() => {
    if (!hasKey || !IS_EXTENSION || aiLocked) return
    void loadAiFile()
    void checkAiFileReady()
  }, [hasKey, aiLocked])

  if (!IS_EXTENSION || !hasKey || aiLocked || ready !== true || on === null) return null

  const toggle = (want: boolean) => {
    if (want) return setNotice(true)
    setNotice(false)
    void setAiFile(false)
  }

  return (
    <div data-ai-file-setting className="mt-3">
      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-soft">
        <input
          type="checkbox"
          checked={on || notice}
          onChange={(e) => toggle(e.target.checked)}
          className="h-3.5 w-3.5 accent-accent"
          data-ai-file-toggle
        />
        Let AI pick the stack when you save a page
      </label>
      {notice && !on ? (
        <div data-ai-file-notice className="mt-1.5 rounded-md border border-line bg-sunken px-3 py-2 text-xs leading-relaxed text-fg">
          Each time you open the save popup on a page, Stackboard sends the page's title and address and the names of your stacks
          to Stackboard's server, which asks Claude, Anthropic's AI, which stack fits. Nothing is stored, and you still choose where it
          goes.
          <div className="mt-2 flex gap-2">
            <PrimaryButton
              data-ai-file-on
              onClick={() => {
                setNotice(false)
                void setAiFile(true)
              }}
            >
              Turn on
            </PrimaryButton>
            <SecondaryButton onClick={() => setNotice(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {on
            ? 'The save popup offers the stack the AI picks, and its own match when the AI is slow.'
            : 'The save popup already suggests a stack from the sites and names on your board. With this on, AI picks it.'}
        </p>
      )}
    </div>
  )
}
