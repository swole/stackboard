import { useEffect, useMemo, useRef, useState } from 'react'
import { Command, FolderOpen, Layers, Link2, Search } from 'lucide-react'
import { IS_EXTENSION } from '../lib/bookmarks'
import { commandItems, stepIndex, type CommandAction, type CommandItem } from '../lib/commandPlan'
import { recordOpen } from '../lib/opens'
import { usePro } from '../lib/pro'
import { hasPro } from '../lib/proPlan'
import { typingInField } from '../lib/shortcuts'
import { openHere, openInNewTab } from '../lib/tabs'
import { displayTitle } from '../lib/title'
import { useStackableStore } from '../store/useStackableStore'
import { useAppearance } from '../store/useAppearance'

/** True for Ctrl+K, or Cmd+K on a Mac. */
function isBarKey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'
}

/** What this board can offer right now. */
function availableActions(): Set<CommandAction> {
  const s = useStackableStore.getState()
  const space = s.tree?.spaces.find((x) => x.id === s.selectedSpaceId)
  const lock = s.tree?.company?.lock
  const out = new Set<CommandAction>(['new-space', 'settings', 'cleanup'])
  if (space && !space.company && !s.todayView) out.add('new-stack')
  if (IS_EXTENSION) out.add('stash')
  if (!lock?.appearance) {
    out.add('light')
    out.add('dark')
  }
  // AI tidy needs a paid key and the server not switched off; its button only shows when both hold.
  if (document.querySelector('[data-tidy-button]')) out.add('tidy')
  return out
}

async function stashThisWindow(): Promise<void> {
  const store = useStackableStore.getState()
  try {
    const win = await chrome.windows.getCurrent()
    const res = (await chrome.runtime.sendMessage({ type: 'stash', windowId: win.id, close: true })) as { saved?: number; error?: string } | undefined
    if (res?.error) store.reportError('stash this window', new Error(res.error))
    else if (!res?.saved) store.showToast({ verb: 'Nothing to stash', title: 'in this window', duration: 3000 })
  } catch (err) {
    store.reportError('stash this window', err)
  }
}

function runAction(id: CommandAction): void {
  const store = useStackableStore.getState()
  if (id === 'new-space') store.openModal({ kind: 'space-add' })
  else if (id === 'new-stack' && store.selectedSpaceId) store.openModal({ kind: 'stack-add', spaceId: store.selectedSpaceId })
  else if (id === 'stash') void stashThisWindow()
  else if (id === 'settings') store.openModal({ kind: 'settings' })
  else if (id === 'light' || id === 'dark') useAppearance.getState().update({ mode: id })
  else if (id === 'cleanup') store.openModal({ kind: 'cleanup' })
  else if (id === 'tidy') document.querySelector<HTMLButtonElement>('[data-tidy-button]')?.click()
}

/**
 * The command bar (Pro, 0.9.0): Ctrl/Cmd+K opens it over the board to find any link, stack or
 * space and run a few actions; arrows move, Enter runs (Ctrl/Cmd+Enter opens a link in a background
 * tab), Esc closes. Without Pro the same keys go to the search box, as "/" does. Neither fires while
 * typing in a field or with a dialog open.
 */
export function CommandBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [available, setAvailable] = useState<Set<CommandAction>>(() => new Set())
  const tree = useStackableStore((s) => s.tree)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBarKey(e) || typingInField()) return
      if (useStackableStore.getState().modal.kind !== 'none') return
      e.preventDefault()
      const pro = usePro.getState()
      if (pro.ready && hasPro(pro.state)) {
        setAvailable(availableActions())
        setQuery('')
        setIndex(0)
        setOpen(true)
        return
      }
      // Free: the search box, the way "/" gets there (Sidebar opens itself if it's collapsed).
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo(() => (open ? commandItems({ tree, query, available }) : []), [open, tree, query, available])

  // Keep the chosen row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const close = () => setOpen(false)

  const run = (item: CommandItem, background = false) => {
    close()
    const store = useStackableStore.getState()
    if (item.kind === 'action') runAction(item.id)
    else if (item.kind === 'space') {
      store.setSearch('')
      store.selectSpace(item.space.id)
    } else if (item.kind === 'stack') store.revealStack(item.space.id, item.stack.id)
    else {
      recordOpen(item.bookmark.url)
      if (background) void openInNewTab(item.bookmark.url)
      else void openHere(item.bookmark.url, store.openTabs)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' || (isBarKey(e.nativeEvent) && !e.repeat)) {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => stepIndex(i, e.key === 'ArrowDown' ? 1 : -1, items.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[index]
      if (item) run(item, e.ctrlKey || e.metaKey)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/40 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div role="dialog" aria-label="Command bar" data-command-bar className="w-full max-w-lg overflow-hidden rounded-xl bg-raised text-fg shadow-2xl ring-1 ring-line">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            autoFocus
            data-command-input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Find a link, stack or space, or type a command"
            aria-label="Command bar"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg placeholder:text-faint focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-line bg-card px-1 font-sans text-[10px] leading-4 text-faint">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" aria-label="Results" className="no-scrollbar max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nothing matches.</li>}
          {items.map((item, i) => (
            <li
              key={rowKey(item)}
              role="option"
              aria-selected={i === index}
              data-command-item={item.kind}
              onMouseMove={() => i !== index && setIndex(i)}
              onClick={(e) => run(item, e.ctrlKey || e.metaKey)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${i === index ? 'bg-selected text-strong' : 'text-fg'}`}
            >
              <Row item={item} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function rowKey(item: CommandItem): string {
  if (item.kind === 'action') return `a:${item.id}`
  if (item.kind === 'space') return `sp:${item.space.id}`
  if (item.kind === 'stack') return `st:${item.stack.id}`
  return `bm:${item.bookmark.id}`
}

function Row({ item }: { item: CommandItem }) {
  const hint = 'ml-auto shrink-0 truncate pl-3 text-xs text-muted'
  if (item.kind === 'action') {
    return (
      <>
        <Command className="h-4 w-4 shrink-0 text-faint" />
        <span className="truncate">{item.label}</span>
      </>
    )
  }
  if (item.kind === 'space') {
    return (
      <>
        <Layers className="h-4 w-4 shrink-0 text-faint" />
        <span className="truncate">
          {item.space.emoji} {item.space.name}
        </span>
        <span className={hint}>Space</span>
      </>
    )
  }
  if (item.kind === 'stack') {
    return (
      <>
        <FolderOpen className="h-4 w-4 shrink-0 text-faint" />
        <span className="truncate">{item.stack.title}</span>
        <span className={hint}>
          {item.space.emoji} {item.space.name}
        </span>
      </>
    )
  }
  return (
    <>
      <Link2 className="h-4 w-4 shrink-0 text-faint" />
      <span className="truncate">{displayTitle(item.bookmark.title, item.bookmark.url) || item.bookmark.url}</span>
      <span className={hint}>{[item.stack.title, ...item.path.map((f) => f.title)].join(' › ')}</span>
    </>
  )
}
