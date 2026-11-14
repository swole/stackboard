import { useEffect, useRef, useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { IS_EXTENSION } from '../lib/bookmarks'
import { useCorner } from '../lib/corner'
import {
  WHY_NOTE_MAX,
  WHY_NOT_DELAY_MS,
  WHY_NOT_THANKS_MS,
  WHY_PRICE_OFFER,
  WHY_REASONS,
  reverseCardTitle,
  showWhyNot,
  whyNotOffersPrice,
  whyNotOffersTrial,
  type WhyReason,
} from '../lib/nudgePlan'
import { prefs } from '../lib/prefs'
import { openCheckout, usePro } from '../lib/pro'
import { sendWhyAnswer } from '../lib/whyNot'
import { CornerCard, PRIMARY } from './CornerCard'
import { TextInput } from './modals/Modal'

/** The answers: small outlined buttons that wrap inside the card. */
const CHOICE = 'rounded-full border px-2.5 py-1 text-xs hover:border-accent-line hover:text-strong'

/**
 * "What stopped you?" (0.9.3): this computer opened the checkout 10 minutes to 7 days ago and came
 * back without buying, so one corner card asks why, with five one-tap answers and a line to type
 * with Something else (the rules: showWhyNot in nudgePlan.ts). Decided once per tab, a beat after the
 * reverse-trial card, so every card that decides earlier goes first; it waits while the rating ask is
 * on screen. Once per checkout, answered or not, and on three checkouts at most. Only a picked answer
 * leaves the device (lib/whyNot.ts); the close button sends nothing. 0.9.4: The price, while the
 * founding price lasts, brings the founding offer on Pro for life (whyNotOffersPrice), and the card
 * waits for them.
 */
export function WhyNotCard({ welcoming }: { welcoming: boolean }) {
  const loaded = useStackableStore((s) => !!s.tree)
  const ready = usePro((s) => s.ready)
  const paid = usePro((s) => s.state.kind === 'pro')
  const ratingOpen = useCorner((s) => s.ratingOpen)
  /** The checkout it asks about; `lifetime` when it was Pro for life. */
  const [card, setCard] = useState<{ lifetime: boolean } | null>(null)
  const [other, setOther] = useState(false)
  const [note, setNote] = useState('')
  /** After an answer: whether it offers the trial, the line once the trial is on, and the founding offer (0.9.4). */
  const [done, setDone] = useState<{ trial: boolean; on?: string; offer?: boolean } | null>(null)
  const decided = useRef(false)
  // Read when the card decides: the welcome screen stays up while it fills the board.
  const welcome = useRef(welcoming)
  welcome.current = welcoming
  // 0.9.6: the company policy has answered (corner.ts); the card doesn't decide before that.
  const settled = useCorner((s) => s.locks !== null)

  useEffect(() => {
    if (decided.current || !loaded || !ready || !settled || !IS_EXTENSION) return
    const id = setTimeout(() => {
      decided.current = true
      const { state, checkoutAt, checkoutLifetime } = usePro.getState()
      const corner = useCorner.getState()
      const due = showWhyNot({
        state,
        checkoutAt,
        now: Date.now(),
        askedAt: prefs.whyNotAt(),
        asked: prefs.whyNotAsked(),
        welcoming: welcome.current,
        ratingOpen: corner.ratingOpen,
        // School mode: the company's pro lock, from the policy's real answer (0.9.6).
        lockPro: !!corner.locks?.pro,
      })
      // A tab where another card got there first goes without; a later tab can still ask.
      if (!due || !checkoutAt || !corner.claim('whyNot')) return
      prefs.markWhyNot(checkoutAt)
      setCard({ lifetime: checkoutLifetime })
    }, WHY_NOT_DELAY_MS)
    return () => clearTimeout(id)
  }, [loaded, ready, settled])

  const close = () => {
    setCard(null)
    useCorner.getState().release('whyNot')
  }

  // The thanks closes itself, unless it's offering the trial or the founding offer: the X closes those.
  useEffect(() => {
    if (!done || (done.trial && !done.on) || done.offer) return
    const id = setTimeout(close, WHY_NOT_THANKS_MS)
    return () => clearTimeout(id)
  }, [done])

  // Pro switched on meanwhile (a key from the thanks page, say): nothing is left to ask.
  useEffect(() => {
    if (paid && card) close()
  }, [paid, card])

  if (!card || welcoming || ratingOpen) return null

  const answer = (reason: WhyReason) => {
    if (done) return
    sendWhyAnswer({ reason, note, lifetime: card.lifetime })
    const { trialStartedAt } = usePro.getState()
    const lockPro = !!useCorner.getState().locks?.pro
    setDone({ trial: whyNotOffersTrial({ reason, trialStartedAt, lockPro }), offer: whyNotOffersPrice({ reason, now: Date.now(), lockPro }) })
  }
  // The founding offer's own checkout, which counts as Pro for life (pro.ts openCheckout).
  const getOffer = () => {
    close()
    openCheckout('why-price-offer', { offer: true })
  }
  const startTrial = async () => {
    await usePro.getState().startTrial()
    const at = usePro.getState().trialStartedAt
    if (at) setDone({ trial: true, on: `${reverseCardTitle(at)}.` })
    else close()
  }

  return (
    <CornerCard data={{ 'data-why-not': '' }} onClose={close}>
      <h3 className="flex items-center gap-1.5 pr-6 font-semibold text-strong">
        <MessageCircleQuestion className="h-4 w-4 text-accent-text" />
        Didn't get Pro?
      </h3>
      {done ? (
        <>
          <p className="mt-1.5 leading-relaxed text-muted" data-why-thanks>
            Thanks, that helps.
          </p>
          {done.offer ? (
            <>
              <p className="mt-1.5 leading-relaxed text-fg" data-why-offer>
                {WHY_PRICE_OFFER.line}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={getOffer} className={PRIMARY} data-why-offer-buy>
                  {WHY_PRICE_OFFER.button}
                </button>
              </div>
            </>
          ) : done.on ? (
            <p className="mt-1.5 font-medium text-fg" data-why-trial-on>
              {done.on}
            </p>
          ) : (
            done.trial && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => void startTrial()} className={PRIMARY} data-why-trial>
                  Start the free trial
                </button>
              </div>
            )
          )}
        </>
      ) : (
        <>
          <p className="mt-1.5 leading-relaxed text-muted">What stopped you? One tap, and it's optional.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {WHY_REASONS.map(({ reason, label }) => {
              const open = reason === 'other' && other
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => (reason === 'other' ? setOther(true) : answer(reason))}
                  aria-pressed={reason === 'other' ? other : undefined}
                  className={`${CHOICE} ${open ? 'border-accent-line bg-accent-soft text-strong' : 'border-line bg-card text-fg'}`}
                  data-why-reason={reason}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {other && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                answer('other')
              }}
              className="mt-2 flex gap-2"
              data-why-note
            >
              <TextInput
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={WHY_NOTE_MAX}
                placeholder="Anything to add? (optional)"
                aria-label="Anything to add?"
                className="min-w-0"
              />
              <button type="submit" className={`${PRIMARY} shrink-0`}>
                Send
              </button>
            </form>
          )}
        </>
      )}
    </CornerCard>
  )
}
