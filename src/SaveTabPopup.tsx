import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Check, SquareKanban, Inbox } from 'lucide-react'
import type { StackableTree } from './lib/types'
import { readTree, createBookmark } from './lib/bookmarks'
import { planWindow } from './lib/stash'
import { staysNote, type StashPlan } from './lib/stashPlan'
import { plural } from './lib/importPlan'

interface CurrentTab {
  url: string
  title: string
}

async function getActiveTab(): Promise<CurrentTab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab || !tab.url) return null
  return { url: tab.url, title: tab.title || tab.url }
}

// Chrome rejects bookmark creation for restricted schemes (chrome://, the
// extension's own new-tab page, about:, etc.). Detect those up front so we can
// show a clear message instead of letting the save fail after the user picks a
// stack — opening the popup over the Stackboard new-tab page hits exactly this.
function isSaveableUrl(url: string): boolean {
  return /^(https?|ftp|file):/i.test(url)
}

export default function SaveTabPopup() {
  const [tab, setTab] = useState<CurrentTab | null>(null)
  const [title, setTitle] = useState('')
  const [tree, setTree] = useState<StackableTree | null>(null)
  const [expandedSpaceId, setExpandedSpaceId] = useState<string | null>(null)
  const [savedTo, setSavedTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [t, tr] = await Promise.all([getActiveTab(), readTree()])
        if (cancelled) return
        if (t) {
          setTab(t)
          setTitle(t.title)
        } else {
          setError('No active tab to save.')
        }
        setTree(tr)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const saveable = !!tab && isSaveableUrl(tab.url)
  const canSave = saveable && !!title.trim()

  const handleSave = async (stackId: string, stackName: string, spaceName: string) => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await createBookmark(stackId, title.trim(), tab!.url)
      setSavedTo(`${spaceName} › ${stackName}`)
      setTimeout(() => window.close(), 900)
    } catch {
      setError("Couldn't save this page. Try again, or reopen the popup.")
      setSaving(false)
    }
  }

  const spaces = useMemo(() => tree?.spaces ?? [], [tree])

  return (
    <div className="w-[340px] bg-canvas p-4 font-sans text-fg">
      <header className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-strong">
        <SquareKanban className="h-4 w-4 text-accent" />
        Save current tab
      </header>

      {error && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {savedTo ? (
        <div className="flex items-center gap-2 rounded-md border border-accent-line bg-card px-3 py-3 text-sm text-fg">
          <Check className="h-4 w-4 text-accent-text" />
          Saved to <span className="font-medium">{savedTo}</span>
        </div>
      ) : tab && !saveable ? (
        <div className="rounded-md border border-line bg-card px-3 py-3 text-sm text-soft">
          <div className="font-medium text-fg">This page can't be saved</div>
          <p className="mt-1 text-xs text-muted">
            Stackboard can only save normal web pages (http, https). Browser pages like
            this one can't be bookmarked.
          </p>
          <div className="mt-2 truncate text-[11px] text-muted" title={tab.url}>
            {tab.url}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-soft">Link name</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Title for the bookmark"
              className="w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:border-focus focus:outline-none"
            />
            {tab && (
              <div className="mt-1 truncate text-[11px] text-muted" title={tab.url}>
                {tab.url}
              </div>
            )}
            {tab && !title.trim() && (
              <div className="mt-1 text-[11px] text-danger">Enter a name to save.</div>
            )}
          </div>

          <div className="mb-1 text-xs font-medium text-soft">Where to save</div>
          <div className="no-scrollbar max-h-[320px] overflow-y-auto rounded-md border border-line bg-card">
            {spaces.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted">
                No spaces yet. Open a new tab and create a space first.
              </div>
            )}
            {spaces.map((sp) => {
              const expanded = expandedSpaceId === sp.id
              return (
                <div key={sp.id} className="border-b border-line last:border-0">
                  <button
                    onClick={() => setExpandedSpaceId(expanded ? null : sp.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-hover"
                  >
                    <span className="text-base leading-none">{sp.emoji}</span>
                    <span className="flex-1 truncate">{sp.name || 'Untitled'}</span>
                    <span className="text-xs text-faint">{sp.stacks.length}</span>
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-faint" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-faint" />
                    )}
                  </button>
                  {expanded && (
                    <div className="border-t border-line bg-sunken py-1">
                      {sp.stacks.length === 0 ? (
                        <div className="px-6 py-1.5 text-xs text-muted">
                          No stacks in this space.
                        </div>
                      ) : (
                        sp.stacks.map((st) => (
                          <button
                            key={st.id}
                            onClick={() => handleSave(st.id, st.title, sp.name)}
                            disabled={!canSave || saving}
                            className="flex w-full items-center justify-between gap-2 px-6 py-1.5 text-left text-sm text-soft hover:bg-card hover:text-strong disabled:opacity-50"
                          >
                            <span className="truncate">{st.title}</span>
                            <span className="text-[11px] text-faint">
                              {st.bookmarks.length}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-2 text-[11px] text-muted">
            Tap a stack to save. No save button needed.
          </div>
        </>
      )}

      <StashSection />
    </div>
  )
}

type StashState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'saved'; saved: number } | { kind: 'error'; message: string }

/**
 * "Stash this window" (0.4.0): every tab into a stack in the Stash space, OneTab-style, but
 * saved as real Chrome bookmarks. The work runs in the background worker, since this popup
 * closes as soon as the new tab takes focus.
 */
function StashSection() {
  const [windowId, setWindowId] = useState<number | null>(null)
  const [plan, setPlan] = useState<StashPlan | null>(null)
  const [shortcut, setShortcut] = useState('')
  const [state, setState] = useState<StashState>({ kind: 'idle' })

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.windows) return
    ;(async () => {
      const win = await chrome.windows.getCurrent()
      if (typeof win.id !== 'number') return
      setWindowId(win.id)
      setPlan(await planWindow(win.id))
      const commands = await chrome.commands.getAll()
      setShortcut(commands.find((c) => c.name === 'stash-window')?.shortcut ?? '')
    })().catch(() => {})
  }, [])

  if (!plan || !plan.links || windowId === null) return null

  const run = async (close: boolean) => {
    setState({ kind: 'busy' })
    try {
      const res = await chrome.runtime.sendMessage({ type: 'stash', windowId, close })
      if (res?.error) setState({ kind: 'error', message: res.error })
      else setState({ kind: 'saved', saved: res?.saved ?? plan.links })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const stays = staysNote(plan.pinned, plan.skipped)

  return (
    <section data-stash className="mt-4 border-t border-line pt-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-strong">
        <Inbox className="h-4 w-4 text-accent" />
        <span className="flex-1">Stash this window</span>
        {shortcut && (
          <kbd className="rounded border border-line bg-card px-1.5 font-sans text-[10px] font-normal leading-4 text-faint">
            {shortcut}
          </kbd>
        )}
      </div>
      {state.kind === 'saved' ? (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-accent-line bg-card px-3 py-2 text-sm">
          <Check className="h-4 w-4 text-accent-text" />
          Saved {plural(state.saved, 'tab')} to Stash
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Saves {plan.links === 1 ? 'this tab' : `all ${plan.links} tabs`} as bookmarks in your Stash space, one stack per tab group.
            {stays && ` ${stays}`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void run(true)}
              disabled={state.kind === 'busy'}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              Stash and close {plural(plan.tabIds.length, 'tab')}
            </button>
            <button
              onClick={() => void run(false)}
              disabled={state.kind === 'busy'}
              className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm text-fg hover:bg-hover disabled:opacity-50"
            >
              Save only
            </button>
          </div>
          {state.kind === 'error' && <p className="mt-2 text-xs text-danger">Stash failed: {state.message}</p>}
        </>
      )}
    </section>
  )
}
