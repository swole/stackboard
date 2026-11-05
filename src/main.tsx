import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { useStackableStore } from './store/useStackableStore'
import { initAppearance } from './store/useAppearance'
import { initPro } from './lib/pro'
import { initArchive } from './lib/autoArchive'
import { initToday } from './lib/today'
import { initSchedule } from './lib/spaceSchedule'
import { initTodayStrip } from './lib/todayStrip'

// Dev server only: lets the browser console poke the store (fake open tabs, toasts).
if (import.meta.env.DEV) {
  ;(window as unknown as { __stackable: typeof useStackableStore }).__stackable = useStackableStore
}

// Palette, mode, density and background: theme-boot.js already put them on <html> for the first
// frame; this catches up with chrome.storage and follows the OS and other tabs from here on.
initAppearance()

// Stackboard Pro (0.7.0): license, trial and the early-user mark, checked with Polar when due.
initPro()
void initArchive()

// Due dates (0.8.0): the day moves on at local midnight in a tab left open.
initToday()

// Pro (0.9.0): the Today strip and the spaces that open by time.
initTodayStrip()
initSchedule()

// A failed bookmark write must never look like "nothing happened" (a Brave user on r/startpages,
// 2026-10-11, clicked New space and a starter pack with no effect). Show the error so people can
// quote it back; ResizeObserver loop notices and cross-origin "Script error." are noise.
const NOISE = /ResizeObserver loop|^Script error\.?$/i
function surfaceError(reason: unknown) {
  const msg = (reason instanceof Error ? reason.message : String(reason ?? '')).trim()
  if (!msg || NOISE.test(msg)) return
  console.error('Stackboard error', reason)
  useStackableStore.getState().showToast({ verb: "That didn't work:", title: msg.slice(0, 140), duration: 10000 })
}
window.addEventListener('unhandledrejection', (e) => surfaceError(e.reason))
window.addEventListener('error', (e) => surfaceError(e.error ?? e.message))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
