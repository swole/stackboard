import { useEffect, useState } from 'react'
import { Link2, X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { IS_EXTENSION } from '../lib/bookmarks'
import { addSharedStack, dropPendingShare, readPendingShare } from '../lib/share'
import type { SharedStack } from '../lib/sharePlan'
import { plural } from '../lib/importPlan'

const NEW_SPACE = 'new'
/**
 * Add answers only this long after the card appears, so a click aimed at whatever was under the
 * pointer when the tab opened (or a page that tricks someone into clicking) can't add a stack.
 */
export const ADD_DELAY_MS = 800

function clearHash(): void {
  history.replaceState(null, '', location.pathname + location.search)
}

/**
 * Share a stack (0.8.0, T4): the tab the service worker opens after "Add to Stackboard" on
 * getstackboard.com/s. Nothing is written until the person picks a space here and presses Add.
 */
export function ShareAddCard() {
  const spaces = useStackableStore((s) => s.tree?.spaces)
  const selected = useStackableStore((s) => s.selectedSpaceId)
  const [pending, setPending] = useState<{ id: string; stack: SharedStack } | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  // Teams T8: a company that locks import and export also turns off adding shared stacks.
  const locked = useStackableStore((s) => !!s.tree?.company?.lock.importExport)

  useEffect(() => {
    if (!pending) return
    setArmed(false)
    const t = setTimeout(() => setArmed(true), ADD_DELAY_MS)
    return () => clearTimeout(t)
  }, [pending])

  useEffect(() => {
    if (!IS_EXTENSION) return
    const m = location.hash.match(/^#share=([a-z0-9]{8,40})$/)
    if (!m) return
    const id = m[1]
    void readPendingShare(id).then((stack) => {
      if (stack) {
        setPending({ id, stack })
        return
      }
      clearHash()
      useStackableStore.getState().showToast({ verb: 'That shared stack', title: 'has expired', detail: 'Open the link again to add it.', duration: 6000 })
    })
  }, [])

  const own = (spaces ?? []).filter((s) => !s.company)
  const value = target ?? (own.some((s) => s.id === selected) ? selected! : (own[0]?.id ?? NEW_SPACE))

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && void cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!pending || !spaces) return null
  const { stack } = pending
  const n = stack.links.length

  async function cancel() {
    if (!pending) return
    await dropPendingShare(pending.id)
    clearHash()
    setPending(null)
  }

  async function add() {
    if (!pending || busy || !armed || locked) return
    setBusy(true)
    const store = useStackableStore.getState()
    try {
      const made = await addSharedStack(stack, value === NEW_SPACE ? { newSpace: true } : { spaceId: value })
      await dropPendingShare(pending.id)
      clearHash()
      setPending(null)
      await store.refresh()
      store.revealStack(made.spaceId, made.stackId)
      store.showToast({ verb: 'Added', title: stack.title, detail: plural(n, 'link'), duration: 4000 })
      store.celebrate()
    } catch (err) {
      store.reportError(`add ${stack.title}`, err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 p-6">
      <aside
        data-share-add
        role="dialog"
        aria-labelledby="share-add-title"
        className="pop-in relative w-full max-w-[440px] rounded-2xl border border-line bg-raised p-6 shadow-float"
      >
        <button
          onClick={() => void cancel()}
          className="absolute right-3 top-3 rounded p-1 text-faint hover:bg-hover hover:text-soft"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 id="share-add-title" className="flex items-start gap-2 pr-6 text-base font-semibold text-strong">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
          <span>
            {locked ? <>&ldquo;{stack.title}&rdquo; ({plural(n, 'link')})</> : <>Add &ldquo;{stack.title}&rdquo; ({plural(n, 'link')}) to which space?</>}
          </span>
        </h3>
        <p className="mt-1.5 text-xs text-muted" data-share-note>
          {locked
            ? 'Your company manages this: adding shared stacks is turned off on this computer.'
            : `Someone shared this stack with a link. Here are all ${plural(n, 'link')}: check them before you add or open them.`}
        </p>

        <ul className="mt-3 grid max-h-56 gap-1 overflow-y-auto rounded-lg bg-well p-2 text-xs" data-share-links>
          {stack.links.map((l) => (
            <li key={l.url} className="min-w-0 truncate text-fg" title={l.url}>
              {l.title}
              <span className="ml-1.5 text-faint">{hostOf(l.url)}</span>
            </li>
          ))}
        </ul>

        {!locked && (
          <>
            <label className="mt-4 block text-xs font-medium text-soft" htmlFor="share-add-space">
              Space
            </label>
            <select
              id="share-add-space"
              data-share-space
              value={value}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-sm text-fg focus:border-focus focus:outline-none"
            >
              {own.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </option>
              ))}
              <option value={NEW_SPACE}>A new space: {stack.title}</option>
            </select>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => void cancel()} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-fg">
            {locked ? 'Close' : 'Cancel'}
          </button>
          {!locked && (
            <button
              onClick={() => void add()}
              disabled={busy || !armed}
              data-share-confirm
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
