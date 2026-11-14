import { useEffect, useState } from 'react'
import { WandSparkles } from 'lucide-react'
import type { Space } from '../lib/types'
import { IS_EXTENSION } from '../lib/bookmarks'
import { plural } from '../lib/importPlan'
import { usePro } from '../lib/pro'
import { acceptNotice, loadFreeTidy, loadReady, markFreeTidyUsed, noticeAccepted, requestTidy, useTidy } from '../lib/tidy'
import {
  FREE_TIDY_NOTE,
  TIDY_ERRORS,
  TIDY_LABEL,
  cleanName,
  flattenNote,
  flattenedFolders,
  isNoop,
  markSame,
  runApply,
  runUndo,
  tidyAccess,
  tidyBlock,
  tidyBody,
  tidyInput,
  type BookmarksApi,
  type PlannedStack,
  type TidyAccess,
  type TidyError,
  type TidyInput,
  type TidyLicense,
  type TidyRecord,
} from '../lib/tidyPlan'
import { useStackableStore } from '../store/useStackableStore'
import { bumpStat } from '../lib/proStats'
import { prefs } from '../lib/prefs'
import { useCorner } from '../lib/corner'
import { dropTidyCoach, useTidyCoach } from '../lib/tidyCoach'
import { openProSettings } from './CornerCard'
import { TidyCoach } from './TidyCoach'
import { Modal, PrimaryButton, SecondaryButton, TextInput } from './modals/Modal'

/** Links listed under each planned stack before "and N more". */
const SHOWN = 8

interface Run {
  input: TidyInput
  plan: PlannedStack[]
}

/**
 * 0.9.5: who can press Tidy on this board (tidyAccess in tidyPlan.ts): a paid key, the one free
 * tidy, or nobody. Whether the free tidy is used is read from storage once per page, never asked of
 * the server. Settings and the space menus use it to decide whether to ask if Tidy is on.
 */
export function useTidyAccess(): TidyAccess {
  const proReady = usePro((s) => s.ready)
  const state = usePro((s) => s.state)
  const activated = usePro((s) => !!s.license?.activationId)
  // 0.9.6: the board's locks, or the policy's real answer when that's in first (corner.ts).
  const settled = useCorner((s) => s.locks)
  const lockAi = useStackableStore((s) => !!s.tree?.company?.lock.ai) || !!settled?.ai
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro) || !!settled?.pro
  const freeUsed = useTidy((s) => s.freeUsed)
  const paid = state.kind === 'pro'
  useEffect(() => {
    if (proReady && !paid && !lockAi && !lockPro) loadFreeTidy()
  }, [proReady, paid, lockAi, lockPro])
  return proReady ? tidyAccess({ state, activated, freeUsed, lockAi, lockPro }) : null
}

/**
 * "Tidy" in the space header (Pro, 0.7.1). Shown with an active Pro key (the server checks it;
 * the trial has none), unless the server last said it's switched off. The first run explains what is sent;
 * every run shows the new stacks before anything moves, and the toast's Undo puts it all back.
 * To-do stacks, other spaces and company spaces are never touched. School mode: never under the
 * company's ai lock. 0.9.5: without a paid key, "Tidy (free once)" until the one free tidy is used
 * (it counts once the server has sorted the space), and then its toast says so, with See Pro.
 * 0.9.6: after an import, the coach mark (TidyCoach.tsx) hangs from the button, and an applied tidy
 * is a rating milestone (RatingPrompt) unless it's undone.
 */
export function TidyButton({ space }: { space: Space }) {
  const access = useTidyAccess()
  const ready = useTidy((s) => s.ready)
  const loaded = useTidy((s) => s.loaded)
  const coached = useTidyCoach((s) => s.showing && s.spaceId === space.id)
  const [step, setStep] = useState<'idle' | 'notice' | 'asking' | 'preview'>('idle')
  const [run, setRun] = useState<Run | null>(null)
  /** How the run under way started: on the paid key, or as the free tidy. */
  const [mode, setMode] = useState<'paid' | 'free'>('paid')

  // The last answer only: the server is asked when Settings or a space menu opens, never per new tab.
  // No answer yet, or one over a day old, still shows the button (0.9.0): until then a new key had no
  // Tidy until Settings opened, and it went again a day later. A run that finds it off hides it.
  useEffect(() => {
    if (access && IS_EXTENSION) void loadReady()
  }, [access])

  if (!IS_EXTENSION || space.company) return null
  const offered = !!access && loaded && ready !== false && tidyBlock(tidyInput(space)) !== 'few'
  // A run under way keeps its dialogs when the free tidy gets used up meanwhile: only the button goes.
  if (!offered && step === 'idle') return null

  const store = () => useStackableStore.getState()
  const label = `${space.emoji} ${space.name}`.trim()
  const freeNote = { ...FREE_TIDY_NOTE, onLink: openProSettings }

  const fail = (error: TidyError) => {
    store().showToast({ verb: TIDY_ERRORS[error], title: '', duration: 6000 })
    if (error === 'pro') {
      store().openModal({ kind: 'settings' })
      setTimeout(() => document.querySelector('[data-pro]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
    }
  }

  const ask = async (how: 'paid' | 'free') => {
    const input = tidyInput(space)
    let license: TidyLicense | null = null
    if (how === 'paid') {
      const held = usePro.getState().license
      if (!held?.activationId) return setStep('idle')
      license = { key: held.key, activationId: held.activationId }
    }
    if (tidyBlock(input) === 'many') {
      setStep('idle')
      return fail('too-many')
    }
    setStep('asking')
    const out = await requestTidy(tidyBody(space.name, input, license))
    if ('error' in out) {
      setStep('idle')
      return fail(out.error)
    }
    setRun({ input, plan: markSame(out.plan, input) })
    setStep('preview')
    // The server ran it, so the free tidy is used, whether or not the preview gets applied.
    if (how === 'free') void markFreeTidyUsed()
  }

  const start = async () => {
    if (step !== 'idle' || !access) return
    // 0.9.6: Tidy pressed, from the coach mark or not: the mark has done its job on this page.
    dropTidyCoach()
    setMode(access)
    if (await noticeAccepted()) await ask(access)
    else setStep('notice')
  }

  const apply = async (plan: PlannedStack[], input: TidyInput) => {
    const free = mode === 'free'
    setStep('idle')
    setRun(null)
    const api = chrome.bookmarks as unknown as BookmarksApi
    const rec: TidyRecord = { spaceId: space.id, children: [], stacks: [], renamed: [], created: [], removed: [] }
    try {
      await runApply(api, space.id, plan, input, rec)
    } catch (err) {
      // Put back whatever moved before the failure, then say what happened.
      await runUndo(api, rec).catch(() => {})
      await store().refresh()
      store().reportError(`tidy ${space.name}`, err)
      return
    }
    await store().refresh()
    void bumpStat('tidied') // 0.9.0: the trial-end recap
    // 0.9.6: a tidy that worked is a rating milestone, asked once its toast (and Undo) has gone.
    store().noteTidied()
    const skipped = rec.skipped?.length ?? 0
    store().showToast({
      verb: 'Tidied',
      title: label,
      detail: skipped
        ? `${plural(plan.length, 'stack')}. ${plural(skipped, 'link')} had moved out of the space and ${skipped === 1 ? 'was' : 'were'} left alone.`
        : plural(plan.length, 'stack'),
      duration: 10_000,
      undo: async () => {
        // Undone: not a happy moment after all, so no rating ask for it (first, before anything waits).
        prefs.clearTidyWin()
        const remade = await runUndo(api, rec)
        await store().refresh()
        // A folder Apply emptied comes back under a new id (0.8.0): open again if it was open.
        const open = store().openFolders
        store().unfoldFolders([...remade].filter(([was]) => open.has(was)).map(([, id]) => id))
        store().showToast({ verb: 'Restored', title: label, duration: 2200 })
      },
      // 0.9.5: after the free tidy, one more line: that was it, and what Pro does.
      ...(free ? { note: freeNote } : {}),
    })
  }

  // A free tidy's preview closed without Apply still used it (the server ran it), so it says so.
  const closePreview = () => {
    setStep('idle')
    setRun(null)
    if (mode === 'free') store().showToast({ verb: '', title: '', duration: 8000, note: freeNote })
  }

  return (
    <>
      {offered && (
        // 0.9.6: the wrapper anchors the coach mark under the button.
        <div className="relative flex">
          <button
            onClick={() => void start()}
            disabled={step === 'asking'}
            data-tidy-button
            data-tidy-free={access === 'free' ? '' : undefined}
            data-tidy-coached={coached ? '' : undefined}
            title="Sort this space's links into stacks with AI"
            className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-fg hover:border-line-strong hover:bg-hover disabled:opacity-60"
          >
            <WandSparkles className={`h-3.5 w-3.5 ${step === 'asking' ? 'animate-pulse' : ''}`} />
            {step === 'asking' ? 'Tidying…' : TIDY_LABEL[access === 'free' ? 'free' : 'paid']}
          </button>
          {/* Keyed by space: the header's button stays mounted across spaces, the mark must not. */}
          {step === 'idle' && access && <TidyCoach key={space.id} space={space} access={access} onSort={() => void start()} />}
        </div>
      )}

      {step === 'notice' && (
        <Modal
          title="Tidy this space"
          onClose={() => setStep('idle')}
          footer={
            <>
              <SecondaryButton onClick={() => setStep('idle')}>Cancel</SecondaryButton>
              <PrimaryButton
                data-tidy-continue
                onClick={() =>
                  void (async () => {
                    await acceptNotice()
                    await ask(mode)
                  })()
                }
              >
                Continue
              </PrimaryButton>
            </>
          }
        >
          <p data-tidy-notice className="text-sm leading-relaxed text-fg">
            Tidy sends this space's name and the titles and addresses of its links, including links in folders, to
            Stackboard's server, which asks Claude, Anthropic's AI, to sort them into stacks. Nothing is stored.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            You'll see the new stacks before anything moves, and Undo puts everything back.
          </p>
        </Modal>
      )}

      {step === 'preview' && run && (
        <TidyPreview name={space.name} run={run} onClose={closePreview} onApply={(plan) => void apply(plan, run.input)} />
      )}
    </>
  )
}

function TidyPreview(props: { name: string; run: Run; onClose: () => void; onApply: (plan: PlannedStack[]) => void }) {
  const { name, run, onClose, onApply } = props
  const [names, setNames] = useState(() => run.plan.map((p) => p.name))
  const planned = run.plan.map((p, k) => ({ ...p, name: cleanName(names[k]) }))
  const noop = isNoop(planned, run.input)
  // AI tidy flattens folders inside the stacks it reorganises (0.8.0); the preview says so first.
  const flatten = flattenNote(flattenedFolders(planned, run.input))
  const titleOf = (i: number) => run.input.links[i].title || run.input.links[i].url
  const was = new Map(run.input.stacks.map((s) => [s.id, s.title]))

  return (
    <Modal
      title={`Tidy ${name}`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton data-tidy-apply disabled={noop} onClick={() => onApply(planned)}>
            Apply
          </PrimaryButton>
        </>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-muted">
        {noop
          ? 'This space already looks tidy.'
          : `${plural(planned.length, 'stack')} for ${plural(run.input.links.length, 'link')}. Rename any stack before you apply.`}
      </p>
      {flatten && !noop && (
        <p data-tidy-flatten className="-mt-1.5 mb-3 text-xs leading-relaxed text-muted">
          {flatten}
        </p>
      )}
      <ol data-tidy-preview className="grid gap-2.5">
        {run.plan.map((p, k) => {
          const keeps = p.sameAs ? (was.get(p.sameAs) === planned[k].name ? 'Unchanged' : 'Same links') : null
          return (
            <li key={k} data-tidy-stack className="rounded-lg border border-line bg-card p-2.5">
              <div className="flex items-center gap-2">
                <TextInput
                  value={names[k]}
                  maxLength={40}
                  aria-label={`Name of stack ${k + 1}`}
                  onChange={(e) => setNames((n) => n.map((v, i) => (i === k ? e.target.value : v)))}
                />
                {keeps && (
                  <span data-tidy-same className="shrink-0 rounded bg-selected px-1.5 py-0.5 text-[11px] text-soft">
                    {keeps}
                  </span>
                )}
              </div>
              <ul className="mt-2 grid gap-0.5 px-0.5 text-xs text-muted">
                {p.links.slice(0, SHOWN).map((i) => (
                  <li key={i} className="truncate">
                    {titleOf(i)}
                  </li>
                ))}
                {p.links.length > SHOWN && <li className="text-faint">and {p.links.length - SHOWN} more</li>}
              </ul>
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
