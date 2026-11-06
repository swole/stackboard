import { cleanKey, readSub } from './proPlan'

// After checkout, Polar sends the buyer to getstackboard.com/pro/thanks. That page reads their key
// from Polar in the buyer's own browser and hands it here (0.8.0), so nobody has to paste it. The
// key goes into sync storage exactly like a pasted one: every open new tab, and the next one to
// open, activates it through the usual path in pro.ts. The plan details (price and renewal, or Pro
// for life since 0.9.2) ride along for the Pro card. Only that one page, in a top-level tab, is
// listened to.

const ORIGIN = 'https://getstackboard.com'
const PAGE_RE = /^https:\/\/getstackboard\.com\/pro\/thanks\/?(?:[?#]|$)/

type Reply = (r: { ok: boolean }) => void

export function onProMessage(msg: unknown, sender: chrome.runtime.MessageSender, reply: Reply): boolean | undefined {
  if (sender.origin !== ORIGIN || !PAGE_RE.test(sender.url ?? '')) return undefined
  if (!sender.tab || sender.frameId !== 0) return undefined
  const m = (msg && typeof msg === 'object' ? msg : {}) as { type?: unknown; key?: unknown; plan?: unknown }
  if (m.type !== 'pro-key') return undefined
  const key = typeof m.key === 'string' ? cleanKey(m.key) : null
  if (!key) {
    reply({ ok: false })
    return undefined
  }
  const sub = readSub(m.plan, Date.now())
  chrome.storage.sync
    .set({ proKey: { key }, ...(sub ? { proSub: sub } : {}) })
    .then(
      () => reply({ ok: true }),
      () => reply({ ok: false }),
    )
  return true // the reply comes later
}
