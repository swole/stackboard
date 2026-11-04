import { useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { useAppearance } from '../store/useAppearance'
import { usePro } from '../lib/pro'
import { hasPro, keepsTodoFree } from '../lib/proPlan'
import { IS_EXTENSION } from '../lib/bookmarks'
import { prefs } from '../lib/prefs'
import { pickWhatsNew, proNoteText, showProLine, whatsNew080, type WhatsNewCard } from '../lib/whatsNewPlan'

/** chrome.storage.local, set by background.ts on an update from before 0.8.0. */
const WHATS_NEW_080_KEY = 'whatsNew080'

/**
 * The what's-new notes: the Pro note (0.7.0, Pro launch rules: Pro lives in Settings plus
 * one note) for people who had Stackboard before Pro, and the 0.8.0 note for people who updated
 * from an older version. A corner card on at most three new tabs, retired when answered. A tab
 * shows one note at most; the Pro note goes first and the 0.8.0 note waits for a later tab.
 */
export function WhatsNew() {
  const loaded = useStackableStore((s) => !!s.tree)
  const ready = usePro((s) => s.ready)
  const early = usePro((s) => s.early)
  const paid = usePro((s) => s.state.kind === 'pro')
  const [card, setCard] = useState<WhatsNewCard | null>(null)
  const [updated080, setUpdated080] = useState<boolean | null>(IS_EXTENSION ? null : false)
  const shownHere = useRef(false)

  useEffect(() => {
    if (!IS_EXTENSION) return
    let live = true
    chrome.storage.local
      .get(WHATS_NEW_080_KEY)
      .then((got) => live && setUpdated080(!!got[WHATS_NEW_080_KEY]))
      .catch(() => live && setUpdated080(false))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (shownHere.current || !loaded || !ready || updated080 === null) return
    const pick = pickWhatsNew({ early, shows070: prefs.whatsNewShows(), updated080, shows080: prefs.whatsNew080Shows(), paid })
    if (!pick) return
    shownHere.current = true
    if (pick === '070') prefs.setWhatsNewShows(prefs.whatsNewShows() + 1)
    else prefs.setWhatsNew080Shows(prefs.whatsNew080Shows() + 1)
    setCard(pick)
  }, [loaded, ready, early, updated080])

  if (card === '070') return <ProNote onClose={() => setCard(null)} />
  if (card === '080') return <Note080 onClose={() => setCard(null)} />
  return null
}

function Card({ data, title, onClose, children }: { data: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside
      {...{ [data]: '' }}
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
      <h3 className="flex items-center gap-1.5 pr-6 font-semibold text-strong">
        <Sparkles className="h-4 w-4 text-accent-text" />
        {title}
      </h3>
      {children}
    </aside>
  )
}

const PRIMARY = 'rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover'
const QUIET = 'rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-fg'

/** 0.7.0: Pro is here; since 0.8.0 the note also names the trial and, for early users who never
 *  made one, counts to-do lists as Pro. */
function ProNote({ onClose }: { onClose: () => void }) {
  const keepsTodo = usePro((s) => keepsTodoFree(s))
  const trialOpen = usePro((s) => s.state.kind === 'free' && !s.state.trialUsed)
  // The wording depends on the to-do decision this load makes (App.tsx). The note is picked on load
  // as before and appears once that lands, so a decision arriving later never wakes up other tabs.
  const decided = usePro((s) => !s.early || s.earlyTodo !== null)
  const close = () => {
    prefs.setWhatsNewShows(-1)
    onClose()
  }
  const look = () => {
    close()
    useStackableStore.getState().openModal({ kind: 'settings' })
    setTimeout(() => document.querySelector('[data-pro]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
  }
  if (!decided) return null
  return (
    <Card data="data-whats-new" title="New: Stackboard Pro" onClose={close}>
      <p className="mt-1.5 leading-relaxed text-muted">{proNoteText({ keepsTodo, trialOpen })}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={look} className={PRIMARY}>
          See what's in Pro
        </button>
        <button onClick={close} className={QUIET}>
          Got it
        </button>
      </div>
    </Card>
  )
}

/** 0.8.0: the free features first, one line for Pro, and a way to try Packed with an Undo. */
function Note080({ onClose }: { onClose: () => void }) {
  const lock = useStackableStore((s) => s.tree?.company?.lock)
  const layout = useAppearance((s) => s.appearance.layout)
  const early = usePro((s) => s.early)
  const pro = usePro((s) => hasPro(s.state))
  const todoMoved = usePro((s) => s.early && s.earlyTodo === false)
  const trialOpen = usePro((s) => s.state.kind === 'free' && !s.state.trialUsed)
  const decided = usePro((s) => !s.early || s.earlyTodo !== null)
  const text = whatsNew080({
    lockAppearance: !!lock?.appearance,
    lockImportExport: !!lock?.importExport,
    layout,
    proLine: showProLine({ hasPro: pro, early }),
    todoMoved,
    trialOpen,
  })

  const close = () => {
    prefs.setWhatsNew080Shows(-1)
    onClose()
  }
  const tryPacked = () => {
    close()
    const appearance = useAppearance.getState()
    const before = appearance.appearance.layout
    appearance.update({ layout: 'packed' })
    useStackableStore.getState().showToast({
      verb: 'Switched to',
      title: 'Packed',
      duration: 8000,
      undo: async () => useAppearance.getState().update({ layout: before }),
    })
  }

  if (!decided) return null
  return (
    <Card data="data-whats-new-080" title="What's new" onClose={close}>
      <p className="mt-1.5 leading-relaxed text-muted">{text.lead}</p>
      {text.pro && <p className="mt-1.5 leading-relaxed text-muted" data-whats-new-pro>{text.pro}</p>}
      <div className="mt-3 flex gap-2">
        {text.tryPacked && (
          <button onClick={tryPacked} className={PRIMARY} data-try-packed>
            Try Packed
          </button>
        )}
        <button onClick={close} className={text.tryPacked ? QUIET : PRIMARY}>
          Got it
        </button>
      </div>
    </Card>
  )
}
