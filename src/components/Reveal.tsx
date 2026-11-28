import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Layers } from 'lucide-react'
import { useImportSources } from './ImportPanel'
import { StackArt, Welcome } from './Welcome'
import { BookmarkIcon } from './BookmarkIcon'
import { MiniBoard } from './MiniBoard'
import { createPlannedSpace, type ImportSource } from '../lib/importChrome'
import { countPlanned } from '../lib/importPlan'
import { deleteSpace } from '../lib/bookmarks'
import { parseBookmarkTitle } from '../lib/icon'
import { displayTitle } from '../lib/title'
import { splitStackTitle } from '../lib/stackStylePlan'
import { dismissKeepHint } from '../lib/onboarding'
import { countOpenTabs, saveAllWindows } from '../lib/stash'
import { loadFreeTidy } from '../lib/tidy'
import { offerTidyCoach } from '../lib/tidyCoach'
import { tidyInput } from '../lib/tidyPlan'
import { endReveal, readRevealDue, restartReveal, useReveal } from '../lib/reveal'
import {
  REVEAL_COPY,
  REVEAL_LOOKS,
  TAB_TRICK_MIN,
  decorateForReveal,
  pickRevealSource,
  revealWorthIt,
  previewOf,
  tabsLine,
  type PreviewStack,
} from '../lib/revealPlan'
import { useStackableStore } from '../store/useStackableStore'
import { useAppearance } from '../store/useAppearance'

/**
 * The empty board (0.9.9). A fresh install with bookmarks to bring gets the reveal: its board, already
 * laid out from the bookmarks bar, and one button to keep it. Everyone else, and anyone who asks for
 * the full list, gets the welcome screen (Welcome.tsx).
 */
export function FirstRun() {
  const sources = useImportSources()
  const lockImport = useStackableStore((s) => !!s.tree?.company?.lock?.importExport)
  const [due, setDue] = useState<boolean | null>(null)
  // What the person picked on the reveal: the full import list, or a blank start.
  const [choice, setChoice] = useState<'import' | 'fresh' | null>(null)

  useEffect(() => {
    let live = true
    void readRevealDue().then((d) => live && setDue(d))
    return () => {
      live = false
    }
  }, [])

  const ready = sources !== null && due !== null
  const best = useMemo(
    () => (ready && due && !choice && !lockImport ? pickRevealSource(sources) : null),
    [ready, due, choice, lockImport, sources],
  )
  // 0.9.11: a thin folder (under 5 links) makes a weak board, so the welcome screen takes it, packs first.
  const thin = !!best && !revealWorthIt(best)
  const pick = thin ? null : best
  // Nothing to reveal here (no bookmarks, a thin folder, a company lock, or the person chose another way): done for good.
  useEffect(() => {
    if (ready && due && !pick) void endReveal()
  }, [ready, due, pick])

  // A blank canvas for the moment it takes to decide, so the welcome screen never flashes first.
  if (!ready) return <div className="h-full" aria-busy="true" />
  if (!pick) return <Welcome sources={sources} lead={choice === 'fresh' ? 'fresh' : thin ? 'packs' : 'import'} />
  return <Reveal source={pick} onChoose={setChoice} />
}

function Reveal({ source, onChoose }: { source: ImportSource; onChoose: (choice: 'import' | 'fresh') => void }) {
  const refresh = useStackableStore((s) => s.refresh)
  const selectSpace = useStackableStore((s) => s.selectSpace)
  const flashItem = useStackableStore((s) => s.flashItem)
  const celebrate = useStackableStore((s) => s.celebrate)
  const setOnboarding = useStackableStore((s) => s.setOnboarding)

  const space = useMemo(() => decorateForReveal(source.plan.space, source.kind), [source])
  const preview = useMemo(() => previewOf(space), [space])
  const total = useMemo(() => countPlanned(space), [space])
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    useReveal.getState().set({ phase: 'show' })
    return () => {
      if (useReveal.getState().phase === 'show') useReveal.getState().set({ phase: 'off' })
    }
  }, [])

  const use = async () => {
    if (progress !== null) return
    setError(null)
    setProgress(0)
    setOnboarding(true)
    // The tidy coach after Done needs to know whether the free tidy is used (storage only).
    loadFreeTidy()
    try {
      const id = await createPlannedSpace(space, (n) => setProgress(n))
      // Marked first, so nothing that waits on the reveal (the "Keep it" pill) shows while the board swaps in.
      useReveal.getState().set({ spaceId: id })
      await endReveal()
      // The reveal said it already: no "Keep it" pill on the next tabs.
      void dismissKeepHint()
      await refresh()
      selectSpace(id)
      setOnboarding(false)
      // The sheet rises once the board is on screen.
      useReveal.getState().set({ phase: 'finish' })
      flashItem(id)
      celebrate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      useReveal.getState().set({ phase: 'show', spaceId: null })
    } finally {
      setProgress(null)
      setOnboarding(false)
    }
  }

  // Both ways out end the reveal for good. Nothing is written until the person picks something on the welcome screen.
  const choose = (choice: 'import' | 'fresh') => {
    void endReveal()
    useReveal.getState().set({ phase: 'off' })
    onChoose(choice)
  }

  return (
    <div data-reveal className="relative flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] px-8 pb-40 pt-6">
          <div className="flex justify-center">
            <p
              data-reveal-keep
              className="pop-in inline-flex items-center gap-2 rounded-full bg-inverse px-4 py-1.5 text-sm text-on-inverse shadow-toast"
            >
              {REVEAL_COPY.keep}
              <span className="rounded-md bg-on-inverse/10 px-1.5 py-0.5 font-semibold text-inverse-strong">Keep it</span>
            </p>
          </div>

          <header className="mt-8 flex items-center gap-5">
            <StackArt size={64} />
            <div className="min-w-0">
              <h2
                className="rise on-wallpaper text-[34px] font-bold leading-tight tracking-tight text-strong"
                style={{ animationDelay: '120ms' }}
              >
                {REVEAL_COPY.title}
              </h2>
              <p
                data-reveal-made
                className="rise on-wallpaper mt-1 text-[15px] leading-relaxed text-muted"
                style={{ animationDelay: '200ms' }}
              >
                {REVEAL_COPY.made(source.label, total, space.stacks.length)}
              </p>
            </div>
          </header>

          <div
            data-reveal-preview
            className="mt-9 grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] items-start gap-x-6 gap-y-7"
          >
            {preview.stacks.map((st, i) => (
              <PreviewColumn key={i} stack={st} index={i} />
            ))}
          </div>
          {preview.moreStacks > 0 && (
            <p className="on-wallpaper mt-5 text-sm text-muted">{REVEAL_COPY.moreStacks(preview.moreStacks)}</p>
          )}
        </div>
      </div>

      <div
        data-reveal-actions
        className="rise absolute inset-x-0 bottom-0 border-t border-line/70 bg-canvas/85 px-8 py-4 backdrop-blur-md"
        style={{ animationDelay: '700ms' }}
      >
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-2">
          <button
            onClick={() => void use()}
            disabled={progress !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent shadow-cta transition hover:bg-accent-hover disabled:opacity-80"
          >
            {progress !== null ? REVEAL_COPY.copying(progress, total) : REVEAL_COPY.use}
            {progress === null && <ArrowRight className="h-4 w-4" />}
          </button>
          <button
            onClick={() => choose('import')}
            disabled={progress !== null}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-accent-text hover:bg-accent-soft disabled:opacity-40"
          >
            {REVEAL_COPY.choose}
          </button>
          <button
            data-reveal-fresh
            onClick={() => choose('fresh')}
            disabled={progress !== null}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-accent-text hover:bg-accent-soft disabled:opacity-40"
          >
            {REVEAL_COPY.fresh}
          </button>
          <span className="text-xs text-muted sm:ml-auto">{REVEAL_COPY.footer}</span>
          {error && <span className="w-full text-xs text-danger">Couldn’t set up the board: {error}</span>}
        </div>
      </div>
    </div>
  )
}

function PreviewColumn({ stack, index }: { stack: PreviewStack; index: number }) {
  const { icon, name } = splitStackTitle(stack.title)
  const at = 320 + index * 90
  return (
    <section data-reveal-stack className="reveal-col flex min-w-0 flex-col" style={{ animationDelay: `${at}ms` }}>
      <h3 className="mb-3 flex items-center gap-1.5 px-0.5 text-sm font-semibold text-fg">
        {icon && <span className="text-[15px] leading-none">{icon}</span>}
        <span className="truncate">{name}</span>
      </h3>
      <ul className="flex flex-col gap-1 rounded-xl border border-transparent bg-well p-1.5 wallpaper:bg-panel/55">
        {stack.links.map((l, i) => {
          const { emoji, text } = parseBookmarkTitle(l.title)
          const shown = displayTitle(text, l.url)
          return (
            <li
              key={i}
              className="reveal-card flex items-center gap-2 rounded-lg border border-transparent bg-card py-2 pl-2.5 pr-3 text-sm text-fg wallpaper:bg-card/70"
              style={{ animationDelay: `${at + 90 + i * 45}ms` }}
            >
              <BookmarkIcon emoji={emoji} title={shown} url={l.url} />
              <span className="truncate">{shown}</span>
            </li>
          )
        })}
        {stack.more > 0 && <li className="px-2.5 pb-1 pt-1.5 text-xs text-muted">{REVEAL_COPY.moreLinks(stack.more)}</li>}
      </ul>
    </section>
  )
}

/**
 * After "Use this board" (0.9.9): a sheet over the new board with the looks, and, for someone with
 * a few tabs open, an offer to stack them too. Done closes it and hands over to the tidy coach.
 */
export function RevealFinish() {
  const phase = useReveal((s) => s.phase)
  const spaceId = useReveal((s) => s.spaceId)
  const palette = useAppearance((s) => s.appearance.palette)
  const scheme = useAppearance((s) => s.scheme)
  const update = useAppearance((s) => s.update)
  const refresh = useStackableStore((s) => s.refresh)
  const flashItem = useStackableStore((s) => s.flashItem)
  const reportError = useStackableStore((s) => s.reportError)
  const [tabs, setTabs] = useState<{ tabs: number; windows: number } | null>(null)
  const [stacked, setStacked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (phase !== 'finish') return
    let live = true
    void countOpenTabs()
      .then((t) => live && setTabs(t))
      .catch(() => live && setTabs(null))
    return () => {
      live = false
    }
  }, [phase])

  if (phase !== 'finish') return null

  const close = () => {
    useReveal.getState().set({ phase: 'off' })
    // 0.9.6's coach mark on the Tidy button, for a board big enough to sort, once the sheet is gone.
    const space = useStackableStore.getState().tree?.spaces.find((s) => s.id === spaceId)
    if (space) offerTidyCoach([{ id: space.id, links: tidyInput(space).links.length }])
  }

  const undo = async () => {
    if (busy) return
    setBusy(true)
    try {
      // The mark goes back first: the empty board decides between the reveal and the welcome screen
      // as soon as the space is gone.
      await restartReveal()
      useReveal.getState().set({ phase: 'off', spaceId: null })
      if (spaceId) await deleteSpace(spaceId)
      await refresh()
    } catch (err) {
      reportError('undo the new board', err)
    } finally {
      setBusy(false)
    }
  }

  const stackTabs = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await saveAllWindows()
      await refresh()
      setStacked(r?.saved ?? 0)
      if (r) flashItem(r.spaceId)
    } catch (err) {
      reportError('save your open tabs', err)
    } finally {
      setBusy(false)
    }
  }

  const showTabs = !!tabs && tabs.tabs >= TAB_TRICK_MIN

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5">
      <section
        data-reveal-finish
        role="region"
        aria-label={REVEAL_COPY.finishTitle}
        className="sheet-up pointer-events-auto w-full max-w-[800px] rounded-2xl border border-line bg-card p-5 shadow-panel"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-strong">{REVEAL_COPY.finishTitle}</h2>
            <p className="mt-0.5 text-sm text-muted">{REVEAL_COPY.finishLooks}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void undo()}
              disabled={busy}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-soft hover:bg-hover disabled:opacity-40"
            >
              {REVEAL_COPY.undo}
            </button>
            <button
              data-reveal-done
              onClick={close}
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent shadow-cta hover:bg-accent-hover disabled:opacity-60"
            >
              {REVEAL_COPY.done}
            </button>
          </div>
        </div>

        <div role="radiogroup" aria-label="Looks" className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {REVEAL_LOOKS.map((l) => {
            const on = palette === l.palette && scheme === l.scheme
            return (
              <button
                key={`${l.palette}-${l.scheme}`}
                type="button"
                role="radio"
                aria-checked={on}
                data-reveal-look={`${l.palette}-${l.scheme}`}
                onClick={() => update({ palette: l.palette, mode: l.scheme })}
                className="group/look flex min-w-0 flex-col gap-1.5 text-left focus-visible:outline-none"
              >
                <span
                  className={`relative block aspect-[16/10] rounded-lg transition-shadow group-focus-visible/look:ring-2 group-focus-visible/look:ring-focus ${
                    on ? 'ring-2 ring-focus' : 'ring-1 ring-line group-hover/look:ring-line-strong'
                  }`}
                >
                  <MiniBoard palette={l.palette} scheme={l.scheme} />
                </span>
                <span className="truncate px-0.5 text-xs font-medium text-fg">{l.name}</span>
              </button>
            )
          })}
        </div>

        {showTabs && (
          <div data-reveal-tabs className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-well px-4 py-3">
            <Layers className="h-5 w-5 shrink-0 text-accent-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-strong">{tabsLine(tabs.tabs, tabs.windows)}</p>
              <p className="text-xs text-muted">{stacked === null ? REVEAL_COPY.tabsHint : REVEAL_COPY.stacked(stacked)}</p>
            </div>
            {stacked === null && (
              <button
                onClick={() => void stackTabs()}
                disabled={busy}
                className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-medium text-fg hover:bg-hover disabled:opacity-50"
              >
                {REVEAL_COPY.stack}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
