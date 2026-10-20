import { declareBankruptcy, stashWindow } from './lib/stash'
import { uninstallUrl } from './lib/uninstall'

// Service worker (0.4.0).
// 1. On a fresh install, open a new tab so people land on Stackboard straight away: the welcome
//    screen offers to bring in their bookmarks, and the "Keep it" hint explains Chrome's
//    "Change back to Google?" prompt. Updates and reloads do nothing.
// 2. "Stash this window" runs here, from the popup (a message) or the keyboard shortcut, because
//    the popup closes itself as soon as the new tab takes focus and would cut the stash short.

// Keep in sync with FRESH_KEY in src/lib/onboarding.ts.
const FRESH_KEY = 'stackboardFresh'

// 3. (0.5.5) If the extension is removed, Chrome opens getstackboard.com/bye with our version, so
//    people learn their bookmarks are safe and can say why they left. Set on every worker start.
chrome.runtime.setUninstallURL(uninstallUrl(chrome.runtime.getManifest().version), () => void chrome.runtime.lastError)

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== chrome.runtime.OnInstalledReason.INSTALL) return
  void chrome.storage.local.set({ [FRESH_KEY]: Date.now() }).then(() => chrome.tabs.create({}))
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return
  if (msg?.type === 'bankruptcy') {
    declareBankruptcy().then((b) => reply(b ?? { tabs: 0 }), (err) => reply({ error: String(err) }))
    return true
  }
  if (msg?.type !== 'stash' || typeof msg.windowId !== 'number') return
  stashWindow(msg.windowId, { close: !!msg.close }).then(reply, (err) => reply({ error: String(err) }))
  return true // reply comes later
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'stash-window') return
  void (async () => {
    const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id
    if (typeof windowId === 'number') await stashWindow(windowId, { close: true })
  })()
})
