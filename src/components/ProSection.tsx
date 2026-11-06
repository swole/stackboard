import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, Crown, KeyRound, Sparkles } from 'lucide-react'
import { PrimaryButton, SecondaryButton, TextInput } from './modals/Modal'
import { openCheckout, usePro } from '../lib/pro'
import { loadReady, refreshTidyReady, useTidy } from '../lib/tidy'
import { FOUNDING_ENDS, LIFETIME_PRICE, PORTAL_URL, checkoutPending, keepsTodoFree, proCard, type PauseReason } from '../lib/proPlan'
import { openInNewTab } from '../lib/tabs'
import { ArchiveSetting } from './ArchiveSetting'
import { TodayStripSetting } from './TodayStripSetting'
import { ScheduleSetting } from './ScheduleSetting'
import { useTwoStep } from '../hooks/useTwoStep'
import { SnapshotsPanel } from './SnapshotsPanel'
import { AiFileSetting } from './AiFileSetting'
import { CleanupScanEntry } from './CleanupUpsell'
import { useStackableStore } from '../store/useStackableStore'

// Settings > Stackboard Pro (0.7.0). The only place Pro is sold: no locked buttons on the board.
// School mode: under the company's pro lock Settings shows its managed line in place of this, unless
// a paid key is active here; then this shows the Pro card, which has no buy, trial or renew button.

const PAUSED: Record<PauseReason, string> = {
  ended: 'Your Pro subscription has ended, so Pro features are paused. Everything you made is still here.',
  disabled: 'This key has been turned off, so Pro features are paused. Everything you made is still here.',
  'unknown-key': "Polar doesn't recognise this key, so Pro features are paused.",
  'device-limit': 'This key is already on five computers. Remove one under Manage subscription, then try again.',
  removed: 'This computer was removed from your key, so Pro is paused here.',
  offline: "Stackboard couldn't check your key for two weeks, so Pro is paused until it can.",
  checking: 'Checking your key...',
}

/** `tidy`: the server last said AI tidy is on (0.7.1), so Settings only lists it while it works. */
function features(keepsTodo: boolean, tidy: boolean, trial: boolean): string[] {
  return [
    'Idle tabs archive themselves into a dated stack',
    'A snapshot of your board every day, ready to restore',
    'Clean up duplicates, unused links and links that no longer load',
    ...(keepsTodo ? [] : ['To-do lists as stacks']),
    'Due dates, repeating items and a Today list',
    // AI tidy runs on a paid key only: the server can't check a trial, and each run costs money.
    ...(tidy ? [trial ? 'AI tidy, with a Pro key: sorts a messy space into stacks in one click' : 'AI tidy: sorts a messy space into stacks in one click'] : []),
    'More looks: your own accent colour, fonts, tile sizes and wallpapers',
  ]
}

function priceNote(early: boolean, keepsTodo: boolean, now: number): string {
  if (early && keepsTodo) return "You've had Stackboard since before Pro, so your to-do lists stay free and Pro is $2.99 a year for as long as you keep it. Thanks for being early!"
  if (early) return "You've had Stackboard since before Pro, so Pro is $2.99 a year for as long as you keep it. Thanks for being early!"
  if (now <= FOUNDING_ENDS) return "Founding price: $2.99 a year if you join by 31 December, and it stays $2.99 while you keep Pro. After that it's $4.99."
  return 'Pro is $4.99 a year.'
}

export function ProSection() {
  const ready = usePro((s) => s.ready)
  const early = usePro((s) => s.early)
  const keepsTodo = usePro((s) => keepsTodoFree(s))
  const state = usePro((s) => s.state)
  const license = usePro((s) => s.license)
  const busy = usePro((s) => s.busy)
  const note = usePro((s) => s.note)
  const sub = usePro((s) => s.sub)
  const checkoutAt = usePro((s) => s.checkoutAt)
  const checkoutLifetime = usePro((s) => s.checkoutLifetime)
  const trialAuto = usePro((s) => s.trialAuto)
  const { activate, check, remove, startTrial } = usePro.getState()
  const [key, setKey] = useState('')
  const tidyReady = useTidy((s) => s.ready)
  // School mode: with the company's ai lock, AI tidy is neither listed nor asked about.
  const aiLocked = useStackableStore((s) => !!s.tree?.company?.lock.ai)
  const hasKey = state.kind === 'pro' && !!license?.activationId
  // What this computer last heard from the server (reading it sends nothing). With an active key,
  // opening Settings also asks the server, at most once a day.
  useEffect(() => {
    if (aiLocked) return
    void loadReady()
    refreshTidyReady(hasKey)
  }, [hasKey, aiLocked])
  // Removing the key takes Pro off every computer on the Chrome profile, so it asks twice.
  const removing = useTwoStep(4000)
  const now = Date.now()
  const buy = () => openCheckout('settings')
  const portal = () => void openInNewTab(PORTAL_URL, true)
  // 0.9.2: Pro for life, one quiet line under the buy buttons (never in the finishing steps).
  const lifetimeLine = (
    <p className="mt-1.5 text-[11px] text-muted" data-pro-lifetime>
      Prefer to pay once?{' '}
      <button
        type="button"
        onClick={() => openCheckout('settings-lifetime', { lifetime: true })}
        className="font-medium text-fg underline underline-offset-2 hover:text-accent-text"
      >
        Get Pro for life
      </button>{' '}
      for {LIFETIME_PRICE}.
    </p>
  )
  // Pro switching on while Settings is open (a key pasted here, or one that arrived from another
  // tab or computer) gets a thank-you on the card and a toast.
  const [welcome, setWelcome] = useState(false)
  const wasPro = useRef<boolean | null>(null)
  useEffect(() => {
    if (!ready) return
    const isPro = state.kind === 'pro'
    if (wasPro.current === false && isPro) {
      setWelcome(true)
      useStackableStore.getState().showToast({ verb: 'Switched on', title: 'Stackboard Pro', duration: 4000 })
    }
    wasPro.current = isPro
  }, [ready, state.kind])

  if (!ready) return null
  const pending = checkoutPending(checkoutAt, now)

  const onActivate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await activate(key)) setKey('')
  }

  const removeButton = (
    <SecondaryButton
      onClick={() => {
        if (!removing.armed) return removing.arm()
        removing.disarm()
        void remove()
      }}
      disabled={busy}
      data-pro-remove
    >
      {removing.armed ? 'Click again: remove from all your computers' : 'Remove key'}
    </SecondaryButton>
  )

  const keyForm = (
    <form onSubmit={onActivate} className="mt-3 flex gap-2" data-pro-key>
      <TextInput
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Have a key? Paste it here (SB-...)"
        aria-label="License key"
        spellCheck={false}
        autoComplete="off"
      />
      {pending ? (
        <PrimaryButton type="submit" disabled={busy || !key.trim()}>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <KeyRound className="h-3.5 w-3.5" />
            Activate
          </span>
        </PrimaryButton>
      ) : (
        <SecondaryButton type="submit" disabled={busy || !key.trim()}>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <KeyRound className="h-3.5 w-3.5" />
            Activate
          </span>
        </SecondaryButton>
      )}
    </form>
  )

  const findKey = (
    <p className="mt-1.5 text-[11px] text-faint" data-pro-find-key>
      Bought Pro? Your key is behind Access purchase in Polar's email, or in{' '}
      <button type="button" onClick={portal} className="underline underline-offset-2 hover:text-fg">
        Polar's customer portal
      </button>
      .
    </p>
  )

  return (
    <section data-pro={state.kind}>
      <h3 className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {state.kind === 'pro' ? <Crown className="h-3.5 w-3.5 text-accent-text" /> : <Sparkles className="h-3.5 w-3.5" />}
        Stackboard Pro
      </h3>

      {state.kind === 'pro' && license && (() => {
        const card = proCard({ license, sub, now })
        return (
          <div className="mt-1 rounded-lg border border-accent-line bg-accent-soft/50 p-3" data-pro-card>
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent" aria-hidden>
                <Crown className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-strong">Stackboard Pro</span>
                  <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-on-accent" data-pro-active>
                    Active
                  </span>
                  {early && (
                    <span className="rounded-full border border-accent-line px-1.5 py-px text-[10px] font-medium text-accent-text">
                      Early supporter
                    </span>
                  )}
                </div>
                {card.plan && (
                  <div className="text-xs text-muted" data-pro-plan>
                    {card.plan}
                  </div>
                )}
              </div>
            </div>
            {welcome && (
              <p className="mt-2 text-xs font-medium text-fg" data-pro-welcome>
                Pro is on. Thank you for backing Stackboard!
              </p>
            )}
            <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs" data-pro-details>
              {card.rows.map((r) => (
                <Fragment key={r.label}>
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="truncate text-fg">{r.label === 'Key' ? <code>{r.value}</code> : r.value}</dd>
                </Fragment>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <SecondaryButton onClick={portal}>{sub?.lifetime ? 'Manage purchase' : 'Manage subscription'}</SecondaryButton>
              {removeButton}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              {sub?.lifetime
                ? "Your receipt and the computers on your key are in Polar's customer portal."
                : "Invoices, your card and cancelling are in Polar's customer portal."}
            </p>
          </div>
        )
      })()}

      {state.kind === 'paused' && (
        <>
          <p className="mb-2 text-xs text-muted" data-pro-reason={state.reason}>
            {PAUSED[state.reason]}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.reason === 'ended' && <PrimaryButton onClick={buy}>Renew Pro</PrimaryButton>}
            {state.reason === 'removed' && (
              <PrimaryButton onClick={() => void check(true)} disabled={busy}>
                Activate on this computer
              </PrimaryButton>
            )}
            {(state.reason === 'device-limit' || state.reason === 'offline' || state.reason === 'checking' || state.reason === 'unknown-key') && (
              <SecondaryButton onClick={() => void check(true)} disabled={busy}>
                {busy ? 'Checking...' : 'Check again'}
              </SecondaryButton>
            )}
            {(state.reason === 'device-limit' || state.reason === 'disabled') && (
              <SecondaryButton onClick={portal}>Manage subscription</SecondaryButton>
            )}
            {/* On a sixth computer, or one removed in the portal, the key still works on the others:
                no Remove here, it would take Pro off all of them. */}
            {state.reason !== 'device-limit' && state.reason !== 'removed' && removeButton}
          </div>
          {state.reason === 'ended' && lifetimeLine}
        </>
      )}

      {(state.kind === 'free' || state.kind === 'trial') && pending && (
        <div className="mt-1 rounded-lg border border-accent-line bg-accent-soft/50 p-3" data-pro-pending>
          <div className="text-sm font-semibold text-strong">Finish setting up Pro</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-xs text-fg">
            <li>Finish paying in the Polar tab.</li>
            <li>Copy your key (it starts with SB-). Polar shows it once you've paid, and the Access purchase button in Polar's email opens it again.</li>
            <li>Paste it below and click Activate.</li>
          </ol>
          {keyForm}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <button type="button" onClick={portal} className="underline underline-offset-2 hover:text-fg">
              Find my key
            </button>
            <button
              type="button"
              onClick={() => openCheckout('settings-pending', { lifetime: checkoutLifetime })}
              className="underline underline-offset-2 hover:text-fg"
            >
              Back to checkout
            </button>
          </div>
          {/* Someone who opened the checkout to look, then came back, can still try it first. */}
          {state.kind === 'free' && !state.trialUsed && (
            <p className="mt-2 text-xs text-fg" data-pro-pending-trial>
              Not ready to pay?{' '}
              <button type="button" onClick={() => void startTrial()} className="font-semibold text-accent-text underline underline-offset-2">
                Try it free for 14 days
              </button>
              , no card needed.
            </p>
          )}
        </div>
      )}

      {(state.kind === 'free' || state.kind === 'trial') && !pending && (
        <>
          {state.kind === 'trial' ? (
            <p className="mb-2 text-xs text-fg" data-pro-trial-line={trialAuto ? 'auto' : 'opt-in'}>
              {trialAuto ? 'Your free Pro trial started when you added Stackboard: ' : 'Pro trial: '}
              {state.daysLeft} day{state.daysLeft === 1 ? '' : 's'} left. When it ends, Pro features pause and everything you
              made stays.
            </p>
          ) : state.trialUsed ? (
            <p className="mb-2 text-xs text-fg">Your trial has ended, so Pro features are paused. Everything you made is still here.</p>
          ) : null}
          <ul className="mb-2 grid gap-1 text-xs text-fg">
            {features(keepsTodo, tidyReady === true && !aiLocked, state.kind === 'trial').map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mb-2 text-xs text-muted">{priceNote(early, keepsTodo, now)}</p>
          {/* Never tried: the trial leads, as on every other Pro button (0.9.1). After the trial, Get Pro leads. */}
          <div className="flex flex-wrap gap-2">
            {state.kind === 'free' && !state.trialUsed ? (
              <>
                <PrimaryButton onClick={() => void startTrial()} data-pro-trial>
                  Try it free for 14 days
                </PrimaryButton>
                <SecondaryButton onClick={buy}>Get Pro</SecondaryButton>
              </>
            ) : (
              <PrimaryButton onClick={buy}>Get Pro</PrimaryButton>
            )}
          </div>
          {/* Never tried only: a trial that started by itself on install must never hear this. */}
          {state.kind === 'free' && !state.trialUsed && (
            <p className="mt-1.5 text-[11px] text-faint">No card needed for the trial, and it never starts by itself.</p>
          )}
          {lifetimeLine}
        </>
      )}

      {state.kind !== 'pro' && !((state.kind === 'free' || state.kind === 'trial') && pending) && (
        <>
          {keyForm}
          {findKey}
        </>
      )}
      {note && <p className="mt-1.5 text-xs text-danger">{note}</p>}

      {(state.kind === 'pro' || state.kind === 'trial') && (
        <>
          <ArchiveSetting />
          <TodayStripSetting />
          <ScheduleSetting />
          <AiFileSetting />
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-fg">Clean up</div>
            <p className="mb-2 text-xs text-muted">Find links saved twice, links you never open and links that no longer load.</p>
            <SecondaryButton onClick={() => useStackableStore.getState().openModal({ kind: 'cleanup' })} data-cleanup-open>
              Clean up your board
            </SecondaryButton>
          </div>
          <SnapshotsPanel canTake />
          <p className="mt-3 text-xs text-muted">Pro looks (accent colour, fonts, tile size, wallpapers) are under Appearance.</p>
        </>
      )}
      {/* 0.9.0: the clean-up scan is free; removing links is Pro. */}
      {state.kind !== 'pro' && state.kind !== 'trial' && <CleanupScanEntry />}
      {/* Snapshots already taken stay reachable when Pro pauses: they are the person's own board. */}
      {state.kind !== 'pro' && state.kind !== 'trial' && <SnapshotsPanel canTake={false} />}
    </section>
  )
}
