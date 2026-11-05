import { archiveIdleTabs, declareBankruptcy, stashWindow } from './lib/stash'
import { uninstallUrl } from './lib/uninstall'
import { PRO_VERSION, compareVersions } from './lib/proPlan'
import { onShareMessage } from './lib/shareWorker'
import { onProMessage } from './lib/proHandoff'
import { readTree } from './lib/bookmarks'
import { readCompany, watchCompany } from './lib/company'
import { goEntries, goSuggestions, looksLikeUrl, rankGo, searchDisposition, type GoEntry } from './lib/goLinks'
import { forgetTab, noteActivated, startTabSeen } from './lib/tabSeen'
import { PACKED_VERSION, rowsForOldBoard } from './lib/appearance'

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

// Keep in sync with EARLY_KEY in src/lib/pro.ts.
const EARLY_KEY = 'proEarly'
// Keep in sync with STORAGE_KEY in src/store/useAppearance.ts.
const APPEARANCE_KEY = 'appearance'

/**
 * 7. (0.8.0) Packed stacks are the default for new installs only. A board updated from before
 *    0.8.0 keeps Rows: the saved settings get layout Rows (or just that, when none were saved),
 *    and a layout someone picked stays. The page's boot copy can't be written from here, but one
 *    from before 0.8.0 has no layout and reads as Rows too (parseSavedAppearance).
 */
async function keepRows(previousVersion: string): Promise<void> {
  if (compareVersions(previousVersion, PACKED_VERSION) >= 0) return
  const saved = (await chrome.storage.local.get(APPEARANCE_KEY))[APPEARANCE_KEY]
  const next = rowsForOldBoard(saved)
  if (next) await chrome.storage.local.set({ [APPEARANCE_KEY]: next })
}

// Keep in sync with WHATS_NEW_080_KEY and WHATS_NEW_090_KEY in src/components/WhatsNew.tsx.
const WHATS_NEW_080_KEY = 'whatsNew080'
const WHATS_NEW_090_KEY = 'whatsNew090'

/** 8. (0.8.0) An update from before 0.8.0 marks this computer for the 0.8.0 what's-new note. */
async function markWhatsNew080(previousVersion: string): Promise<void> {
  if (compareVersions(previousVersion, PACKED_VERSION) >= 0) return
  await chrome.storage.local.set({ [WHATS_NEW_080_KEY]: { from: previousVersion, at: Date.now() } })
}

/** 9. (0.9.0) An update from before 0.9.0 marks this computer for the 0.9.0 what's-new note. */
async function markWhatsNew090(previousVersion: string): Promise<void> {
  if (compareVersions(previousVersion, '0.9.0') >= 0) return
  await chrome.storage.local.set({ [WHATS_NEW_090_KEY]: { from: previousVersion, at: Date.now() } })
}

chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  // 4. (0.7.0) An update from a version before Pro marks an early user: to-do lists stay free
  //    and Pro costs the early price. The mark syncs, so their other computers know too.
  if (reason === chrome.runtime.OnInstalledReason.UPDATE) {
    if (previousVersion && compareVersions(previousVersion, PRO_VERSION) < 0) {
      void chrome.storage.sync.set({ [EARLY_KEY]: { from: previousVersion, at: Date.now() } }).catch(() => {})
    }
    if (previousVersion) void keepRows(previousVersion).catch(() => {})
    if (previousVersion) void markWhatsNew080(previousVersion).catch(() => {})
    if (previousVersion) void markWhatsNew090(previousVersion).catch(() => {})
    return
  }
  if (reason !== chrome.runtime.OnInstalledReason.INSTALL) return
  void chrome.storage.local.set({ [FRESH_KEY]: Date.now() }).then(() => chrome.tabs.create({}))
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return
  if (msg?.type === 'bankruptcy') {
    declareBankruptcy().then((b) => reply(b ?? { tabs: 0 }), (err) => reply({ error: String(err) }))
    return true
  }
  // 5. (0.7.0) Auto-archive, asked for by a new tab when Pro is on (lib/autoArchive.ts).
  if (msg?.type === 'archive' && typeof msg.afterMs === 'number' && msg.afterMs > 0) {
    archiveIdleTabs(msg.afterMs).then(reply, (err) => reply({ error: String(err) }))
    return true
  }
  // 6. (0.8.0) Go links, asked by the e2e suite and anything else of ours that wants the same answer.
  if (msg?.type === 'go-suggest' && typeof msg.text === 'string') {
    loadGo(!!msg.fresh).then((entries) => reply(goSuggestions(msg.text, entries)), (err) => reply({ error: String(err) }))
    return true
  }
  if (msg?.type === 'go-open' && typeof msg.text === 'string') {
    openGo(msg.text, 'newForegroundTab', !!msg.fresh).then(reply, (err) => reply({ error: String(err) }))
    return true
  }
  // 7. (0.8.0) The e2e suite plays an update from an older version here: the same step the
  //    update runs. Unpacked builds only (a store build always has an update_url).
  //    `whatsNew: true` also plays the what's-new mark, which the other update tests leave out.
  if (msg?.type === 'e2e-updated-from' && typeof msg.previousVersion === 'string' && !('update_url' in chrome.runtime.getManifest())) {
    Promise.all([
      keepRows(msg.previousVersion),
      msg.whatsNew === true ? markWhatsNew080(msg.previousVersion) : null,
      msg.whatsNew090 === true ? markWhatsNew090(msg.previousVersion) : null,
    ])
      .then(() => reply({ ok: true }), (err) => reply({ error: String(err) }))
    return true
  }
  if (msg?.type !== 'stash' || typeof msg.windowId !== 'number') return
  stashWindow(msg.windowId, { close: !!msg.close }).then(reply, (err) => reply({ error: String(err) }))
  return true // reply comes later
})

// 6. (0.8.0) Shared stacks: getstackboard.com/s asks whether Stackboard is here, then adds a
//    stack (the person confirms in a Stackboard tab) or opens its links (lib/shareWorker.ts).
chrome.runtime.onMessageExternal.addListener(onShareMessage)
// The thanks page after a Pro purchase hands the buyer's key over (lib/proHandoff.ts).
chrome.runtime.onMessageExternal.addListener(onProMessage)
// Auto-archive (0.7.0): needs to know when each tab was left, because Chrome's lastAccessed only
//    moves when a tab comes on screen (lib/tabSeen.ts). Session storage, this computer only, and
//    since 0.8.0 only while auto-archive is on: for everyone else a tab switch writes nothing.
void startTabSeen().catch(() => {})
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => void noteActivated(tabId, windowId).catch(() => {}))
chrome.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId).catch(() => {}))

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'stash-window') return
  void (async () => {
    const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id
    if (typeof windowId === 'number') await stashWindow(windowId, { close: true })
  })()
})

// 6. (0.8.0, Teams T6) Go links: "go jira" in the address bar. Names from the company's policy
//    come first, then every link on the board and in the company spaces, by title. The board is
//    read again at most every 15 s, so typing stays quick.
const GO_FRESH_MS = 15_000
let goCache: { at: number; entries: GoEntry[] } | null = null

async function loadGo(fresh = false): Promise<GoEntry[]> {
  if (!fresh && goCache && Date.now() - goCache.at < GO_FRESH_MS) return goCache.entries
  const [own, company] = await Promise.all([readTree().catch(() => null), readCompany().catch(() => null)])
  const entries = goEntries(company?.config.goLinks ?? [], [...(company?.spaces ?? []), ...(own?.spaces ?? [])])
  goCache = { at: Date.now(), entries }
  return entries
}

/**
 * Opens a picked suggestion (its address) or the best match for the words. With no match the words
 * go to the person's own default search engine, as if typed without "go" (the `search` permission,
 * which adds no install warning).
 */
async function openGo(text: string, disposition: string, fresh = false): Promise<{ url?: string; searched?: string }> {
  const t = text.trim()
  let url: string | null = null
  if (looksLikeUrl(t)) url = t
  else if (t) url = rankGo(t, await loadGo(fresh), 1)[0]?.url ?? null
  if (!url && t) {
    await chrome.search.query({ text: t, disposition: searchDisposition(disposition) as chrome.search.Disposition })
    return { searched: t }
  }
  url ??= chrome.runtime.getURL('newtab.html')
  if (disposition === 'newForegroundTab') await chrome.tabs.create({ url, active: true })
  else if (disposition === 'newBackgroundTab') await chrome.tabs.create({ url, active: false })
  else await chrome.tabs.update({ url })
  return { url }
}

chrome.omnibox?.setDefaultSuggestion({ description: 'Open the Stackboard link that best matches <match>%s</match>, or search the web for it' })
chrome.omnibox?.onInputChanged.addListener((text, suggest) => {
  void loadGo().then((entries) => suggest(goSuggestions(text, entries)), () => suggest([]))
})
chrome.omnibox?.onInputEntered.addListener((text, disposition) => {
  void openGo(text, disposition).catch(() => {})
})
// A policy change (the admin edits the company board) reaches the worker too: watchCompany also
// forgets company.ts's read of managed storage, which the worker would otherwise keep for good.
watchCompany(() => (goCache = null))
chrome.bookmarks.onChanged.addListener(() => (goCache = null))
chrome.bookmarks.onCreated.addListener(() => (goCache = null))
chrome.bookmarks.onRemoved.addListener(() => (goCache = null))
