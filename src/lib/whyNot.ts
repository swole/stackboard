import { IS_EXTENSION } from './bookmarks'
import { whyAnswer, type WhyReason } from './nudgePlan'
import { usePro } from './pro'

// "What stopped you?" (0.9.3): the one request the corner card (components/WhyNotCard.tsx) makes,
// and only when someone picks an answer. site/api/why.js answers the store build's origin only and
// keeps the answer with nothing that identifies the person. The rules are in nudgePlan.ts.

export const WHY_API = 'https://getstackboard.com/api/why'
/** localStorage, unpacked builds only: the answer a store build would have sent (tests/e2e.mjs reads it). */
const LAST = 'stackable:whyLast'

/**
 * Sends a picked answer with the plan at the click, which checkout it was (`lifetime`: Pro for life)
 * and the version, and nothing else. Errors are ignored, and keepalive lets it finish when the tab
 * closes straight after. A build loaded unpacked (tests, development) has no update_url in its
 * manifest: it sends nothing and keeps the answer it would have sent.
 */
export function sendWhyAnswer(answer: { reason: WhyReason; note?: string; lifetime: boolean }): void {
  if (!IS_EXTENSION) return
  let manifest: chrome.runtime.Manifest
  try {
    manifest = chrome.runtime.getManifest()
  } catch {
    return
  }
  const { state, trialAuto } = usePro.getState()
  const { reason, note, plan, product, v } = whyAnswer({ ...answer, state, trialAuto, version: manifest.version })
  if (!manifest.update_url) {
    try {
      localStorage.setItem(LAST, JSON.stringify({ reason, note, plan, product, v }))
    } catch {
      // storage blocked: nothing to keep
    }
    return
  }
  void fetch(WHY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, note, plan, product, v }),
    keepalive: true,
  }).catch(() => {})
}
