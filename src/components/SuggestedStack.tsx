import { useEffect, useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import type { StackableTree } from '../lib/types'
import { IS_EXTENSION } from '../lib/bookmarks'
import { fileTargets, suggestStack, type Suggestion } from '../lib/filePlan'
import { askAiPick, loadAiFile } from '../lib/aiFile'

/**
 * The stack the toolbar popup offers first (0.9.0): the local match straight away, then, with "Let AI
 * pick the stack" on, the AI's pick if it answers in time. `page` is null when there's nothing to
 * suggest for (browser pages, a selection of several tabs).
 */
export function useSuggestedStack(tree: StackableTree | null, page: { url: string; title: string } | null) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [asking, setAsking] = useState(false)
  const url = page?.url ?? ''
  const title = page?.title ?? ''

  useEffect(() => {
    if (!tree || !url) {
      setSuggestion(null)
      return
    }
    let live = true
    setSuggestion(suggestStack(tree, { url, title }))
    if (IS_EXTENSION) {
      void (async () => {
        if (!(await loadAiFile()) || !live) return
        setAsking(true)
        const pick = await askAiPick({ url, title }, fileTargets(tree))
        if (!live) return
        if (pick) setSuggestion(pick)
        setAsking(false)
      })()
    }
    return () => {
      live = false
    }
    // The title is the tab's own, so editing the name in the field doesn't ask again.
  }, [tree, url])

  return { suggestion, asking }
}

export function SuggestedStack(props: { suggestion: Suggestion | null; asking: boolean; disabled: boolean; onSave: (s: Suggestion) => void }) {
  const { suggestion, asking, disabled, onSave } = props
  if (!suggestion && !asking) return null
  return (
    <div data-suggested className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-soft">
        {suggestion?.reason === 'ai' ? 'Suggested by AI' : 'Suggested'}
        {asking && <span className="font-normal text-faint">Asking AI…</span>}
      </div>
      {suggestion && (
        <button
          data-suggested-stack={suggestion.stackId}
          data-suggested-reason={suggestion.reason}
          onClick={() => onSave(suggestion)}
          disabled={disabled}
          title="Save here (Enter)"
          className="flex w-full items-center gap-2 rounded-md border border-accent-line bg-card px-3 py-2 text-left text-sm text-fg hover:bg-hover disabled:opacity-50"
        >
          <span className="min-w-0 flex-1 truncate">{suggestion.path}</span>
          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />
        </button>
      )}
    </div>
  )
}
