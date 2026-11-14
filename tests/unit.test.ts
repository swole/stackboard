import { displayTitle, splitTitle } from '../src/lib/title'
import { urlKey, buildIndex, findOpenTab, sameIndex } from '../src/lib/openTabs'
import { parseBookmarkTitle } from '../src/lib/icon'
import { monogram } from '../src/lib/favicon'
import { planFolder, isImportableUrl, countPlanned, type FolderNode } from '../src/lib/importPlan'
import { installedAt, shouldAskForRating } from '../src/lib/onboarding'
import { STARTER_PACKS } from '../src/lib/starterPacks'
import { batchFlags } from '../src/lib/fresh'
import { bankruptcyStackTitle, certificateText, planSelected, planStash, staysNote } from '../src/lib/stashPlan'
import { ARCHIVE_AFTER, archiveStackTitle, archivedNote, isIdle, parseArchiveAfter, planArchive } from '../src/lib/archivePlan'
import { tracksTabs } from '../src/lib/tabSeen'
import { WHATS_NEW_SHOWS, pickWhatsNew, proNoteText, showProLine, stillPending, whatsNew080 } from '../src/lib/whatsNewPlan'
import {
  UNUSED_MS,
  checkTargets,
  countingNote,
  duplicatesSummary,
  extraCopies,
  findDuplicates,
  findUnused,
  groupBySite,
  isCheckable,
  isUnused,
  lastOpened,
  locationLabel,
  looksOffline,
  normalizeUrl,
  openedWords,
  readCheckError,
  removeButtonLabel,
  secondProbe,
  siteOf,
  skippedNote,
  stillCounting,
  unreachableLinks,
  unusedSummary,
  type CleanLink,
} from '../src/lib/cleanupPlan'
import {
  BLUR_MAX,
  DEFAULT_APPEARANCE,
  DIM_MAX,
  PALETTES,
  PALETTE_TOKENS,
  bootMirror,
  mergeAppearance,
  onlyScheme,
  parseAppearance,
  resolveScheme,
  settingsFromMirror,
  variantName,
} from '../src/lib/appearance'
import { spaceIndexForKey } from '../src/lib/shortcuts'
import {
  SNAPSHOT_KEEP_SHRUNK,
  countBackup,
  countSpace,
  countsText,
  dayKey,
  dayLabel,
  isEmptyBoard,
  keysToPrune,
  parseSnapshot,
  restoredName,
  shortDay,
  sortSnapshots,
  summaryLine,
  type Snapshot,
} from '../src/lib/snapshotPlan'
import type { BookmarkBackup } from '../src/lib/types'
import { UNINSTALL_PAGE, uninstallUrl } from '../src/lib/uninstall'
import {
  ORPHAN_GRACE_MS,
  TODO_MAX_ITEMS,
  TODO_MAX_TEXT,
  TodoFullError,
  addItem,
  cleanText,
  clearDone,
  countOpen,
  editItem,
  emptyList,
  listBytes,
  newTodoId,
  ordered,
  parseList,
  planSweep,
  removeItem,
  restoreItem,
  todoIdFromUrl,
  todoKey,
  todoMarkerUrl,
  toggleItem,
  dueBytes,
  mergeDue,
  parseDue,
  splitDue,
  todoDueKey,
  type TodoList,
} from '../src/lib/todoPlan'
import {
  addDays,
  checkItem,
  countDue,
  dueForBackup,
  dueFromBackup,
  dueLabel,
  dueToday,
  isDue,
  isOverdue,
  localDay,
  nextDue,
  parseDay,
  quickDay,
  setDue,
  setRepeat,
  spokenDue,
  stepDue,
  unrollItem,
} from '../src/lib/duePlan'
import { glyphOf } from '../src/lib/favicon'
import {
  CHECKOUT,
  FOUNDING_ENDS,
  OFFLINE_GRACE_MS,
  PRO_BENEFIT_ID,
  PRO_CUTOFF,
  RECHECK_MS,
  canMakeTodo,
  decideEarlyTodo,
  keepsTodoFree,
  readEarlyTodo,
  checkoutPlan,
  checkoutUrl,
  cleanKey,
  compareVersions,
  hasPro,
  isEarlyUser,
  maskKey,
  needsCheck,
  priceLabel,
  proState,
  readActivation,
  readValidation,
  trialDaysLeft,
  CHECKOUT_PENDING_MS,
  checkoutPending,
  currentPeriodEnd,
  daysAgo,
  money,
  proCard,
  readSub,
  shortDate,
} from '../src/lib/proPlan'
import {
  COMPANY_EMOJI,
  DISMISSED_MAX,
  LIMITS as MANAGED_LIMITS,
  addDismissed,
  companyLabel,
  companySpaces,
  isEmptyConfig,
  managedFolderSpace,
  parseAnnouncement,
  parseDismissed,
  parseManagedConfig,
  safeUrl,
  showAnnouncement,
  textHash,
  ONBOARDING_MS,
  anyLock,
  arrangeOnboarding,
  cleanGoName,
  onboardingActive,
  parseBrand,
  parseGoLinks,
  parseLocks,
} from '../src/lib/managedPlan'
import { escapeXml, goDescription, goEntries, goSuggestions, looksLikeUrl, rankGo, readSearchHash, searchDisposition, searchHash } from '../src/lib/goLinks'
import { policyAccentFromMirror } from '../src/lib/appearance'
import {
  MAX_LINKS as SHARE_MAX_LINKS,
  MAX_SHARE_URL,
  MAX_TITLE as SHARE_MAX_TITLE,
  SHARE_PAGE,
  bytesToBase64Url,
  cleanText as shareCleanText,
  decodeShare,
  deflate,
  encodeShare,
  isShareableUrl,
  parsePayload as parseSharePayload,
  shareNote,
  toPayload as sharePayload,
} from '../src/lib/sharePlan'
import { decodeShare as pageDecodeShare, isShareableUrl as pageIsShareableUrl, monogram as pageMonogram } from '../site/s/share-core.js'
import palettesCss from '../src/styles/palettes.css'
import { contrastRatio, gradientStops, mix, over, readPalettes } from './contrast'
import msgEn from '../public/_locales/en/messages.json'
import msgEs from '../public/_locales/es/messages.json'
import msgPtBR from '../public/_locales/pt_BR/messages.json'
import msgDe from '../public/_locales/de/messages.json'
import msgFr from '../public/_locales/fr/messages.json'
import msgIt from '../public/_locales/it/messages.json'
import msgJa from '../public/_locales/ja/messages.json'
import msgKo from '../public/_locales/ko/messages.json'
import msgZhCN from '../public/_locales/zh_CN/messages.json'
import msgId from '../public/_locales/id/messages.json'
import msgTr from '../public/_locales/tr/messages.json'
import msgRu from '../public/_locales/ru/messages.json'
import msgUk from '../public/_locales/uk/messages.json'
import msgPl from '../public/_locales/pl/messages.json'
import msgNl from '../public/_locales/nl/messages.json'
import msgCs from '../public/_locales/cs/messages.json'
import msgSv from '../public/_locales/sv/messages.json'
import msgRo from '../public/_locales/ro/messages.json'
import msgVi from '../public/_locales/vi/messages.json'
import msgZhTW from '../public/_locales/zh_TW/messages.json'
import msgTh from '../public/_locales/th/messages.json'

let fails = 0
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`)
}

// displayTitle
eq('figma suffix', displayTitle('Digital Guidelines – Figma', 'https://www.figma.com/file/x'), 'Digital Guidelines')
eq('jira suffix', displayTitle('[RNA-3641] Prod-UI-login fails - Jira', 'https://acme.atlassian.net/browse/RNA-3641'), '[RNA-3641] Prod-UI-login fails')
eq('hyphenated word untouched', displayTitle('Prod-UI-login', 'https://www.figma.com/x'), 'Prod-UI-login')
eq('google sheets', displayTitle('Budget 2026 - Google Sheets', 'https://docs.google.com/spreadsheets/d/x'), 'Budget 2026')
eq('github middle dot', displayTitle('owner/repo: desc \u00b7 GitHub', 'https://github.com/owner/repo'), 'owner/repo: desc')
eq('generic site name', displayTitle('Pricing - Stripe', 'https://stripe.com/pricing'), 'Pricing')
eq('subdomain word kept', displayTitle('Notes - Home', 'https://home.example.com'), 'Notes - Home')
eq('confluence keeps space name', displayTitle('A - B - Confluence', 'https://x.atlassian.net/wiki'), 'A - B')
eq('bare app title', displayTitle('Figma', 'https://figma.com'), 'Figma')
eq('foreign suffix kept', displayTitle('Roadmap - Figma', 'https://example.com'), 'Roadmap - Figma')
eq('sharepoint word online', displayTitle('Q3 plan - Microsoft Word Online', 'https://contoso.sharepoint.com/x'), 'Q3 plan')
eq('filename untouched', displayTitle('LoyaltyCombined.pptx', 'https://contoso.sharepoint.com/x'), 'LoyaltyCombined.pptx')
eq('bad url', displayTitle('Thing - Stripe', 'not a url'), 'Thing - Stripe')

// splitTitle
eq('split long', splitTitle('ABC Rewards Experience Design v2'), ['ABC Rewards Experience', ' Design v2'])
eq('short kept', splitTitle('Short title'), ['Short title', ''])
eq('no spaces', splitTitle('Supercalifragilisticexpialidocious-no-spaces'), ['Supercalifragilisticexpialidocious-no-spaces', ''])
eq('japanese', splitTitle('フィードバックシート・テンプレート 2026年度版'), ['フィードバックシート・テンプレート', ' 2026年度版'])
eq('long last word', splitTitle('Something something Internationalization'), ['Something something Internationalization', ''])
eq('join is lossless', splitTitle('UI Introduction - Digital Guidelines').join(''), 'UI Introduction - Digital Guidelines')

// emoji prefix
eq('emoji icon', parseBookmarkTitle('💎 Crown Jewel'), { emoji: '💎', text: 'Crown Jewel' })
eq('zwj emoji', parseBookmarkTitle('👨‍👩‍👧 Family'), { emoji: '👨‍👩‍👧', text: 'Family' })
eq('no emoji', parseBookmarkTitle('Crown Jewel'), { emoji: null, text: 'Crown Jewel' })
eq('emoji only', parseBookmarkTitle('💎'), { emoji: null, text: '💎' })
eq('digit not emoji', parseBookmarkTitle('1 Password'), { emoji: null, text: '1 Password' })

// monogram
eq('monogram letter', monogram('crown jewel', 'https://intra.example/x').letter, 'C')
eq('monogram skips punctuation', monogram('[RNA] ticket', 'https://a.b').letter, 'R')
eq('same host same tint', monogram('A', 'https://x.io/1').bg === monogram('B', 'https://x.io/2').bg, true)

// open tab matching
const tab = (id: number, url: string, lastAccessed = id) => ({ id, windowId: 1, url, lastAccessed }) as chrome.tabs.Tab
const idx = buildIndex([
  tab(1, 'https://figma.com/design/abc/File?node-id=12-3&t=zz'),
  tab(2, 'https://slack.com/client/T1'),
  tab(3, 'https://example.com/a/'),
  tab(4, 'https://contoso.sharepoint.com/:p:/r/sites/x/_layouts/15/Doc.aspx?sourcedoc=%7BAAA%7D&file=A.pptx'),
  tab(5, 'https://www.youtube.com/watch?v=1&t=30'),
  tab(6, 'chrome://newtab/'),
  tab(7, 'https://example.com/a', 100),
])
const hit = (u: string) => findOpenTab(idx, u)?.id ?? null
eq('figma ignores node-id', hit('https://www.figma.com/design/abc/File?node-id=0-1'), 1)
eq('root bookmark matches host', hit('https://slack.com/'), 2)
eq('deep bookmark needs exact', hit('https://slack.com/intl/en-sg/pricing'), null)
eq('trailing slash + most recent', hit('https://example.com/a'), 7)
eq('hash ignored', hit('http://example.com/a#section'), 7)
eq('sharepoint other doc no match', hit('https://contoso.sharepoint.com/:p:/r/sites/x/_layouts/15/Doc.aspx?sourcedoc=%7BBBB%7D&file=B.pptx'), null)
eq('sharepoint same doc', hit('https://contoso.sharepoint.com/:p:/r/sites/x/_layouts/15/Doc.aspx?file=A.pptx&sourcedoc=%7BAAA%7D'), 4)
eq('youtube other video', hit('https://youtube.com/watch?v=2'), null)
eq('youtube same video ignores t', hit('https://youtube.com/watch?v=1'), 5)
eq('non-http never matches', urlKey('chrome://settings'), null)
// unchanged tab set: no redraw (B4)
const idx2 = buildIndex([tab(1, 'https://slack.com/client/T1', 50), tab(2, 'https://example.com/a', 60)])
eq('same tabs, newer lastAccessed', sameIndex(idx2, buildIndex([tab(1, 'https://slack.com/client/T1', 90), tab(2, 'https://example.com/a', 95)])), true)
eq('new tab changes index', sameIndex(idx2, buildIndex([tab(1, 'https://slack.com/client/T1'), tab(2, 'https://example.com/a'), tab(3, 'https://x.io/')])), false)
eq('navigated tab changes index', sameIndex(idx2, buildIndex([tab(1, 'https://slack.com/client/T1'), tab(2, 'https://example.com/b')])), false)
eq('null never same', sameIndex(null, idx2), false)

// import planner (0.4.0)
const bar: FolderNode = {
  id: '1',
  title: 'Bookmarks bar',
  children: [
    { id: 'a', title: 'Gmail', url: 'https://mail.google.com/' },
    { id: 'b', title: 'Bookmarklet', url: 'javascript:alert(1)' },
    {
      id: 'c',
      title: 'Work',
      children: [
        { id: 'd', title: 'Jira', url: 'https://jira.example.com/' },
        { id: 'e', title: 'Clients', children: [{ id: 'f', title: '  ', url: 'https://acme.example.com/' }] },
        { id: 'g', title: 'Empty', children: [] },
      ],
    },
    { id: 'h', title: 'Only folders', children: [{ id: 'i', title: 'Deep', children: [{ id: 'j', title: 'Deep link', url: 'http://deep.example.com/' }] }] },
    { id: 'k', title: 'Settings', url: 'chrome://settings' },
    { id: 'x', title: 'Stackboard', children: [{ id: 'y', title: 'Ours', url: 'https://ours.example.com/' }] },
  ],
}
const plan = planFolder(bar, { name: 'Bookmarks bar', emoji: '⭐', looseTitle: 'On the bar', exclude: new Set(['x']) })
// 0.8.0: a folder in the source is a stack; folders below that stay folders inside it (they were path-named stacks).
eq('plan: folders straight in the source become stacks', plan.space.stacks.map((s) => s.title), ['On the bar', 'Work', 'Only folders'])
eq('plan: deeper folders stay nested in their stack, empty ones go', plan.space.stacks.map((s) => (s.folders ?? []).map((f) => `${f.title}:${f.links.length}`)), [[], ['Clients:1'], ['Deep:1']])
eq('plan: a stack can hold only folders', plan.space.stacks[2].links, [])
eq('plan: counts links', [plan.links, countPlanned(plan.space)], [4, 4])
eq('plan: skips bookmarklets and chrome pages', plan.skipped, 2)
eq('plan: blank title falls back to the url', plan.space.stacks[1].folders?.[0].links[0].title, 'https://acme.example.com/')
eq('plan: never copies Stackboard into itself', JSON.stringify(plan.space).includes('ours'), false)
eq('plan: empty folder gives no stacks', planFolder({ id: 'z', title: 'Z', children: [] }, { name: 'Z', emoji: '📁', looseTitle: 'Links' }).space.stacks, [])
eq('importable: http', isImportableUrl('http://a.b/'), true)
eq('importable: HTTPS', isImportableUrl('HTTPS://A.B'), true)
eq('importable: javascript', isImportableUrl('javascript:void(0)'), false)
eq('importable: file', isImportableUrl('file:///C:/x.html'), false)
eq('importable: bare scheme', isImportableUrl('https://'), false)

// one-time rating ask (0.4.0; sooner, with happy moments, in 0.4.1)
const DAY = 86400000
const now = 1_800_000_000_000
const ask = { opens: 25, firstSeen: now - 3 * DAY, now, answered: false, links: 5 }
eq('rating: a plain new tab asks after 3 days and 25 tabs', shouldAskForRating(ask), true)
eq('rating: a plain new tab waits for 25 tabs', shouldAskForRating({ ...ask, opens: 24 }), false)
eq('rating: a happy moment asks from 15 tabs', shouldAskForRating({ ...ask, opens: 15, trigger: 'win' }), true)
eq('rating: not before 15 tabs, even after a win', shouldAskForRating({ ...ask, opens: 14, trigger: 'win' }), false)
eq('rating: not before 3 days', shouldAskForRating({ ...ask, firstSeen: now - 2 * DAY, trigger: 'win' }), false)
eq('rating: never twice', shouldAskForRating({ ...ask, answered: true }), false)
eq('rating: not on an empty board', shouldAskForRating({ ...ask, links: 0 }), false)
// 0.5.3: a milestone (saved certificate, third stash) asks after one day at any tab count
const ms = { ...ask, opens: 1, firstSeen: now - 1 * DAY, trigger: 'milestone' as const }
eq('rating: a milestone asks after one day', shouldAskForRating(ms), true)
eq('rating: a milestone waits for the first day', shouldAskForRating({ ...ms, firstSeen: now - DAY / 2 }), false)
eq('rating: a milestone never asks twice', shouldAskForRating({ ...ms, answered: true }), false)
eq('rating: a milestone needs links on the board', shouldAskForRating({ ...ms, links: 0 }), false)
eq('install date: an older Stackboard folder counts', installedAt(now, now - 90 * DAY), now - 90 * DAY)
eq('install date: a newer folder never moves it later', installedAt(now - 5 * DAY, now), now - 5 * DAY)
eq('install date: no folder date keeps the first tab', installedAt(now, undefined), now)

// starter packs (0.4.0)
eq('packs: every link is http(s)', STARTER_PACKS.every((p) => p.stacks.every((s) => s.links.every((l) => isImportableUrl(l.url)))), true)
eq('packs: unique ids', new Set(STARTER_PACKS.map((p) => p.id)).size, STARTER_PACKS.length)
eq('batch: one save stays news', batchFlags([1000]), [false])
eq('batch: saves minutes apart stay news', batchFlags([0, 120000, 240000]), [false, false, false])
eq('batch: an import stays quiet', batchFlags([5000, 5004, 5010]), [true, true, true])
eq('batch: a later save next to an import is news', batchFlags([5000, 5004, 90000]), [true, true, false])
eq('stays: one browser page', staysNote(0, 1), '1 browser page stays open.')
eq('stays: one pinned tab', staysNote(1, 0), '1 pinned tab stays open.')
eq('stays: two browser pages', staysNote(0, 2), '2 browser pages stay open.')
eq('stays: pinned and browser', staysNote(1, 1), '1 pinned tab and 1 browser page stay open.')
eq('stays: nothing', staysNote(0, 0), '')
eq('batch: unknown dates never batch', batchFlags([undefined, undefined]), [false, false])
// stash this window (0.4.0)
const strip = [
  { id: 1, url: 'https://a.example/', title: 'A', groupId: -1 },
  { id: 2, url: 'chrome://newtab/', title: 'New Tab', groupId: -1 },
  { id: 3, url: 'https://b.example/', title: 'B', groupId: 7 },
  { id: 4, url: 'https://c.example/', title: '', groupId: 7 },
  { id: 5, url: 'https://pinned.example/', title: 'P', pinned: true, groupId: -1 },
  { id: 6, url: 'https://a.example/', title: 'A again', groupId: -1 },
  { id: 7, url: 'https://d.example/', title: 'D', groupId: 9 },
]
const sp = planStash(strip, new Map([[7, 'Research'], [9, ' ']]), 'Stashed now')
eq('stash: stacks follow the tab strip', sp.stacks.map((s) => s.title), ['Stashed now', 'Research', 'Tab group'])
eq('stash: a url open twice is saved once', sp.stacks[0].links.map((l) => l.title), ['A'])
eq('stash: untitled tab falls back to url', sp.stacks[1].links[1].title, 'https://c.example/')
eq('stash: closes every saved tab, duplicates too', sp.tabIds, [1, 3, 4, 6, 7])
eq('stash: pinned and browser pages stay', [sp.links, sp.skipped, sp.pinned], [4, 1, 1])
eq('stash: nothing to save', planStash([{ id: 1, url: 'chrome://newtab/' }], new Map(), 'x').links, 0)
eq('stash: a tab still loading is saved by where it is headed', planStash([{ id: 1, url: '', pendingUrl: 'https://slow.example/' }], new Map(), 'x').tabIds, [1])
// 0.5.2: save selected tabs (C1)
const sel = planSelected([
  { id: 1, url: 'https://a.example/', title: 'A' },
  { id: 2, url: 'chrome://settings/', title: 'Settings' },
  { id: 3, url: 'https://b.example/', title: '  ', pinned: true },
  { id: 4, url: 'https://a.example/', title: 'A twice' },
  { id: 5, url: 'about:blank', title: '' },
  { id: 6, url: '', pendingUrl: 'https://slow.example/', title: 'Slow' },
  { id: 7, url: 'file:///C:/notes.txt', title: 'Notes' },
])
eq('selected: web pages saved in strip order', sel.links.map((l) => l.url), ['https://a.example/', 'https://b.example/', 'https://slow.example/'])
eq('selected: browser, about: and file: pages are skipped', sel.skipped, 3)
eq('selected: a pinned tab someone selected is saved', sel.links.some((l) => l.url === 'https://b.example/'), true)
eq('selected: a blank title falls back to the url', sel.links[1].title, 'https://b.example/')
eq('selected: a url selected twice is saved once, first title wins', sel.links[0].title, 'A')
eq('selected: nothing saveable', planSelected([{ url: 'chrome://newtab/' }, { url: 'chrome-extension://x/popup.html' }]), { links: [], skipped: 2 })
// 0.5.1: tab bankruptcy
const cert = certificateText({ tabs: 312, windows: 3, saved: 290, at: Date.UTC(2026, 9, 8, 12) })
eq('bankruptcy: headline counts closed tabs', cert.headline, '312 tabs discharged')
eq('bankruptcy: detail names windows and saved links', cert.detail, 'October 8, 2026 across 3 windows. All 290 links saved as bookmarks.')
eq('bankruptcy: one window, no window count', certificateText({ tabs: 1, windows: 1, saved: 1, at: Date.UTC(2026, 9, 8, 12) }).share, 'I declared tab bankruptcy: 1 tab discharged. Nothing lost, all saved as bookmarks.')
eq('bankruptcy: thousands get a separator', certificateText({ tabs: 1204, windows: 2, saved: 1100, at: 0 }).headline, '1,204 tabs discharged')
eq('bankruptcy: first window keeps the plain label', bankruptcyStackTitle('Tab bankruptcy Oct 8', 0), 'Tab bankruptcy Oct 8')
eq('bankruptcy: later windows are numbered', bankruptcyStackTitle('Tab bankruptcy Oct 8', 2), 'Tab bankruptcy Oct 8 (window 3)')
eq('packs: no duplicate link inside a pack', STARTER_PACKS.every((p) => { const u = p.stacks.flatMap((s) => s.links.map((l) => l.url)); return new Set(u).size === u.length }), true)

// ---------- 0.5.0: the visual pack ----------

// Contrast helper, against known values.
const round2 = (n: number) => Math.round(n * 100) / 100
eq('contrast: black on white is 21:1', round2(contrastRatio('#000000', '#ffffff')), 21)
eq('contrast: a colour on itself is 1:1', contrastRatio('#cba6f7', '#cba6f7'), 1)
eq('contrast: #777 on white is 4.48:1, just under AA', round2(contrastRatio('#777777', '#ffffff')), 4.48)
eq('contrast: order does not matter', contrastRatio('#1e1e2e', '#cdd6f4') === contrastRatio('#cdd6f4', '#1e1e2e'), true)
eq('mix: half black, half white', mix('#000000', '#ffffff', 0.5), '#808080')
eq('mix: alpha laid over a colour', over('#ffffff66', '#000000'), '#666666')

// Palettes: every variant the app can pick has a full block in palettes.css.
const blocks = readPalettes(palettesCss)
const variantIds = PALETTES.flatMap((p) => [p.light && `${p.id}/light`, p.dark && `${p.id}/dark`].filter(Boolean) as string[])
eq('palettes: one CSS block per variant, no strays', blocks.map((b) => `${b.palette}/${b.scheme}`).sort(), [...variantIds].sort())
for (const b of blocks) {
  const id = `${b.palette}/${b.scheme}`
  eq(`palettes: ${id} defines every token`, PALETTE_TOKENS.filter((t) => !b.tokens.has(t)), [])
  eq(`palettes: ${id} has no unknown tokens`, [...b.tokens.keys()].filter((t) => !PALETTE_TOKENS.includes(t)), [])
}

// WCAG AA: 4.5:1 for text, 3:1 for icons, focus rings, the open dot and monogram letters.
// One documented exception: Stackboard Light keeps its original white-on-peach buttons (3.1:1,
// AA for large text only), because 0.5.0 keeps the default look as it was.
const EXCEPTIONS: Record<string, Record<string, number>> = {
  'stackboard/light': { 'on-accent/accent': 3, 'on-accent/accent-hover': 3 },
}
for (const b of blocks) {
  const id = `${b.palette}/${b.scheme}`
  // A missing token is reported above; here it just counts as a miss instead of crashing the run.
  const t = (k: string) => b.tokens.get(k) ?? '#ff00ff'
  const short = (need: number, pairs: Array<[string, string]>) =>
    pairs
      .filter(([fg, bg]) => !b.tokens.has(fg) || !b.tokens.has(bg) || contrastRatio(t(fg), t(bg)) < (EXCEPTIONS[id]?.[`${fg}/${bg}`] ?? need))
      .map(([fg, bg]) => `${fg} on ${bg} ${b.tokens.has(fg) && b.tokens.has(bg) ? round2(contrastRatio(t(fg), t(bg))) : 'missing'}`)
  const text: Array<[string, string]> = []
  for (const s of ['canvas', 'panel', 'card', 'raised']) for (const f of ['strong', 'fg', 'soft', 'muted']) text.push([f, s])
  text.push(['fg', 'sunken'], ['muted', 'sunken'], ['fg', 'hover'], ['strong', 'hover'], ['strong', 'selected'], ['strong', 'accent-soft'])
  for (const s of ['canvas', 'card', 'raised']) text.push(['accent-text', s], ['danger', s])
  text.push(['danger', 'danger-soft'])
  eq(`contrast: ${id} text clears AA on every surface`, short(4.5, text), [])
  eq(
    `contrast: ${id} buttons and toasts clear AA`,
    short(4.5, [
      ['on-accent', 'accent'], ['on-accent', 'accent-hover'], ['on-danger', 'danger-fill'], ['on-danger', 'danger-fill-hover'],
      ['on-inverse', 'inverse'], ['inverse-strong', 'inverse'], ['inverse-muted', 'inverse'], ['inverse-accent', 'inverse'],
    ]),
    [],
  )
  const marks: Array<[string, string]> = [['focus', 'card'], ['focus', 'canvas'], ['accent', 'card'], ['accent', 'panel']]
  for (const s of ['canvas', 'panel', 'card', 'raised', 'sunken']) marks.push(['faint', s])
  for (let i = 0; i < 8; i++) marks.push([`tint-${i}-fg`, `tint-${i}-bg`])
  eq(`contrast: ${id} icons, focus rings and monograms clear 3:1`, short(3, marks), [])
  const gradientMisses = [1, 2, 3].flatMap((g) => {
    if (!b.tokens.has(`gradient-${g}`)) return [`gradient-${g} missing`]
    return gradientStops(t(`gradient-${g}`)).flatMap((stop) =>
      ['strong', 'fg', 'muted'].filter((f) => contrastRatio(t(f), stop) < 4.5).map((f) => `gradient-${g} ${f} on ${stop}`),
    )
  })
  eq(`contrast: ${id} text stays AA on all three gradients`, gradientMisses, [])
}

// True black (0.5.2, C2): the canvas is pure black for OLED screens, and the panel too.
const black = blocks.find((b) => b.palette === 'black' && b.scheme === 'dark')
eq('palettes: True black has a dark block only', blocks.filter((b) => b.palette === 'black').map((b) => b.scheme), ['dark'])
eq('palettes: True black canvas and panel are #000000', [black?.tokens.get('canvas'), black?.tokens.get('panel')], ['#000000', '#000000'])
eq('palettes: True black gradients end on pure black', [1, 2, 3].map((g) => black?.tokens.get(`gradient-${g}`)?.trim().endsWith('#000000')), [true, true, true])
// 0.5.4 (F2): Tokyo Night (Night + Day), Rosé Pine (main + Dawn), Dracula (dark only, like Nord).
const schemesOf = (id: string) => blocks.filter((b) => b.palette === id).map((b) => b.scheme).sort()
eq('palettes: Tokyo Night, Rosé Pine and Dracula are listed', ['tokyonight', 'rosepine', 'dracula'].map((id) => PALETTES.some((p) => p.id === id)), [true, true, true])
eq('palettes: Tokyo Night and Rosé Pine have light and dark blocks, Dracula dark only', [schemesOf('tokyonight'), schemesOf('rosepine'), schemesOf('dracula')], [['dark', 'light'], ['dark', 'light'], ['dark']])
eq('palettes: new variants use their official base colours', [['tokyonight', 'dark'], ['tokyonight', 'light'], ['rosepine', 'dark'], ['rosepine', 'light'], ['dracula', 'dark']].map(([p, s]) => blocks.find((b) => b.palette === p && b.scheme === s)?.tokens.get('canvas')), ['#1a1b26', '#e1e2e7', '#191724', '#faf4ed', '#282a36'])
eq('scheme: variant names for the 0.5.4 palettes', [variantName('tokyonight', 'dark'), variantName('tokyonight', 'light'), variantName('rosepine', 'dark'), variantName('rosepine', 'light')], ['Tokyo Night', 'Tokyo Night Day', 'Rosé Pine', 'Rosé Pine Dawn'])
eq('scheme: Dracula is dark only, like Nord', [resolveScheme('light', 'dracula', false), resolveScheme('system', 'dracula', false), onlyScheme('dracula'), variantName('dracula', 'light')], ['dark', 'dark', 'dark', 'Dracula'])
eq('scheme: Tokyo Night and Rosé Pine follow the mode', [resolveScheme('light', 'tokyonight', true), resolveScheme('system', 'rosepine', false), onlyScheme('tokyonight'), onlyScheme('rosepine')], ['light', 'light', null, null])
eq('mirror: Dracula boots dark, Rosé Pine boots either way', [bootMirror(parseAppearance({ palette: 'dracula' })).only, bootMirror(parseAppearance({ palette: 'rosepine' })).only], ['dark', null])
eq('appearance: the 0.5.4 palettes survive storage', ['tokyonight', 'rosepine', 'dracula'].map((id) => parseAppearance({ palette: id }).palette), ['tokyonight', 'rosepine', 'dracula'])

// Appearance settings: whatever storage holds comes back complete and in range.
eq('appearance: nothing stored gives the defaults', parseAppearance(undefined), DEFAULT_APPEARANCE)
eq('appearance: junk gives the defaults', parseAppearance('dark please'), DEFAULT_APPEARANCE)
eq(
  'appearance: unknown palette, mode, density and kind fall back',
  parseAppearance({ palette: 'solarized', mode: 'dim', density: 'cosy', bg: { kind: 'video' } }),
  DEFAULT_APPEARANCE,
)
eq(
  'appearance: dim and blur are clamped',
  parseAppearance({ bg: { dim: 400, blur: -3 } }).bg,
  { ...DEFAULT_APPEARANCE.bg, dim: DIM_MAX, blur: 0 },
)
eq('appearance: blur caps at its maximum', parseAppearance({ bg: { blur: 99 } }).bg.blur, BLUR_MAX)
eq('appearance: gradient choice stays 1-3', [parseAppearance({ bg: { gradient: 0 } }).bg.gradient, parseAppearance({ bg: { gradient: 7 } }).bg.gradient, parseAppearance({ bg: { gradient: 2.4 } }).bg.gradient], [1, 3, 2])
eq('appearance: numbers stored as text still read', parseAppearance({ bg: { dim: '42', blur: ' 6 ' } }).bg, { ...DEFAULT_APPEARANCE.bg, dim: 42, blur: 6 })
eq('appearance: NaN and Infinity fall back', parseAppearance({ bg: { dim: NaN, blur: Infinity } }).bg, DEFAULT_APPEARANCE.bg)
const picked = { mode: 'dark', palette: 'nord', density: 'compact', layout: 'rows', bg: { kind: 'image', gradient: 2, dim: 50, blur: 8, imageRev: 1791200000000 } }
eq('appearance: a full image setup survives a round trip', parseAppearance(JSON.parse(JSON.stringify(picked))), picked)
eq('appearance: merging a slider keeps the rest of the background', mergeAppearance(parseAppearance(picked), { bg: { dim: 20 } }).bg, { ...picked.bg, dim: 20 })
eq('appearance: merging clamps too', mergeAppearance(DEFAULT_APPEARANCE, { bg: { dim: 999 } }).bg.dim, DIM_MAX)
eq('mirror: settings survive the localStorage copy', settingsFromMirror(JSON.stringify(bootMirror(parseAppearance(picked)))), picked)
eq('mirror: a broken copy gives the defaults', [settingsFromMirror('{not json'), settingsFromMirror(null)], [DEFAULT_APPEARANCE, DEFAULT_APPEARANCE])
eq('mirror: tells the boot script when a palette has one scheme', [bootMirror(parseAppearance({ palette: 'nord' })).only, bootMirror(DEFAULT_APPEARANCE).only], ['dark', null])
eq('mirror: carries the background kind for the first frame', bootMirror(parseAppearance(picked)).bg, 'image')

// Light, dark, system.
eq('scheme: system follows the OS', [resolveScheme('system', 'catppuccin', true), resolveScheme('system', 'catppuccin', false)], ['dark', 'light'])
eq('scheme: an explicit choice beats the OS', [resolveScheme('light', 'gruvbox', true), resolveScheme('dark', 'stackboard', false)], ['light', 'dark'])
eq('scheme: Nord stays dark in light mode', [resolveScheme('light', 'nord', false), resolveScheme('system', 'nord', false), onlyScheme('nord')], ['dark', 'dark', 'dark'])
eq('scheme: True black is dark only, like Nord', [resolveScheme('light', 'black', false), resolveScheme('system', 'black', false), onlyScheme('black'), variantName('black', 'dark')], ['dark', 'dark', 'dark', 'True black'])
eq('appearance: True black survives storage', parseAppearance({ palette: 'black' }).palette, 'black')
eq('mirror: True black boots dark', bootMirror(parseAppearance({ palette: 'black' })).only, 'dark')
eq('scheme: variant names', [variantName('catppuccin', 'dark'), variantName('catppuccin', 'light'), variantName('gruvbox', 'dark'), variantName('stackboard', 'light')], ['Catppuccin Mocha', 'Catppuccin Latte', 'Gruvbox Dark', 'Stackboard Light'])

// Keys 1-9.
eq('keys: 1-9 pick spaces 0-8', ['1', '5', '9'].map(spaceIndexForKey), [0, 4, 8])
eq('keys: 0, letters and named keys do nothing', ['0', 'a', '/', 'F1', '10', ''].map(spaceIndexForKey), [null, null, null, null, null, null])

// Favicons that vanish on the opposite tone (0.5.0 flips them).
const icon = (paint: (x: number, y: number) => [number, number, number, number] | null): number[] => {
  const px: number[] = []
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px.push(...(paint(x, y) ?? [0, 0, 0, 0]))
  return px
}
const ring = (x: number, y: number) => Math.abs(Math.hypot(x - 7.5, y - 7.5) - 5) < 1.6
eq('glyph: a black mark on transparency is dark', glyphOf(icon((x, y) => (ring(x, y) ? [20, 20, 22, 255] : null))), 'dark')
eq('glyph: a white mark on transparency is light', glyphOf(icon((x, y) => (ring(x, y) ? [250, 250, 250, 255] : null))), 'light')
eq('glyph: a coloured mark is left alone', glyphOf(icon((x, y) => (ring(x, y) ? [36, 99, 235, 255] : null))), null)
eq('glyph: a full tile keeps its own background', glyphOf(icon(() => [10, 10, 10, 255])), null)
eq('monogram: the tint follows the host', [monogram('A', 'https://x.io/1').tint === monogram('B', 'https://x.io/2').tint, monogram('A', 'https://x.io/').tint < 8], [true, true])

// Store title and summary per language (G3, 0.5.1). The store cuts the summary at 132 characters
// and the name at 75; the brand stays first and the short name is never translated.
const LOCALES: Record<string, Record<string, { message: string }>> = {
  en: msgEn, es: msgEs, pt_BR: msgPtBR, de: msgDe, fr: msgFr, it: msgIt, ja: msgJa, ko: msgKo, zh_CN: msgZhCN, id: msgId, tr: msgTr,
  ru: msgRu, uk: msgUk, pl: msgPl, nl: msgNl, cs: msgCs, sv: msgSv, ro: msgRo, vi: msgVi, zh_TW: msgZhTW, th: msgTh, // 0.5.6
}
for (const [loc, m] of Object.entries(LOCALES)) {
  eq(`locale ${loc}: has every message`, ['extName', 'extShortName', 'extDescription'].map((k) => typeof m[k]?.message === 'string' && m[k].message.length > 0), [true, true, true])
  eq(`locale ${loc}: name starts with the brand and fits 75`, [m.extName.message.startsWith('Stackboard'), [...m.extName.message].length <= 75], [true, true])
  eq(`locale ${loc}: short name stays Stackboard`, m.extShortName.message, 'Stackboard')
  eq(`locale ${loc}: summary fits 132`, [...m.extDescription.message].length <= 132, true)
}
eq('locale en: the English title is the store-search test title (S2, 0.5.6)', msgEn.extName.message, 'Stackboard: New Tab Bookmarks & Visual Bookmark Manager')

// Uninstall page (0.5.5): our own domain, the version in the query, under Chrome's 1023-character cap.
eq('uninstall: url carries the version', uninstallUrl('0.5.5'), 'https://getstackboard.com/bye?v=0.5.5')
eq('uninstall: page is on getstackboard.com over https', UNINSTALL_PAGE.startsWith('https://getstackboard.com/'), true)
eq('uninstall: odd versions stay encoded and short', [uninstallUrl('1.2.3 beta&x').includes('beta%26x'), uninstallUrl('9'.repeat(40)).length < 1023], [true, true])

// To-do stacks (0.6.0): the marker bookmark, item edits, parsing what storage holds, the orphan sweep.
{
  const id = newTodoId()
  eq('todo: new id is 16 lowercase base-36 chars', /^[a-z0-9]{16}$/.test(id), true)
  eq('todo: marker url round-trips', todoIdFromUrl(todoMarkerUrl(id)), id)
  eq('todo: other urls are not markers', [todoIdFromUrl('https://getstackboard.com/todo'), todoIdFromUrl('https://getstackboard.com/todo#short'), todoIdFromUrl('https://example.com/todo#abcdefgh12'), todoIdFromUrl(undefined)], [null, null, null, null])
  eq('todo: marker id rejects odd characters', todoIdFromUrl('https://getstackboard.com/todo#abc/def-ghi'), null)
  eq('todo: storage key', todoKey('abcdefgh12'), 'todo:abcdefgh12')

  eq('todo: cleanText folds whitespace and newlines', cleanText('  buy\n milk \t now '), 'buy milk now')
  eq('todo: cleanText caps length by characters', [...cleanText('😀'.repeat(400))].length, TODO_MAX_TEXT)

  let l: TodoList = emptyList()
  l = addItem(l, 'one', 1, 'a1')
  l = addItem(l, 'two', 2, 'a2')
  l = addItem(l, '   ', 3, 'a3')
  eq('todo: blank text adds nothing', l.items.map((i) => i.id), ['a1', 'a2'])
  l = toggleItem(l, 'a1')
  eq('todo: done items sink, open ones keep their order', ordered(l.items).map((i) => i.id), ['a2', 'a1'])
  eq('todo: countOpen', countOpen(l), 1)
  eq('todo: toggling back restores the original order', ordered(toggleItem(l, 'a1').items).map((i) => i.id), ['a1', 'a2'])
  eq('todo: edit trims', editItem(l, 'a2', '  second ').items[1].text, 'second')
  eq('todo: editing to empty removes', editItem(l, 'a2', '  ').items.map((i) => i.id), ['a1'])
  const removed = l.items[0]
  const r = removeItem(l, 'a1')
  eq('todo: undo puts the item back at its index', restoreItem(r, removed, 0).items.map((i) => i.id), ['a1', 'a2'])
  eq('todo: undo twice does not duplicate', restoreItem(restoreItem(r, removed, 0), removed, 0).items.length, 2)
  eq('todo: clearDone keeps open items', clearDone(l).items.map((i) => i.id), ['a2'])

  let full: TodoList = emptyList()
  for (let i = 0; i < TODO_MAX_ITEMS; i++) full = addItem(full, `task ${i}`, i, `id${i}xxxxxx`)
  let threw = false
  try {
    addItem(full, 'one more', 0)
  } catch (e) {
    threw = e instanceof TodoFullError
  }
  eq('todo: a full list refuses another item', threw, true)
  eq('todo: 100 short items fit the 8 KB sync item', listBytes(todoKey('abcdefgh12345678'), full) < 8000, true)

  eq('todo: parseList survives junk', parseList(null), emptyList())
  eq('todo: parseList drops bad items and duplicates', parseList({ items: [{ id: 'x', text: 'ok', done: true, at: 5 }, { id: 'x', text: 'dup' }, { text: 'no id' }, { id: 'y', text: '   ' }, 7] }).items, [{ id: 'x', text: 'ok', done: true, at: 5 }])
  eq('todo: parseList keeps the orphan mark', parseList({ items: [], orphanSince: 9 }).orphanSince, 9)

  const now = 10 * ORPHAN_GRACE_MS
  const stored: Record<string, TodoList> = {
    live: { v: 1, items: [] },
    liveMarked: { v: 1, items: [], orphanSince: now - 1000 },
    goneSeen: { v: 1, items: [] },
    goneUnseen: { v: 1, items: [] },
    goneMarkedFresh: { v: 1, items: [], orphanSince: now - 1000 },
    goneMarkedOld: { v: 1, items: [], orphanSince: now - ORPHAN_GRACE_MS },
  }
  const plan = planSweep(stored, ['live', 'liveMarked', 'newHere'], ['goneSeen', 'goneMarkedOld', 'deletedLongAgo'], now)
  eq('todo sweep: marks only lists this device saw and lost', plan.mark, ['goneSeen'])
  eq('todo sweep: unmarks a list whose stack came back', plan.unmark, ['liveMarked'])
  eq('todo sweep: drops after the grace period, from any device', plan.drop, ['goneMarkedOld'])
  eq('todo sweep: seen = live plus still-stored seen lists', plan.seen.sort(), ['goneSeen', 'live', 'liveMarked', 'newHere'])
}

// ---------- 0.7.0: auto-archive ----------
{
  const H = 60 * 60 * 1000
  const now = Date.UTC(2026, 10, 2, 12)
  const old = now - 13 * H
  const tab = (o: Record<string, unknown>) => ({ id: 1, url: 'https://a.com/', title: 'A', lastAccessed: old, groupId: -1, ...o })
  const after = 12 * H
  eq('archive: an old plain tab is idle', isIdle(tab({}), after, now), true)
  eq('archive: exactly the limit counts', isIdle(tab({ lastAccessed: now - after }), after, now), true)
  eq('archive: a recent tab stays', isIdle(tab({ lastAccessed: now - 11 * H }), after, now), false)
  eq('archive: pinned, on screen and playing sound stay', [isIdle(tab({ pinned: true }), after, now), isIdle(tab({ active: true }), after, now), isIdle(tab({ audible: true }), after, now)], [false, false, false])
  eq('archive: a tab in a group stays', isIdle(tab({ groupId: 4 }), after, now), false)
  eq('archive: browser pages stay', isIdle(tab({ url: 'chrome://settings/' }), after, now), false)
  eq('archive: a tab Chrome can\'t date stays', [isIdle(tab({ lastAccessed: undefined }), after, now), isIdle(tab({ lastAccessed: 0 }), after, now)], [false, false])
  const plan = planArchive(
    [
      tab({ id: 1 }),
      tab({ id: 2, active: true }),
      tab({ id: 3, url: 'https://b.com/', title: '  ' }),
      tab({ id: 4 }),
      tab({ id: 5, pinned: true }),
    ],
    after,
    now,
  )
  eq('archive: a URL open twice is saved once and both close', plan, { links: [{ title: 'A', url: 'https://a.com/' }, { title: 'https://b.com/', url: 'https://b.com/' }], tabIds: [1, 3, 4] })
  eq('archive: nothing idle, nothing planned', planArchive([tab({ lastAccessed: now })], after, now), { links: [], tabIds: [] })
  eq('archive: stored choices read back', ARCHIVE_AFTER.map((c) => parseArchiveAfter({ afterMs: c.ms })), ARCHIVE_AFTER.map((c) => c.ms))
  eq('archive: junk settings mean off', [parseArchiveAfter(null), parseArchiveAfter({ afterMs: 5 }), parseArchiveAfter({ afterMs: '43200000' }), parseArchiveAfter('x')], [null, null, null, null])
  eq('archive: 12 hours is a choice', ARCHIVE_AFTER.some((c) => c.ms === 12 * H), true)
  eq('archive: one dated stack a day', archiveStackTitle(new Date(2026, 10, 2, 9)) === archiveStackTitle(new Date(2026, 10, 2, 23)) && archiveStackTitle(new Date(2026, 10, 2)).startsWith('Archived '), true)
  eq('archive: toast wording', [archivedNote(1), archivedNote(3)], ['1 idle tab', '3 idle tabs'])
  // 3 Nov fix: lastAccessed only moves when a tab comes on screen, so the time it was left counts.
  const seenOld = { since: now - 48 * H, left: {} as Record<string, number> }
  eq('archive: a tab on screen all day and just left stays', isIdle(tab({ id: 7 }), after, now, { since: now - 48 * H, left: { 7: now - 60_000 } }), false)
  eq('archive: a tab left long ago goes', isIdle(tab({ id: 7 }), after, now, { since: now - 48 * H, left: { 7: now - 13 * H } }), true)
  eq('archive: no record yet counts from when the record began', [isIdle(tab({ id: 8 }), after, now, { since: now - 2 * H, left: {} }), isIdle(tab({ id: 8 }), after, now, seenOld)], [false, true])
  eq('archive: the plan uses the left times', planArchive([tab({ id: 1 }), tab({ id: 2, url: 'https://b.com/' })], after, now, { since: now - 48 * H, left: { 1: now - 5 * H } }).tabIds, [2])
  // 0.8.0: tab switches are recorded only while auto-archive is on.
  eq('archive: tab switches are recorded only while auto-archive is on', [tracksTabs({ afterMs: 12 * H }), tracksTabs(null), tracksTabs(undefined), tracksTabs({ afterMs: 5 })], [true, false, false, false])
}

// ---------- Stackboard Pro (0.7.0) ----------
{
  const DAY = 86_400_000
  const now = Date.UTC(2026, 11, 1)
  const good = { key: 'SB-1', activationId: 'a', status: 'granted' as const, checkedAt: now, okAt: now }
  eq('pro: nothing at all is free', proState({ license: null, trialStartedAt: null, now }), { kind: 'free', trialUsed: false })
  eq('pro: a granted key is pro', proState({ license: good, trialStartedAt: null, now }), { kind: 'pro' })
  eq('pro: trial day 1 shows 14 days', proState({ license: null, trialStartedAt: now, now }), { kind: 'trial', daysLeft: 14 })
  eq('pro: trial last hours show 1 day', trialDaysLeft(now - 14 * DAY + 3_600_000, now), 1)
  eq('pro: an ended trial is free and used', proState({ license: null, trialStartedAt: now - 14 * DAY, now }), { kind: 'free', trialUsed: true })
  eq('pro: a running trial beats a key with a problem', proState({ license: { key: 'x', status: 'revoked' }, trialStartedAt: now - DAY, now }).kind, 'trial')
  eq('pro: a good key beats a trial', proState({ license: good, trialStartedAt: now, now }).kind, 'pro')
  eq('pro: revoked pauses as ended', proState({ license: { ...good, status: 'revoked' }, trialStartedAt: null, now }), { kind: 'paused', reason: 'ended' })
  eq('pro: past expires_at pauses as ended', proState({ license: { ...good, expiresAt: now - 1 }, trialStartedAt: null, now }), { kind: 'paused', reason: 'ended' })
  eq('pro: offline 13 days keeps pro', proState({ license: { ...good, okAt: now - 13 * DAY }, trialStartedAt: null, now }).kind, 'pro')
  eq('pro: offline 15 days pauses', proState({ license: { ...good, okAt: now - OFFLINE_GRACE_MS - DAY }, trialStartedAt: null, now }), { kind: 'paused', reason: 'offline' })
  eq('pro: a key never answered is checking', proState({ license: { key: 'SB-1' }, trialStartedAt: null, now }), { kind: 'paused', reason: 'checking' })
  for (const r of ['disabled', 'unknown-key', 'device-limit', 'removed'] as const) {
    eq(`pro: ${r} pauses with that reason`, proState({ license: { key: 'k', status: r }, trialStartedAt: null, now }), { kind: 'paused', reason: r })
  }
  eq(
    'pro: hasPro for pro and trial only',
    [{ kind: 'pro' }, { kind: 'trial', daysLeft: 3 }, { kind: 'free', trialUsed: false }, { kind: 'paused', reason: 'offline' }].map((s) => hasPro(s as never)),
    [true, true, false, false],
  )
  eq('pro: an early user who kept to-do lists makes them without Pro', canMakeTodo({ kind: 'free', trialUsed: true }, true), true)
  eq('pro: new users need Pro or a trial for a to-do list', [canMakeTodo({ kind: 'free', trialUsed: false }, false), canMakeTodo({ kind: 'trial', daysLeft: 2 }, false)], [false, true])
  // 0.8.0 (the maintainer, 3 Nov): to-do lists join Pro for early users too, unless they already had a list.
  eq('pro: the early to-do decision reads { keep }', [readEarlyTodo({ keep: true, at: 1 }), readEarlyTodo({ keep: false }), readEarlyTodo(undefined), readEarlyTodo({ keep: 'yes' }), readEarlyTodo(null)], [true, false, null, null, null])
  eq('pro: an early user with a list on the board keeps to-do lists free', decideEarlyTodo({ stored: undefined, hasLists: true, syncKeys: [] }), { keep: true, write: true })
  eq('pro: items in sync count as a list (the marker may not have synced yet)', decideEarlyTodo({ stored: undefined, hasLists: false, syncKeys: ['proEarly', 'todo:abcdefghijklmnop'] }), { keep: true, write: true })
  eq('pro: no list anywhere means to-do lists need Pro (due keys alone are no list)', decideEarlyTodo({ stored: undefined, hasLists: false, syncKeys: ['proEarly', 'todoDue:abc', 'todoish'] }), { keep: false, write: true })
  eq('pro: a stored decision stands, lists or not', [decideEarlyTodo({ stored: { keep: false, at: 1 }, hasLists: true, syncKeys: ['todo:x'] }), decideEarlyTodo({ stored: { keep: true, at: 1 }, hasLists: false, syncKeys: [] })], [{ keep: false, write: false }, { keep: true, write: false }])
  eq('pro: only early users keep to-do lists free', [keepsTodoFree({ early: true, earlyTodo: true }), keepsTodoFree({ early: true, earlyTodo: false }), keepsTodoFree({ early: true, earlyTodo: null }), keepsTodoFree({ early: false, earlyTodo: true })], [true, false, false, false])

  eq('pro: needsCheck when never checked', needsCheck({ key: 'k' }, now), true)
  eq('pro: no check within three days', needsCheck({ ...good, checkedAt: now - RECHECK_MS + 1 }, now), false)
  eq('pro: check again after three days', needsCheck({ ...good, checkedAt: now - RECHECK_MS }, now), true)
  eq('pro: no key, no check', needsCheck(null, now), false)

  eq('pro: versions compare numerically', [compareVersions('0.6.1', '0.7.0'), compareVersions('0.10.0', '0.9.9'), compareVersions('0.7', '0.7.0'), compareVersions('1.0.0', '0.7.0')], [-1, 1, 0, 1])
  eq('pro: an update from 0.6.1 is early', isEarlyUser({ updatedFrom: '0.6.1' }), true)
  eq('pro: an update from 0.7.0 is not early', isEarlyUser({ updatedFrom: '0.7.0', installedAt: PRO_CUTOFF + DAY }), false)
  eq('pro: a board older than Pro is early', isEarlyUser({ installedAt: PRO_CUTOFF - DAY }), true)
  eq('pro: a new board is not early', isEarlyUser({ installedAt: PRO_CUTOFF + DAY }), false)

  eq('pro: early users always get the early link', [checkoutUrl(true, now), checkoutUrl(true, FOUNDING_ENDS + DAY)], [CHECKOUT.early, CHECKOUT.early])
  eq('pro: founding link until 31 Dec, regular after', [checkoutUrl(false, FOUNDING_ENDS), checkoutUrl(false, FOUNDING_ENDS + 1)], [CHECKOUT.founding, CHECKOUT.regular])
  {
    // 0.9.1: buy buttons label the link with the button, the plan and the version, nothing else.
    const u = new URL(checkoutUrl(false, now, { surface: 'trial-end', plan: 'trial', version: '0.9.1' }))
    eq('pro: a labelled checkout link keeps its checkout and carries four labels', [u.origin + u.pathname, [...u.searchParams.keys()].sort().join(',')], [CHECKOUT.founding, 'utm_campaign,utm_content,utm_medium,utm_source'])
    eq('pro: the labels say button, plan and version', [u.searchParams.get('utm_source'), u.searchParams.get('utm_medium'), u.searchParams.get('utm_content'), u.searchParams.get('utm_campaign')], ['extension', 'trial-end', 'trial', 'v0.9.1'])
    const dev = new URL(checkoutUrl(true, now, { surface: 'settings', plan: 'free', version: 'not a version', dev: true }))
    eq('pro: an unpacked build is labelled dev, and a bad version is left out', [dev.origin + dev.pathname, dev.searchParams.get('utm_source'), dev.searchParams.has('utm_campaign')], [CHECKOUT.early, 'extension-dev', false])
    eq('pro: the plan label follows the Pro state', [checkoutPlan({ kind: 'free', trialUsed: false }), checkoutPlan({ kind: 'free', trialUsed: true }), checkoutPlan({ kind: 'trial', daysLeft: 3 }), checkoutPlan({ kind: 'paused', reason: 'ended' })], ['free', 'trial-ended', 'trial', 'paused'])
    // 0.9.2: a trial that started by itself on install says so; a paused key and a never-tried board read as before.
    eq('pro: an auto trial reads auto-trial, and auto-trial-ended once over', [checkoutPlan({ kind: 'trial', daysLeft: 9 }, true), checkoutPlan({ kind: 'free', trialUsed: true }, true), checkoutPlan({ kind: 'paused', reason: 'ended' }, true), checkoutPlan({ kind: 'free', trialUsed: false }, true)], ['auto-trial', 'auto-trial-ended', 'paused', 'free'])
  }
  eq('pro: price labels', [priceLabel(true, FOUNDING_ENDS + DAY), priceLabel(false, now), priceLabel(false, FOUNDING_ENDS + 1)], ['$2.99 a year', '$2.99 a year', '$4.99 a year'])

  eq('pro: cleanKey trims spaces, quotes and line breaks', cleanKey(' "SB-1A2B3C4D-AAAA-BBBB"\n'), 'SB-1A2B3C4D-AAAA-BBBB')
  eq('pro: cleanKey refuses junk', [cleanKey(''), cleanKey('short'), cleanKey('SB-<script>')], [null, null, null])
  eq('pro: maskKey keeps the prefix and last four', maskKey('SB-1A2B3C4D-AAAA-BBBB-9F2C'), 'SB-...-9F2C')

  eq('pro: activation id read', readActivation(200, { id: 'act-1' }), { activationId: 'act-1' })
  eq('pro: five computers already', readActivation(403, { error: 'NotPermitted' }), { error: 'device-limit' })
  eq('pro: unknown key on activate', [readActivation(404, {}), readActivation(422, {})], [{ error: 'unknown-key' }, { error: 'unknown-key' }])
  eq('pro: offline on activate', readActivation(0, null), { error: 'network' })
  const prev = { key: 'SB-1', activationId: 'a', status: 'granted' as const, checkedAt: now - 5 * DAY, okAt: now - 5 * DAY }
  const ok = readValidation(200, { benefit_id: PRO_BENEFIT_ID, status: 'granted', expires_at: null }, prev, now)
  eq('pro: a granted answer refreshes both stamps', [ok.status, ok.checkedAt, ok.okAt, ok.expiresAt], ['granted', now, now, null])
  const gone = readValidation(200, { benefit_id: PRO_BENEFIT_ID, status: 'revoked', expires_at: '2026-11-30T00:00:00Z' }, prev, now)
  eq('pro: revoked keeps the last good stamp', [gone.status, gone.okAt, gone.expiresAt], ['revoked', prev.okAt, Date.parse('2026-11-30T00:00:00Z')])
  eq('pro: a key for another product is unknown', readValidation(200, { benefit_id: 'other', status: 'granted' }, prev, now).status, 'unknown-key')
  eq('pro: 404 means unknown key', readValidation(404, { error: 'ResourceNotFound' }, prev, now).status, 'unknown-key')
  eq('pro: offline leaves the license alone', readValidation(0, null, prev, now), prev)
  eq('pro: a server error leaves the license alone', readValidation(503, null, prev, now), prev)
  // 3 Nov fix: Polar's own words (license_key service.py) tell an ended key from an unknown one.
  eq('pro: activation limit reached', readActivation(403, { error: 'NotPermitted', detail: 'License key activation limit already reached' }), { error: 'device-limit' })
  eq('pro: activating a refunded or lapsed key says it ended', [readActivation(403, { detail: 'License key is no longer active. ' }), readActivation(403, { detail: 'License key has expired.' })], [{ error: 'ended' }, { error: 'ended' }])
  eq('pro: a key without activations is no usable key', readActivation(403, { detail: 'This license key does not support activations. ' }), { error: 'unknown-key' })
  eq('pro: an unknown key still reads as unknown', readActivation(404, { error: 'ResourceNotFound', detail: 'Not found' }), { error: 'unknown-key' })
  eq('pro: validating a refunded key pauses Pro as ended', [readValidation(404, { detail: 'License key is no longer active.' }, prev, now).status, readValidation(404, { detail: 'License key has expired.' }, prev, now).status], ['revoked', 'revoked'])
  eq('pro: validating an unknown key', readValidation(404, { error: 'ResourceNotFound', detail: 'Not found' }, prev, now).status, 'unknown-key')
  eq('pro: an ended key shows Renew', proState({ license: { ...prev, status: 'revoked' }, trialStartedAt: null, now }), { kind: 'paused', reason: 'ended' })
  eq('snapshots: a shrunken board keeps 30 days', keysToPrune(Array.from({ length: 32 }, (_, i) => `2026-10-${String(i % 31 + 1).padStart(2, '0')}`).slice(0, 31), SNAPSHOT_KEEP_SHRUNK).length, 1)
}

// ---------- 0.7.0: daily snapshots ----------
{
  eq('snapshots: dayKey is the local calendar day', dayKey(new Date(2026, 10, 2, 23, 59)), '2026-11-02')
  eq('snapshots: dayKey pads month and day', dayKey(new Date(2027, 0, 5, 0, 0)), '2027-01-05')
  const keys = Array.from({ length: 16 }, (_, i) => dayKey(new Date(2026, 10, 1 + i)))
  eq('snapshots: the newest 14 stay', keysToPrune(keys), ['2026-11-01', '2026-11-02'])
  eq('snapshots: nothing to prune at 14', keysToPrune(keys.slice(0, 14)), [])
  eq('snapshots: keys that are not days always go', keysToPrune(['2026-11-02', 'oops']), ['oops'])
  eq('snapshots: pruning ignores the order keys arrive in', keysToPrune(['2026-11-03', '2026-11-01', '2026-11-02'], 2), ['2026-11-01'])
  eq('snapshots: a restored copy carries the day', restoredName('Work', '2026-11-02'), 'Work (2 Nov)')
  eq('snapshots: a copy restored again swaps the date', restoredName('Work (2 Nov)', '2026-11-03'), 'Work (3 Nov)')
  eq('snapshots: day labels', [shortDay('2026-11-02'), dayLabel('2026-11-02'), dayLabel('2027-01-01')], ['2 Nov', 'Mon, 2 Nov', 'Fri, 1 Jan'])

  const backup: BookmarkBackup = {
    version: 1,
    exportedAt: '2026-11-02T00:00:00.000Z',
    spaces: [
      {
        emoji: '⚡',
        name: 'Work',
        stacks: [
          { name: 'Docs', bookmarks: [{ title: 'A', url: 'https://a.example' }, { title: 'B', url: 'https://b.example' }] },
          { name: 'Today', bookmarks: [], todo: [{ text: 'Ship it', done: false }, { text: 'Sleep', done: true }] },
        ],
      },
      { emoji: '📚', name: 'Reading', stacks: [{ name: 'Later', bookmarks: [{ title: 'C', url: 'https://c.example' }] }] },
    ],
  }
  const counts = countBackup(backup)
  eq('snapshots: counts', counts, { spaces: 2, stacks: 3, links: 3, lists: 1, items: 2 })
  eq('snapshots: summary line', summaryLine({ day: '2026-11-02', counts }), 'Mon, 2 Nov: 2 spaces, 3 links, 1 to-do list')
  eq('snapshots: a space line has no space count', countsText(countSpace(backup.spaces[1])), '1 link')
  const emptyStacks: BookmarkBackup = { ...backup, spaces: [{ emoji: '⚡', name: 'Empty', stacks: [{ name: 'S', bookmarks: [] }] }] }
  eq(
    'snapshots: empty boards are never saved',
    [isEmptyBoard(counts), isEmptyBoard(countBackup({ ...backup, spaces: [] })), isEmptyBoard(countBackup(emptyStacks))],
    [false, true, true],
  )
  eq('snapshots: to-do items alone are worth a snapshot', isEmptyBoard({ spaces: 1, stacks: 1, links: 0, lists: 1, items: 1 }), false)
  eq('snapshots: a stored record reads back with fresh counts', parseSnapshot({ day: '2026-11-02', at: 5, counts: { spaces: 99 }, backup })?.counts, counts)
  eq(
    'snapshots: broken records are dropped',
    [parseSnapshot(null), parseSnapshot({ day: 'today', backup }), parseSnapshot({ day: '2026-11-02', backup: { version: 2, spaces: [] } })],
    [null, null, null],
  )
  eq(
    'snapshots: newest first',
    sortSnapshots([{ day: '2026-11-01' }, { day: '2026-11-03' }, { day: '2026-11-02' }] as Snapshot[]).map((s) => s.day),
    ['2026-11-03', '2026-11-02', '2026-11-01'],
  )
}

// ---------- 0.7.0: Pro looks ----------
import {
  ACCENT_PRESETS,
  ACCENT_VAR_NAMES,
  DEFAULT_LOOKS,
  FONTS,
  WALLPAPERS,
  accentHoverFor,
  accentVars,
  effectiveLooks,
  lookMirror,
  mergeLooks,
  normalizeHex,
  onAccentFor,
  parseLooks,
} from '../src/lib/looks'
import { looksFromMirror } from '../src/lib/appearance'
import indexCss from '../src/styles/index.css'
{
  eq('looks: nothing stored gives the defaults', parseLooks(undefined), DEFAULT_LOOKS)
  eq('looks: junk falls back field by field', parseLooks({ accent: 'red', font: 'comic', tile: 'huge', wallpaper: 'video' }), DEFAULT_LOOKS)
  const mine = { accent: '#2563eb', font: 'mono', tile: 'large', wallpaper: 'waves' }
  eq('looks: a full set survives a round trip', parseLooks(JSON.parse(JSON.stringify(mine))), mine)
  eq('looks: colours are read as #rrggbb', [normalizeHex('#ABC'), normalizeHex(' #2563EB '), normalizeHex('2563eb'), normalizeHex('#12345'), normalizeHex(42)], ['#aabbcc', '#2563eb', null, null, null])
  eq('looks: merging keeps the rest', mergeLooks(parseLooks(mine), { tile: 'small' }), { ...mine, tile: 'small' })
  eq('looks: merging validates too', mergeLooks(parseLooks(mine), { font: 'papyrus' as never }).font, 'default')
  eq('looks: Pro off shows the stock board, Pro on shows the picks', [effectiveLooks(parseLooks(mine), false), effectiveLooks(parseLooks(mine), true)], [DEFAULT_LOOKS, mine])

  // Button text on a custom accent: white while it clears AA, black otherwise, never below 4.5:1.
  eq('accent: text on white and black', [onAccentFor('#ffffff'), onAccentFor('#000000')], ['#000000', '#ffffff'])
  eq('accent: bright yellow gets black text, blue gets white', [onAccentFor('#ffd60a'), onAccentFor('#2563eb')], ['#000000', '#ffffff'])
  eq('accent: every preset carries white text at AA', ACCENT_PRESETS.filter((p) => onAccentFor(p.hex) !== '#ffffff' || contrastRatio('#ffffff', p.hex) < 4.5).map((p) => p.name), [])
  const sample = ['#ffd60a', '#00ff00', '#00ffff', '#ff00ff', '#ff0000', '#0000ff', '#808080', '#ffffff', '#000000', '#e4732f', ...ACCENT_PRESETS.map((p) => p.hex)]
  eq('accent: button text clears AA on any colour', sample.filter((c) => contrastRatio(onAccentFor(c), c) < 4.5), [])
  eq('accent: hover only adds contrast', sample.filter((c) => contrastRatio(onAccentFor(c), accentHoverFor(c)) < contrastRatio(onAccentFor(c), c)), [])
  // Text and marks in the accent colour, against the surfaces of the palettes that ship.
  const surfaces = (scheme: string) =>
    blocks.filter((b) => b.scheme === scheme).flatMap((b) => ['canvas', 'panel', 'card', 'raised'].map((k) => b.tokens.get(k) ?? '#ff00ff'))
  const misses: string[] = []
  for (const c of sample) {
    const v = accentVars(c)
    for (const s of surfaces('light')) {
      if (contrastRatio(v['--sb-custom-text-light'], s) < 4.5) misses.push(`${c} text on ${s}`)
      if (contrastRatio(v['--sb-custom-mark-light'], s) < 3) misses.push(`${c} mark on ${s}`)
    }
    for (const s of surfaces('dark')) {
      if (contrastRatio(v['--sb-custom-text-dark'], s) < 4.5) misses.push(`${c} text on ${s}`)
      if (contrastRatio(v['--sb-custom-mark-dark'], s) < 3) misses.push(`${c} mark on ${s}`)
    }
    for (const b of blocks) {
      const inv = b.tokens.get('inverse') ?? '#ff00ff'
      if (contrastRatio(v['--sb-custom-text-dark'], inv) < 4.5) misses.push(`${c} toast text on ${inv}`)
    }
  }
  eq('accent: text clears AA and marks clear 3:1 on every palette surface', misses, [])
  eq('accent: the variable list matches what is set', Object.keys(accentVars('#2563eb')), [...ACCENT_VAR_NAMES])

  // The boot copy: the first frame shows the look Pro allows, the saved picks wait underneath.
  const a0 = parseAppearance({ palette: 'nord', bg: { kind: 'gradient', gradient: 2 } })
  const on = bootMirror(a0, parseLooks(mine), true)
  const off = bootMirror(a0, parseLooks(mine), false)
  eq(
    'mirror: Pro on carries the look for the first frame',
    [on.look.accent, on.look.font, on.look.tile, on.look.wallpaper, on.look.fontStack === FONTS.find((f) => f.id === 'mono')?.stack],
    ['#2563eb', 'mono', 'large', 'waves', true],
  )
  eq('mirror: Pro off carries the stock look', off.look, lookMirror(DEFAULT_LOOKS, true))
  eq('mirror: the free background stays put under a wallpaper', [on.bg, on.gradient, on.settings], ['gradient', 2, a0])
  eq('mirror: saved looks and the Pro answer come back', [looksFromMirror(JSON.stringify(off)), looksFromMirror(JSON.stringify(on)).pro], [{ looks: mine, pro: false }, true])
  eq('mirror: no copy or a broken one gives the default looks', [looksFromMirror(null), looksFromMirror('{oops')], [{ looks: DEFAULT_LOOKS, pro: false }, { looks: DEFAULT_LOOKS, pro: false }])
  eq('mirror: the accent variables ride along', Object.keys(on.look.vars), [...ACCENT_VAR_NAMES])

  eq(
    'fonts: unique ids, every stack ends on a generic family',
    [new Set(FONTS.map((f) => f.id)).size === FONTS.length, FONTS.filter((f) => f.stack && !/(sans-serif|serif|monospace)$/.test(f.stack)).map((f) => f.id)],
    [true, []],
  )
  eq(
    'wallpapers: each has a board rule and a Settings preview in index.css',
    WALLPAPERS.filter((w) => !indexCss.includes(`[data-wallpaper="${w.id}"] body`) || !indexCss.includes(`[data-wallpaper-preview="${w.id}"]`)).map((w) => w.id),
    [],
  )
}

// ---------- 0.7.1: due dates and repeats ----------
{
  eq('due: localDay is the local calendar day', [localDay(new Date(2026, 10, 2, 0, 1)), localDay(new Date(2026, 10, 2, 23, 59))], ['2026-11-02', '2026-11-02'])
  eq('due: parseDay takes real dates only', [!!parseDay('2026-11-02'), parseDay('2026-02-30'), parseDay('2026-2-3'), parseDay('2026-13-01'), parseDay(20261102), parseDay('')], [true, null, null, null, null, null])
  eq('due: addDays crosses months and years', [addDays('2026-12-31', 1), addDays('2026-03-01', -1), addDays('2028-02-28', 1)], ['2027-01-01', '2026-02-28', '2028-02-29'])

  // 2 Nov 2026 is a Monday; 6 Nov a Friday.
  eq('due: daily and weekly steps', [stepDue('2026-11-02', 'd'), stepDue('2026-11-02', 'w')], ['2026-11-03', '2026-11-09'])
  eq('due: weekdays skip the weekend', [stepDue('2026-11-02', 'wd'), stepDue('2026-11-06', 'wd'), stepDue('2026-11-07', 'wd'), stepDue('2026-11-08', 'wd')], ['2026-11-03', '2026-11-09', '2026-11-09', '2026-11-09'])
  eq('due: monthly keeps the day and clamps short months', [stepDue('2026-01-30', 'm'), stepDue('2026-01-31', 'm'), stepDue('2028-01-31', 'm'), stepDue('2026-12-15', 'm')], ['2026-02-28', '2026-02-28', '2028-02-29', '2027-01-15'])
  eq('due: without an anchor day (items saved before 0.8.0) a month-end date stays on month ends', [stepDue('2026-02-28', 'm'), stepDue('2026-11-30', 'm'), stepDue('2026-04-30', 'm')], ['2026-03-31', '2026-12-31', '2026-05-31'])
  // Review finding 4: the anchor day keeps a monthly repeat on its own day after a short month.
  const chain = (day: string, md: number, n: number) => { const out: string[] = []; for (let i = 0; i < n; i++) out.push((day = stepDue(day, 'm', md))); return out }
  eq('due: the 28th stays the 28th after February', chain('2027-01-28', 28, 4), ['2027-02-28', '2027-03-28', '2027-04-28', '2027-05-28'])
  eq('due: the 31st clamps and comes back', chain('2027-01-31', 31, 4), ['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
  eq('due: the 30th clamps in February only', chain('2027-01-30', 30, 3), ['2027-02-28', '2027-03-30', '2027-04-30'])
  eq('due: the 29th in a leap year', chain('2028-01-29', 29, 3), ['2028-02-29', '2028-03-29', '2028-04-29'])
  eq('due: an overdue monthly item keeps its anchor', nextDue('2027-01-28', 'm', '2027-03-01', 28), '2027-03-28')

  eq('due: an overdue daily item moves to tomorrow', nextDue('2026-11-02', 'd', '2026-11-04'), '2026-11-05')
  eq('due: an overdue weekly item keeps its weekday', nextDue('2026-11-02', 'w', '2026-11-11'), '2026-11-16')
  eq('due: an overdue weekday item skips the weekend', nextDue('2026-11-06', 'wd', '2026-11-09'), '2026-11-10')
  eq('due: ticking early moves one step past the due date', [nextDue('2026-11-05', 'd', '2026-11-02'), nextDue('2026-11-30', 'm', '2026-11-02')], ['2026-11-06', '2026-12-31'])

  eq('due: quick picks', [quickDay('today', '2026-11-02'), quickDay('tomorrow', '2026-11-02'), quickDay('next-week', '2026-11-02'), quickDay('next-week', '2026-11-07'), quickDay('next-week', '2026-11-08')], ['2026-11-02', '2026-11-03', '2026-11-09', '2026-11-09', '2026-11-09'])
  eq('due: labels', [dueLabel('2026-11-02', '2026-11-02'), dueLabel('2026-11-03', '2026-11-02'), dueLabel('2026-11-01', '2026-11-02'), dueLabel('2026-11-04', '2026-11-02', 'en-GB'), dueLabel('2027-01-05', '2026-11-02', 'en-GB')], ['Today', 'Tomorrow', 'Yesterday', 'Wed 4 Nov', 'Tue 5 Jan 2027'])
  eq('due: labels mid-sentence', [spokenDue('2026-11-03', '2026-11-02'), spokenDue('2026-11-04', '2026-11-02', 'en-GB')], ['tomorrow', 'Wed 4 Nov'])
  eq('due: overdue and due', [isOverdue('2026-11-01', '2026-11-02'), isOverdue('2026-11-02', '2026-11-02'), isDue('2026-11-02', '2026-11-02'), isDue('2026-11-03', '2026-11-02'), isDue(undefined, '2026-11-02')], [true, false, true, false, false])

  let l: TodoList = { v: 1, items: [{ id: 'a', text: 'Water plants', done: false, at: 1 }, { id: 'b', text: 'Pay rent', done: false, at: 2 }] }
  l = setDue(l, 'a', '2026-11-02')
  eq('due: setDue dates an item and leaves others alone', l.items.map((i) => i.d ?? null), ['2026-11-02', null])
  eq('due: setDue refuses a bad date', setDue(l, 'b', '2026-02-30'), l)
  l = setRepeat(l, 'b', 'm', '2026-11-02')
  eq('due: a repeat on an undated item starts today', [l.items[1].d, l.items[1].r], ['2026-11-02', 'm'])
  eq('due: clearing the date clears the repeat', setDue(l, 'b', null).items[1], { id: 'b', text: 'Pay rent', done: false, at: 2 })
  eq('due: turning the repeat off keeps the date', setRepeat(l, 'b', null, '2026-11-02').items[1], { id: 'b', text: 'Pay rent', done: false, at: 2, d: '2026-11-02' })

  eq('due: a monthly repeat remembers its day of the month', l.items[1].md, 2)
  const rent: TodoList = setRepeat(setDue({ v: 1, items: [{ id: 'r', text: 'Rent', done: false, at: 1 }] }, 'r', '2027-01-28'), 'r', 'm', '2027-01-20')
  eq('due: monthly on a dated item anchors on its date', [rent.items[0].d, rent.items[0].md], ['2027-01-28', 28])
  eq('due: a new date moves the anchor', setDue(rent, 'r', '2027-02-05').items[0].md, 5)
  eq('due: switching away from monthly drops the anchor', setRepeat(rent, 'r', 'w', '2027-01-20').items[0].md, undefined)
  let paid = rent
  const seen: string[] = []
  for (let i = 0; i < 3; i++) { paid = checkItem(paid, 'r', '2027-01-20', true).list; seen.push(paid.items[0].d!) }
  eq('due: ticking rent three times keeps the 28th', seen, ['2027-02-28', '2027-03-28', '2027-04-28'])
  const rolled = checkItem(l, 'b', '2026-11-02', true)
  eq('due: ticking a repeating item moves it on and keeps it open', [rolled.list.items[1].done, rolled.list.items[1].d, rolled.rolledTo], [false, '2026-12-02', '2026-12-02'])
  eq('due: undo puts a rolled date back', unrollItem(rolled.list, 'b', '2026-11-02', '2026-12-02').items[1].d, '2026-11-02')
  eq('due: undo leaves a date someone changed since', unrollItem(setDue(rolled.list, 'b', '2026-12-09'), 'b', '2026-11-02', '2026-12-02').items[1].d, '2026-12-09')
  eq('due: without Pro a repeating item ticks off like any other', [checkItem(l, 'b', '2026-11-02', false).list.items[1].done, checkItem(l, 'b', '2026-11-02', false).rolledTo], [true, null])
  eq('due: a plain dated item ticks off', checkItem(l, 'a', '2026-11-02', true).list.items[0].done, true)
  eq('due: a done repeating item unticks normally', checkItem({ v: 1, items: [{ ...l.items[1], done: true }] }, 'b', '2026-11-02', true).list.items[0].done, false)

  const lists = [
    { listId: 'L1', list: { v: 1 as const, items: [
      { id: '1', text: 'later', done: false, at: 1, d: '2026-11-03' },
      { id: '2', text: 'today', done: false, at: 2, d: '2026-11-02' },
      { id: '3', text: 'done', done: true, at: 3, d: '2026-11-01' },
      { id: '4', text: 'undated', done: false, at: 4 },
    ] } },
    { listId: 'L2', list: { v: 1 as const, items: [{ id: '5', text: 'overdue', done: false, at: 5, d: '2026-10-30' }] } },
    { listId: 'L3', list: null },
  ]
  eq('due: Today lists open items due today or earlier, earliest first', dueToday(lists, '2026-11-02').map((e) => `${e.listId}:${e.item.text}`), ['L2:overdue', 'L1:today'])
  eq('due: the sidebar count', countDue(lists.map((x) => x.list), '2026-11-02'), 2)

  eq(
    'due: parseList keeps a valid date and repeat, drops the rest',
    parseList({ items: [
      { id: 'a', text: 'ok', d: '2026-11-02', r: 'wd' },
      { id: 'b', text: 'bad day', d: '2026-13-01', r: 'd' },
      { id: 'c', text: 'repeat alone', r: 'w' },
      { id: 'e', text: 'bad rule', d: '2026-11-02', r: 'yearly' },
    ] }).items.map((i) => [i.id, i.d ?? null, i.r ?? null]),
    [['a', '2026-11-02', 'wd'], ['b', null, null], ['c', null, null], ['e', '2026-11-02', null]],
  )
  eq(
    'due: parseList keeps an anchor day on monthly items only',
    parseList({ items: [
      { id: 'm', text: 'monthly', d: '2027-02-28', r: 'm', md: 31 },
      { id: 'w', text: 'weekly', d: '2027-02-28', r: 'w', md: 31 },
      { id: 'x', text: 'bad anchor', d: '2027-02-28', r: 'm', md: 40 },
    ] }).items.map((i) => i.md ?? null),
    [31, null, null],
  )
  eq('due: backups carry the anchor day', [dueForBackup({ d: '2027-02-28', r: 'm', md: 31 }), dueFromBackup({ due: '2027-02-28', repeat: 'monthly', monthDay: 31 })], [{ due: '2027-02-28', repeat: 'monthly', monthDay: 31 }, { d: '2027-02-28', r: 'm', md: 31 }])
  eq('due: backups spell the rule out and read it back', [dueForBackup({ d: '2026-11-04', r: 'wd' }), dueFromBackup({ due: '2026-11-04', repeat: 'weekdays' })], [{ due: '2026-11-04', repeat: 'weekdays' }, { d: '2026-11-04', r: 'wd' }])
  eq('due: an undated item adds nothing to a backup', dueForBackup({}), {})
  eq('due: broken backup dates are dropped', [dueFromBackup({ due: 'soon' }), dueFromBackup(null), dueFromBackup({ due: '2026-11-04', repeat: 'yearly' })], [{}, {}, { d: '2026-11-04' }])

  // Chrome's 8 KB sync item: half a list of dated, repeating items with real ids and times fits.
  let dated: TodoList = emptyList()
  for (let i = 0; i < 50; i++) dated = addItem(dated, `task number ${i}`, 1793624022197 + i, newTodoId())
  for (const it of dated.items) dated = setRepeat(setDue(dated, it.id, '2026-11-02'), it.id, 'wd', '2026-11-02')
  eq('due: 50 dated, repeating items fit the 8 KB sync item', listBytes(todoKey(newTodoId()), dated) < 8000, true)

  // 0.8.0 review: due data lives under its own key, so a computer still on 0.7.0 (which rewrites
  // todo:<id> with only id/text/done/at) can't erase it.
  {
    const list: TodoList = {
      v: 1,
      items: [
        { id: 'rent', text: 'Pay rent', done: false, at: 1, d: '2026-11-28', r: 'm', md: 28 },
        { id: 'call', text: 'Call the bank', done: false, at: 2 },
      ],
    }
    const { items, due } = splitDue(list)
    eq('due split: the items key carries no due fields', items.items.map((it) => ['d', 'r', 'md'].some((k) => k in it)), [false, false])
    eq('due split: the due key holds them by item id', due, { rent: { d: '2026-11-28', r: 'm', md: 28 } })
    // 0.7.0 saves the list after ticking "Call the bank": it keeps only id/text/done/at.
    const by070 = { v: 1, items: items.items.map(({ id, text, done, at }) => ({ id, text, done: id === 'call' ? true : done, at })) }
    const merged = mergeDue(parseList(by070), due)
    eq('due: a 0.7.0 rewrite of the items leaves due dates whole', merged.items, [
      { id: 'rent', text: 'Pay rent', done: false, at: 1, d: '2026-11-28', r: 'm', md: 28 },
      { id: 'call', text: 'Call the bank', done: true, at: 2 },
    ])
    // 0.7.0 deletes "Pay rent": its due entry is ignored, then dropped at the next save.
    const deleted = mergeDue(parseList({ v: 1, items: [{ id: 'call', text: 'Call the bank', done: true, at: 2 }] }), due)
    eq('due: an entry whose item is gone is ignored', deleted.items.map((it) => it.d ?? null), [null])
    eq('due: and dropped at the next save', splitDue(deleted).due, {})
    eq('due: a due day saved on the item (test builds) is still read', mergeDue(parseList({ items: [{ id: 'x', text: 'Old', d: '2026-12-01', r: 'w' }] }), undefined).items[0].d, '2026-12-01')
    eq('due: the due key wins over an old field on the item', mergeDue(parseList({ items: [{ id: 'x', text: 'Old', d: '2026-12-01' }] }), { x: { d: '2026-12-24' } }).items[0].d, '2026-12-24')
    eq('due: junk in the due key is dropped', parseDue({ a: { d: 'soon' }, b: { d: '2026-11-04', r: 'yearly' }, c: 7 }), { b: { d: '2026-11-04' } })
    eq('due: parseDue survives junk', [parseDue(null), parseDue([]), parseDue('x')], [{}, {}, {}])
    eq('todo: parseList keeps item fields from later versions', parseList({ items: [{ id: 'x', text: 'T', done: false, at: 1, prio: 2 }] }).items[0], { prio: 2, id: 'x', text: 'T', done: false, at: 1 } as never)
    const full = splitDue(dated)
    eq('due: 50 dated, repeating items fit both 8 KB keys', [listBytes(todoKey('x'), full.items) < 8000, dueBytes(todoDueKey('x'), full.due) < 8000], [true, true])
  }
}

// ---------- 0.7.1: clean-up ----------
{
  const DAY = 86_400_000
  const now = Date.UTC(2026, 10, 3)
  eq('clean-up: host lowercased, trailing slash dropped', normalizeUrl('https://Example.COM/Docs/'), 'https://example.com/Docs')
  eq('clean-up: a bare domain matches its slash form', normalizeUrl('https://a.com/') === normalizeUrl('https://a.com'), true)
  eq('clean-up: tracking parameters dropped, the rest kept in order', normalizeUrl('https://a.com/p?id=7&utm_source=x&utm_medium=y&fbclid=z&q=2#top'), 'https://a.com/p?id=7&q=2#top')
  eq('clean-up: the path decides', normalizeUrl('https://a.com/x') === normalizeUrl('https://a.com/y'), false)
  eq('clean-up: the scheme decides', normalizeUrl('http://a.com/') === normalizeUrl('https://a.com/'), false)
  eq('clean-up: non-web links are left as they are', [normalizeUrl(' javascript:alert(1) '), normalizeUrl('not a url')], ['javascript:alert(1)', 'not a url'])

  const link = (id: string, url: string, o: Partial<CleanLink> = {}): CleanLink => ({
    id, url, title: id, spaceName: 'Work', spaceEmoji: '⚡', stackTitle: 'Dailies', parentId: 's1', index: 0, ...o,
  })
  const links = [
    link('a', 'https://a.com/'),
    link('b', 'https://b.com/'),
    link('c', 'https://A.com', { stackTitle: 'Docs' }),
    link('d', 'https://a.com/?utm_source=news', { spaceName: 'Home', spaceEmoji: '🏠' }),
    link('e', 'https://b.com/page'),
  ]
  const groups = findDuplicates(links)
  eq('clean-up: copies group by the matching form, in board order', groups.map((g) => g.links.map((l) => l.id)), [['a', 'c', 'd']])
  eq('clean-up: every copy after the first is ticked', extraCopies(groups), ['c', 'd'])
  eq('clean-up: duplicates summary', [duplicatesSummary(groups), duplicatesSummary([])], ['1 link saved more than once, 2 extra copies.', 'No link is saved twice.'])
  eq('clean-up: where a copy lives', locationLabel(links[3]), '🏠 Home › Dailies')

  const old = now - 200 * DAY
  const opens = new Map([[normalizeUrl('https://seen.com'), now - 10 * DAY]])
  eq('clean-up: old and never opened is unused', isUnused(link('x', 'https://x.com', { dateAdded: old }), opens, now), true)
  eq('clean-up: added recently is never unused', isUnused(link('x', 'https://x.com', { dateAdded: now - 20 * DAY }), opens, now), false)
  eq('clean-up: an open on the board keeps it', isUnused(link('x', 'https://seen.com/', { dateAdded: old }), opens, now), false)
  eq("clean-up: Chrome's own record counts too", isUnused(link('x', 'https://x.com', { dateAdded: old, dateLastUsed: now - 30 * DAY }), opens, now), false)
  eq('clean-up: an open over six months ago is unused', isUnused(link('x', 'https://x.com', { dateAdded: old, dateLastUsed: now - UNUSED_MS - DAY }), opens, now), true)
  eq('clean-up: no add date, never called unused', isUnused(link('x', 'https://x.com'), opens, now), false)
  eq('clean-up: the later of the two records wins', lastOpened(link('x', 'https://seen.com', { dateLastUsed: now - 50 * DAY }), opens), now - 10 * DAY)
  eq('clean-up: findUnused keeps board order', findUnused([link('p', 'https://p.com', { dateAdded: old }), link('q', 'https://q.com', { dateAdded: now }), link('r', 'https://r.com', { dateAdded: old })], opens, now).map((l) => l.id), ['p', 'r'])
  eq('clean-up: unused summary', [unusedSummary(2), unusedSummary(0)], ['2 links not opened in six months.', 'Nothing older than six months sits unopened.'])
  eq('clean-up: never opened reads plainly', openedWords(0), 'Never opened')
  eq('clean-up: a past open names the month', openedWords(Date.UTC(2025, 2, 15)).startsWith('Last opened '), true)

  eq('clean-up: only web pages are checked', [isCheckable('https://a.com'), isCheckable('http://a.com'), isCheckable('data:text/plain,hi'), isCheckable('chrome-extension://abc/x.html'), isCheckable('javascript:void(0)')], [true, true, false, false, false])
  eq('clean-up: one check per page, the first address as saved', checkTargets([...links, link('j', 'javascript:void(0)')]), ['https://a.com/', 'https://b.com/', 'https://b.com/page'])
  eq('clean-up: a timeout and a failed connection read differently', [readCheckError({ name: 'TimeoutError' }), readCheckError({ name: 'AbortError' }), readCheckError(new TypeError('Failed to fetch'))], ['timeout', 'timeout', 'failed'])
  const results = new Map([[normalizeUrl('https://a.com/'), 'failed' as const], [normalizeUrl('https://b.com/'), 'ok' as const], [normalizeUrl('https://b.com/page'), 'timeout' as const]])
  eq('clean-up: every copy of a dead page is listed', unreachableLinks(links, results).map((l) => l.id), ['a', 'c', 'd', 'e'])
  eq('clean-up: most checks failing means the connection, not the links', [looksOffline(10, 9), looksOffline(10, 3), looksOffline(3, 3)], [true, false, false])
  eq('clean-up: remove button wording', [removeButtonLabel(0), removeButtonLabel(1), removeButtonLabel(12)], ['Remove selected', 'Remove 1 link', 'Remove 12 links'])
  eq('clean-up: the second try asks the same site for its icon', [secondProbe('https://fonts.google.com/icons?x=1'), secondProbe('http://a.com:8080/p'), secondProbe('data:text/plain,hi'), secondProbe('nope')], ['https://fonts.google.com/favicon.ico', 'http://a.com:8080/favicon.ico', null, null])

  // Review fix 7 (3 Nov): the check asks each site's home page once, never the saved page.
  eq('clean-up: the check asks the home page', [siteOf('https://a.com/unsubscribe?token=1'), siteOf('http://b.com:8080/x'), siteOf('data:text/plain,hi'), siteOf('nope')], ['https://a.com/', 'http://b.com:8080/', null, null])
  eq('clean-up: one check per site, every page listed under it', [...groupBySite(['https://a.com/1', 'https://a.com/2', 'https://b.com/', 'javascript:void(0)']).entries()], [['https://a.com/', ['https://a.com/1', 'https://a.com/2']], ['https://b.com/', ['https://b.com/']]])

  // Review fix 8 (3 Nov): every link counts as opened when counting started, so Unused stays
  // empty until six months of real counting exist.
  const since = now - 30 * DAY
  eq('clean-up: nothing is unused in the first six months of counting', isUnused(link('x', 'https://x.com', { dateAdded: old }), opens, now, UNUSED_MS, since), false)
  eq('clean-up: after six months of counting, an unopened link shows', isUnused(link('x', 'https://x.com', { dateAdded: old }), opens, now, UNUSED_MS, now - UNUSED_MS - DAY), true)
  eq('clean-up: findUnused takes the counting start', findUnused([link('p', 'https://p.com', { dateAdded: old })], opens, now, UNUSED_MS, since).length, 0)
  eq('clean-up: still counting', [stillCounting(since, now), stillCounting(now - UNUSED_MS - DAY, now)], [true, false])
  eq('clean-up: the counting note says when the list starts', countingNote(Date.UTC(2026, 10, 3, 12), Date.UTC(2026, 10, 5), 'en-GB').includes('starts on 5 May 2027'), true)
  eq('clean-up: skipped links in the toast', [skippedNote(0), skippedNote(1), skippedNote(2)], [undefined, '1 link had moved off the board and was left alone.', '2 links had moved off the board and were left alone.'])
}

// ---------- 0.7.1: AI tidy ----------
import {
  TIDY_ERRORS,
  TIDY_MAX_LINKS,
  cleanName,
  isNoop,
  markSame,
  readAnswer,
  readPlan,
  runApply,
  runUndo,
  tidyBlock,
  tidyBody,
  tidyInput,
  type BookmarksApi,
} from '../src/lib/tidyPlan'
import type { Space } from '../src/lib/types'
{
  const bm = (id: string, title = id.toUpperCase(), url = `https://${id}.example/`) => ({ id, title, url, parentStackId: '' })
  const space: Space = {
    id: 'S',
    rawTitle: '🧰 Tools',
    name: 'Tools',
    emoji: '🧰',
    stacks: [
      { id: 'T', title: 'This week', parentSpaceId: 'S', bookmarks: [], todo: { id: 'todo1', anchorId: 'm' } },
      { id: 'A', title: 'A', parentSpaceId: 'S', bookmarks: [bm('a1'), bm('a2', 'https://a2.example/'), bm('a3')] },
      { id: 'E', title: 'Later', parentSpaceId: 'S', bookmarks: [] },
      { id: 'B', title: 'B', parentSpaceId: 'S', bookmarks: [bm('b1'), bm('b2')] },
      { id: 'C', title: 'C', parentSpaceId: 'S', bookmarks: [bm('c1')] },
    ],
  }
  const input = tidyInput(space)
  eq('tidy: links in board order, to-do stacks left out', input.ids, ['a1', 'a2', 'a3', 'b1', 'b2', 'c1'])
  eq('tidy: a title that is just the address goes as no title', input.links[1], { title: '', url: 'https://a2.example/' })
  eq('tidy: every link stack is listed, empty ones too', input.stacks.map((s) => `${s.id}:${s.ids.length}`), ['A:3', 'E:0', 'B:2', 'C:1'])
  const many = { links: Array.from({ length: TIDY_MAX_LINKS + 1 }, () => ({ title: '', url: 'https://x/' })), ids: [], stacks: [] }
  eq('tidy: too few, enough, too many', [tidyBlock({ ...input, links: input.links.slice(0, 3) }), tidyBlock(input), tidyBlock(many)], ['few', null, 'many'])
  const body = tidyBody('x'.repeat(80), input, { key: 'SB-1', activationId: 'act' })
  eq('tidy: the body asks for one space and sends only the key and activation', [body.scope, body.space.length, body.links.length, body.license], ['space', 60, 6, { key: 'SB-1', activationId: 'act' }])
  eq('tidy: names are one line, 40 characters at most, never empty', [cleanName('  Daily\n  tools '), cleanName('y'.repeat(50)).length, cleanName(''), cleanName(null), cleanName('🍳'.repeat(45)).length], ['Daily tools', 40, 'Links', 'Links', 80])

  const board = {
    spaces: [
      { name: 'One', emoji: '1', stacks: [{ name: 'Reading', links: [3, 4, 4] }, { name: 'Tools', links: [2, 5, 99, -1, 1.5] }] },
      { name: 'Two', emoji: '2', stacks: [{ name: 'tools', links: [0, 3] }, { name: 'Empty', links: [] }] },
    ],
    missing: 0,
  }
  eq('tidy: spaces flatten, same names merge, each link once, the rest go to "To sort"', readPlan(board, 6), [
    { name: 'Reading', links: [3, 4] },
    { name: 'Tools', links: [2, 5, 0] },
    { name: 'To sort', links: [1] },
  ])
  eq('tidy: something that isn\'t a board', [readPlan(null, 3), readPlan({ spaces: 'x' }, 3), readPlan({}, 3)], [null, null, null])
  eq('tidy: an empty board puts everything in "To sort"', readPlan({ spaces: [] }, 2), [{ name: 'To sort', links: [0, 1] }])

  const plan = markSame([{ name: 'Reading', links: [4, 3] }, { name: 'Tools', links: [2, 5, 0] }, { name: 'Misc', links: [1] }], input)
  eq('tidy: a stack with exactly the same links is marked, whatever the order', plan.map((p) => p.sameAs ?? '-'), ['B', '-', '-'])
  const same = markSame([{ name: 'A', links: [0, 1, 2] }, { name: 'B', links: [3, 4] }, { name: 'C', links: [5] }], input)
  eq('tidy: the same stacks, names and order change nothing', [isNoop(same, input), isNoop(same.map((p, k) => (k === 1 ? { ...p, name: 'Bee' } : p)), input), isNoop([same[1], same[0], same[2]], input)], [true, false, false])

  eq('tidy: answers become a plan or words', [
    'plan' in readAnswer(200, { ok: true, board }, 6),
    readAnswer(200, { ok: true }, 6),
    readAnswer(402, { reason: 'pro' }, 6),
    readAnswer(429, { reason: 'daily-cap' }, 6),
    readAnswer(429, { reason: 'busy' }, 6),
    readAnswer(503, { reason: 'not-ready' }, 6),
    readAnswer(503, { reason: 'license-check' }, 6),
    readAnswer(422, { reason: 'refused' }, 6),
    readAnswer(400, { reason: 'count' }, 6),
    readAnswer(0, null, 6),
  ], [true, { error: 'answer' }, { error: 'pro' }, { error: 'cap' }, { error: 'busy' }, { error: 'not-ready' }, { error: 'busy' }, { error: 'refused' }, { error: 'too-many' }, { error: 'busy' }])
  eq('tidy: the error words', [TIDY_ERRORS.pro, TIDY_ERRORS.cap, TIDY_ERRORS.busy], ['Your Pro key needs attention', "That's today's limit, try again tomorrow", "Couldn't reach Stackboard, try again in a moment"])

  // An in-memory chrome.bookmarks with Chrome's rules: a same-parent move to a later index lands one
  // earlier (the item is taken out first), an index past the end is refused, and remove() refuses a
  // folder that still has children.
  type Node = { id: string; title: string; url?: string; parent?: string; kids?: string[] }
  const nodes = new Map<string, Node>()
  const put = (id: string, title: string, parent: string | undefined, kids?: string[], url?: string) => nodes.set(id, { id, title, url, parent, kids })
  put('S', 'Tools', undefined, ['T', 'A', 'L', 'E', 'B', 'C'])
  put('T', 'This week', 'S', ['m'])
  put('m', 'Stackboard to-do', 'T', undefined, 'https://getstackboard.com/todo#todo1')
  put('A', 'A', 'S', ['a1', 'a2', 'a3'])
  put('L', 'Loose link', 'S', undefined, 'https://loose.example/')
  put('E', 'Later', 'S', [])
  put('B', 'B', 'S', ['b1', 'b2'])
  put('C', 'C', 'S', ['c1', 'X'])
  put('X', 'Hidden folder', 'C', [])
  for (const [id, p] of [['a1', 'A'], ['a2', 'A'], ['a3', 'A'], ['b1', 'B'], ['b2', 'B'], ['c1', 'C']]) put(id, id, p, undefined, `https://${id}.example/`)
  let next = 0
  const api: BookmarksApi = {
    get: async (id) => {
      const n = nodes.get(id)
      if (!n) throw new Error("Can't find bookmark for id.")
      return [{ id, parentId: n.parent }]
    },
    getChildren: async (id) => (nodes.get(id)!.kids ?? []).map((k) => ({ id: k, title: nodes.get(k)!.title, url: nodes.get(k)!.url })),
    create: async ({ parentId, index, title, url }) => {
      const kids = nodes.get(parentId)!.kids!
      if (index !== undefined && index > kids.length) throw new Error('index out of range')
      const id = `n${++next}`
      put(id, title, parentId, url ? undefined : [], url)
      kids.splice(index ?? kids.length, 0, id)
      return { id }
    },
    move: async (id, { parentId, index }) => {
      const n = nodes.get(id)
      if (!n) throw new Error('no such node')
      const from = nodes.get(n.parent!)!.kids!
      const old = from.indexOf(id)
      from.splice(old, 1)
      const to = nodes.get(parentId)!.kids!
      let at = index ?? to.length
      if (parentId === n.parent && index !== undefined && index > old) at -= 1
      if (at > to.length) throw new Error('index out of range')
      to.splice(at, 0, id)
      n.parent = parentId
    },
    update: async (id, { title }) => {
      if (title !== undefined) nodes.get(id)!.title = title
    },
    remove: async (id) => {
      const n = nodes.get(id)!
      if (n.kids?.length) throw new Error("Can't remove non-empty folder")
      const kids = nodes.get(n.parent!)!.kids!
      kids.splice(kids.indexOf(id), 1)
      nodes.delete(id)
    },
  }
  const shape = (id: string): unknown => {
    const n = nodes.get(id)!
    return n.kids ? { [n.title]: n.kids.map(shape) } : n.title
  }
  const before = JSON.stringify(shape('S'))

  const rec = await runApply(api, 'S', plan, input)
  eq('tidy apply: planned stacks where the first stack was; a reused stack only moves and renames', shape('S'), {
    Tools: [{ 'This week': ['Stackboard to-do'] }, { Reading: ['b1', 'b2'] }, { Tools: ['a3', 'c1', 'a1'] }, { Misc: ['a2'] }, 'Loose link', { Later: [] }],
  })
  // 0.8.0: C kept only an empty folder once c1 moved out, so the folder goes with it (Undo remakes both).
  eq('tidy apply: emptied stacks are removed, with any empty folder left in them', [rec.removed, nodes.has('C'), rec.renamed, rec.created.length], [['A', 'X', 'C'], false, [{ id: 'B', from: 'B' }], 2])
  eq('tidy apply: links keep their ids (they move, nothing is re-made)', ['a1', 'a2', 'a3', 'b1', 'b2', 'c1'].every((id) => nodes.has(id)), true)

  const remade = await runUndo(api, rec)
  eq('tidy undo: the space is exactly as before (only removed stacks and folders have new ids)', [JSON.stringify(shape('S')) === before, remade.size, nodes.get('S')!.kids!.indexOf(remade.get('A')!)], [true, 3, 1])
  eq('tidy undo: links are back in their stacks in their places', [nodes.get(remade.get('A')!)!.kids, nodes.get('B')!.kids, nodes.get(remade.get('C')!)!.kids], [['a1', 'a2', 'a3'], ['b1', 'b2'], ['c1', remade.get('X')]])

  // A run that stopped halfway (here: the third new stack can't be made) still undoes cleanly.
  const half = { spaceId: 'S', children: [], stacks: [], renamed: [], created: [], removed: [] }
  const realCreate = api.create
  let made = 0
  api.create = async (arg) => {
    if (++made === 2) throw new Error('quota')
    return realCreate(arg)
  }
  const input2 = tidyInput({ ...space, stacks: space.stacks.map((s) => (remade.has(s.id) ? { ...s, id: remade.get(s.id)! } : s)) })
  const plan2 = markSame([{ name: 'One', links: [0] }, { name: 'Two', links: [1, 2] }, { name: 'Three', links: [3, 4, 5] }], input2)
  const failed = await runApply(api, 'S', plan2, input2, half).then(() => 'ok', (e: Error) => e.message)
  api.create = realCreate
  await runUndo(api, half)
  eq('tidy undo: a run that failed halfway is put back too', [failed, JSON.stringify(shape('S')) === before], ['quota', true])

  // Review fix 10 (3 Nov): a link that left the space between the preview and Apply (another tab,
  // Chrome's bookmark manager) is skipped, never pulled back in.
  put('OUT', 'Elsewhere', undefined, [])
  const plan3 = markSame([{ name: 'Everything', links: [0, 1, 2, 3, 4, 5] }], input2)
  await api.move('b2', { parentId: 'OUT' })
  const rec3 = await runApply(api, 'S', plan3, input2)
  eq('tidy apply: a link that left the space since the preview stays where it went', [rec3.skipped, nodes.get('b2')!.parent], [['b2'], 'OUT'])
  const remade3 = await runUndo(api, rec3)
  await api.move('b2', { parentId: remade3.get('B') ?? 'B', index: 1 })
  eq('tidy undo: the rest of the space comes back exactly', JSON.stringify(shape('S')) === before, true)
}

// ---------- 0.9.0: time of day, moving wallpapers, stack colours (Pro looks) ----------
import { DAY_ENDS as todEnds, DAY_STARTS as todStarts, schemeNow as todSchemeNow, timeScheme as todTimeScheme } from '../src/lib/appearance'
import { WALLPAPERS as todWallpapers, lookMirror as todLookMirror, mergeLooks as todMergeLooks, parseLooks as todParseLooks } from '../src/lib/looks'
import {
  QUICK_ICONS as styleQuickIcons,
  STACK_COLORS as styleColors,
  buildStackTitle as styleBuildTitle,
  chipColors as styleChip,
  isStackMarker as styleIsMarker,
  parseStackColor as styleParseColor,
  splitStackTitle as styleSplitTitle,
  stackColorFromUrl as styleColorFromUrl,
  stackColorUrl as styleColorUrl,
} from '../src/lib/stackStylePlan'
import { backupStack as styleBackupStack, mapTree as styleMapTree, writeBackupStack as styleWriteBackupStack, writeStackColor as styleWriteColor } from '../src/lib/folderPlan'
import { boardLinks as styleBoardLinks } from '../src/lib/cleanupPlan'
import { isShareableUrl as styleShareable } from '../src/lib/sharePlan'
{
  // Time of day: light from 07:00, dark from 19:00, by the clock; a one-version palette keeps its own.
  eq('time of day: light from 07:00, dark from 19:00', [0, 6, 7, 12, 18, 19, 23].map(todTimeScheme), ['dark', 'dark', 'light', 'light', 'light', 'dark', 'dark'])
  eq('time of day: hours (theme-boot.js repeats them)', [todStarts, todEnds], [7, 19])
  eq(
    'time of day: the clock picks the scheme in place of the mode',
    [todSchemeNow('dark', 'stackboard', false, true, 10), todSchemeNow('light', 'stackboard', false, true, 22), todSchemeNow('system', 'nord', false, true, 10), todSchemeNow('light', 'stackboard', true, false, 22)],
    ['light', 'dark', 'dark', 'light'],
  )
  eq(
    'time of day: stored only when on, and switching it off drops it',
    [todParseLooks({ timeOfDay: true }).timeOfDay, 'timeOfDay' in todParseLooks({ timeOfDay: false }), 'timeOfDay' in todMergeLooks(todParseLooks({ timeOfDay: true }), { timeOfDay: false }), 'timeOfDay' in todParseLooks({ timeOfDay: 'yes' })],
    [true, false, false, false],
  )
  eq('time of day: the boot copy carries it only with Pro', [todLookMirror(todParseLooks({ timeOfDay: true }), true).timeOfDay, 'timeOfDay' in todLookMirror(todParseLooks({ timeOfDay: true }), false)], [true, false])

  // Moving wallpapers: slow loops that move only transform, still under reduced motion.
  const moving = todWallpapers.filter((w) => w.moving).map((w) => w.id)
  eq('moving wallpapers: Drift, Tide and Orbit', moving, ['drift', 'tide', 'orbit'])
  eq(
    'moving wallpapers: each loop takes a minute or more',
    moving.filter((id) => {
      const m = new RegExp(`animation: wp-${id} (\\d+)s`).exec(indexCss)
      return !m || Number(m[1]) < 60
    }),
    [],
  )
  eq(
    'moving wallpapers: keyframes move transform and nothing else',
    moving.filter((id) => {
      const at = indexCss.indexOf(`@keyframes wp-${id}`)
      const body = at < 0 ? '' : indexCss.slice(at, indexCss.indexOf('\n}', at))
      return !/transform/.test(body) || /background|opacity|left:|top:|width|height/.test(body)
    }),
    [],
  )
  eq(
    'moving wallpapers: reduced motion holds them still',
    /prefers-reduced-motion: reduce\)\s*\{\s*:root\[data-bg="wallpaper"\] body::before,\s*\[data-wallpaper-preview\]::before\s*\{\s*animation: none !important;/.test(indexCss),
    true,
  )

  // Stack colours: Chrome's tab-group colours, kept as a marker bookmark in the stack folder.
  eq("stack colours: the nine tab-group colours, in Chrome's order", styleColors.map((c) => c.id), ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'])
  eq('stack colours: every colour round-trips through its marker', styleColors.filter((c) => styleColorFromUrl(styleColorUrl(c.id)) !== c.id).map((c) => c.id), [])
  eq(
    'stack colours: markers are known by address, junk is no colour',
    [
      styleIsMarker('https://getstackboard.com/stack#c=blue'),
      styleIsMarker('https://www.getstackboard.com/stack/#c=teal'),
      styleIsMarker('https://getstackboard.com/todo#abcdefghijklmnop'),
      styleIsMarker('https://example.com/stack#c=blue'),
      styleColorFromUrl('https://getstackboard.com/stack#c=teal'),
      styleParseColor('BLUE'),
      styleParseColor(3),
    ],
    [true, true, false, false, null, null, null],
  )
  eq(
    'stack colours: label text clears 4.5:1 on every colour, light and dark',
    styleColors.flatMap((c) => (['light', 'dark'] as const).filter((s) => contrastRatio(styleChip(c.id, s).fg, styleChip(c.id, s).bg) < 4.5).map((s) => `${c.id} ${s}`)),
    [],
  )
  eq('stack icons: the leading emoji is the icon', [styleSplitTitle('📚 Reading'), styleSplitTitle('Reading'), styleSplitTitle('📚')], [{ icon: '📚', name: 'Reading' }, { icon: null, name: 'Reading' }, { icon: null, name: '📚' }])
  eq('stack icons: building a title', [styleBuildTitle('📚', 'Reading'), styleBuildTitle(null, 'Reading'), styleBuildTitle('📚', '  '), styleBuildTitle('  ', ' Docs ')], ['📚 Reading', 'Reading', '📚', 'Docs'])
  eq('stack icons: each quick pick reads back as the icon', styleQuickIcons.filter((e) => styleSplitTitle(`${e} Docs`).icon !== e), [])

  const styled = {
    id: 'r',
    title: 'Stackboard',
    children: [
      {
        id: 's',
        title: '🧪 Space',
        index: 0,
        children: [
          {
            id: 'a',
            title: 'Docs',
            index: 0,
            children: [
              { id: 'm', title: 'Stackboard stack colour', url: 'https://getstackboard.com/stack#c=blue', index: 0 },
              { id: 'l1', title: 'One', url: 'https://one.example/', index: 1 },
            ],
          },
          {
            id: 'b',
            title: 'List',
            index: 1,
            children: [
              { id: 't', title: 'Stackboard to-do list', url: 'https://getstackboard.com/todo#abcdefghijklmnop', index: 0 },
              { id: 'm2', title: 'Stackboard stack colour', url: 'https://getstackboard.com/stack#c=green', index: 1 },
            ],
          },
          {
            id: 'c',
            title: 'Plain',
            index: 2,
            children: [
              { id: 'm3', title: 'x', url: 'https://getstackboard.com/stack#c=teal', index: 0 },
              { id: 'l2', title: 'Two', url: 'https://two.example/', index: 1 },
            ],
          },
        ],
      },
    ],
  }
  const [docs, list, plain] = styleMapTree(styled).spaces[0].stacks
  eq(
    'stack colours: the marker colours its stack and is never a link',
    [docs.color, docs.bookmarks.map((b) => b.id), list.color, !!list.todo, plain.color ?? null, plain.bookmarks.map((b) => b.id)],
    ['blue', ['l1'], 'green', true, null, ['l2']],
  )
  eq('stack colours: backups carry the colour', [styleBackupStack(docs).color, 'color' in styleBackupStack(plain)], ['blue', false])
  const made: Array<{ parentId: string; title: string; url?: string }> = []
  const api = {
    create: async (a: { parentId: string; title: string; url?: string }) => {
      made.push(a)
      return { id: `n${made.length}` }
    },
  }
  await styleWriteBackupStack(api, 'sp', { name: 'Docs', bookmarks: [{ title: 'One', url: 'https://one.example/' }], color: 'blue' })
  await styleWriteColor(api, 'x', 'teal')
  eq('stack colours: a restore writes the marker last and skips an unknown colour', made.map((m) => m.url ?? m.title), ['Docs', 'https://one.example/', 'https://getstackboard.com/stack#c=blue'])
  eq('stack colours: clean-up never lists a marker', styleBoardLinks(styled).map((l) => l.id), ['l1', 'l2'])
  eq(
    'stack colours: a marker never travels in a share link',
    [styleShareable('https://getstackboard.com/stack#c=blue'), styleShareable('https://getstackboard.com/stacks'), pageIsShareableUrl('https://getstackboard.com/stack#c=blue')],
    [false, true, false],
  )
}

// ---------- 0.8.0: Teams company space ----------
{
  const policy = {
    companyName: '  Acme   Corp ',
    spaces: [
      {
        name: 'Company',
        emoji: '🏢',
        stacks: [
          {
            name: 'Tools',
            links: [
              { title: 'Intranet', url: 'https://intranet.example.com' },
              { title: 'Bad', url: 'javascript:alert(1)' },
              { title: 'File', url: 'file:///C:/secret.txt' },
              { title: '', url: 'http://wiki.example.com/start' },
            ],
          },
          { name: 'Empty', links: [{ title: 'x', url: 'chrome://settings' }] },
        ],
      },
      { name: 'Sales', emoji: 'Sales team', stacks: [{ name: 'CRM', links: [{ title: 'CRM', url: 'https://crm.example.com/' }] }] },
      { name: '   ', stacks: [] },
    ],
    announcement: { text: 'Benefits enrolment closes Friday', url: 'https://hr.example.com/benefits' },
  }
  const c = parseManagedConfig(policy)
  eq('teams: company name is tidied', c.companyName, 'Acme Corp')
  eq('teams: spaces keep policy order, nameless ones go', c.spaces.map((s) => s.name), ['Company', 'Sales'])
  eq('teams: only http(s) links survive', c.spaces[0].stacks[0].links.map((l) => l.url), ['https://intranet.example.com/', 'http://wiki.example.com/start'])
  eq('teams: a link without a title shows its address', c.spaces[0].stacks[0].links[1].title, 'http://wiki.example.com/start')
  eq('teams: a stack with no usable links is dropped', c.spaces[0].stacks.map((s) => s.name), ['Tools'])
  eq('teams: a word is not an emoji', c.spaces[1].emoji, COMPANY_EMOJI)
  eq('teams: ManagedBookmarks folder shows unless turned off', [c.showManagedBookmarks, parseManagedConfig({ showManagedBookmarks: false }).showManagedBookmarks], [true, false])
  eq('teams: junk policy is an empty config', [parseManagedConfig(null), parseManagedConfig('x'), parseManagedConfig({ spaces: 'nope' })].map(isEmptyConfig), [true, true, true])
  eq('teams: label falls back to Company', [companyLabel(c), companyLabel(parseManagedConfig({}))], ['Acme Corp', 'Company'])

  // Policy values can arrive wrapped: the Google Admin {"Value": ...} form or a JSON string (registry, plist).
  const wrapped = parseManagedConfig({
    companyName: { Value: 'Wrapped' },
    spaces: JSON.stringify([{ name: 'From JSON', stacks: [{ name: 'S', links: [{ title: 'A', url: 'https://a.example.com/' }] }] }]),
    showManagedBookmarks: { Value: false },
  })
  eq('teams: admin-console and JSON-string values unwrap', [wrapped.companyName, wrapped.spaces[0]?.name, wrapped.showManagedBookmarks], ['Wrapped', 'From JSON', false])

  const many = parseManagedConfig({
    spaces: Array.from({ length: 40 }, (_, i) => ({ name: `S${i}`, stacks: [{ name: 'L', links: Array.from({ length: 500 }, (_, k) => ({ title: `${k}`, url: `https://e.example.com/${k}` })) }] })),
  })
  eq('teams: sizes are capped', [many.spaces.length, many.spaces[0].stacks[0].links.length], [MANAGED_LIMITS.spaces, MANAGED_LIMITS.links])
  eq('teams: very long names are cut', parseManagedConfig({ companyName: 'x'.repeat(500) }).companyName?.length, MANAGED_LIMITS.name)
  eq('teams: safeUrl', [safeUrl(' https://a.example.com '), safeUrl('HTTPS://B.example.com/x'), safeUrl('ftp://a'), safeUrl('data:text/html,hi'), safeUrl(42)], ['https://a.example.com/', 'https://b.example.com/x', null, null, null])

  const spaces = companySpaces(c)
  eq('teams: company spaces get co: ids and read-only flags', spaces.map((s) => [s.id, s.company, s.stacks[0].id, s.stacks[0].readOnly, s.stacks[0].bookmarks[0].id, s.stacks[0].bookmarks[0].readOnly]), [
    ['co:p:0', true, 'co:p:0:0', true, 'co:p:0:0:0', true],
    ['co:p:1', true, 'co:p:1:0', true, 'co:p:1:0:0', true],
  ])
  eq('teams: company links never show the new-link accent', spaces[0].stacks[0].bookmarks.every((b) => b.batch === true && b.dateAdded === undefined), true)

  // Chrome's ManagedBookmarks folder: loose links make a stack named after it, subfolders stacks by path.
  const folder = {
    id: '9',
    title: 'Acme links',
    children: [
      { id: '10', title: 'Portal', url: 'https://portal.example.com/' },
      { id: '11', title: 'HR', children: [{ id: '12', title: 'Payroll', url: 'https://pay.example.com/' }, { id: '13', title: 'Forms', children: [{ id: '14', title: 'Leave', url: 'https://leave.example.com/' }] }] },
      { id: '15', title: 'Bookmarklet', url: 'javascript:void(0)' },
      { id: '16', title: 'Empty', children: [] },
    ],
  }
  const mb = managedFolderSpace(folder)
  eq('teams: ManagedBookmarks folder becomes one read-only space', [mb?.id, mb?.name, mb?.company, mb?.stacks.map((s) => s.title)], ['co:mb:9', 'Acme links', true, ['Acme links', 'HR', 'HR › Forms']])
  eq('teams: its links are read-only and bookmarklets are skipped', mb?.stacks.flatMap((s) => s.bookmarks.map((b) => `${b.readOnly}:${b.url}`)), ['true:https://portal.example.com/', 'true:https://pay.example.com/', 'true:https://leave.example.com/'])
  eq('teams: an empty ManagedBookmarks folder shows nothing', managedFolderSpace({ id: '1', title: 'Managed', children: [] }), null)

  const ann = parseAnnouncement(policy.announcement)
  eq('teams: announcement without an id gets a stable hash id', [ann?.id, ann?.id === parseAnnouncement(policy.announcement)?.id, ann?.dismissible], [`h${textHash('Benefits enrolment closes Friday\nhttps://hr.example.com/benefits')}`, true, true])
  eq('teams: a new text is a new announcement', parseAnnouncement({ text: 'Other' })?.id !== ann?.id, true)
  eq('teams: announcement keeps its own id and can be pinned', parseAnnouncement({ id: 'q4', text: 'Hi', dismissible: false }), { id: 'q4', text: 'Hi', dismissible: false })
  eq('teams: an empty or unsafe announcement link', [parseAnnouncement({ text: '  ' }), parseAnnouncement({ text: 'Hi', url: 'javascript:x' })?.url], [null, undefined])
  eq('teams: dismissed announcements hide, pinned ones stay', [showAnnouncement(ann, []), showAnnouncement(ann, [ann!.id]), showAnnouncement({ id: 'p', text: 'x', dismissible: false }, ['p']), showAnnouncement(null, [])], [true, false, true, false])
  eq('teams: dismissal list parses and caps', [parseDismissed('["a",1,"b"]'), parseDismissed('nope'), parseDismissed(null), addDismissed(Array.from({ length: DISMISSED_MAX }, (_, i) => `x${i}`), 'new').length], [['a', 'b'], [], [], DISMISSED_MAX])
  eq('teams: dismissing twice keeps one entry', addDismissed(['a', 'b'], 'a'), ['b', 'a'])
}

import { DAY_SETS, MAX_RULES, daysPreset, minutesOf, newRule, parseRules, ruleMatches, scheduledSpace, spaceFor } from '../src/lib/schedulePlan'
import { FOCUS_MAX, cleanFocus, focusFor, stripOn, stripShown } from '../src/lib/todayStripPlan'
import { ACTIONS, COMMAND_CAPS, commandItems, nameScore, stepIndex, type CommandAction } from '../src/lib/commandPlan'

// ---------- 0.9.0: Today strip, spaces by time, command bar (Pro) ----------
{
  // 2 Nov 2026 is a Monday.
  const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m)
  eq('schedule: times read as minutes, anything else is no time', [minutesOf('09:30'), minutesOf('00:00'), minutesOf('23:59'), minutesOf('24:00'), minutesOf('9:30'), minutesOf(570)], [570, 0, 1439, null, null, null])
  eq('schedule: day sets name their preset', [daysPreset([1, 2, 3, 4, 5]), daysPreset([5, 4, 3, 2, 1]), daysPreset([0, 6]), daysPreset(DAY_SETS.every), daysPreset([1, 3])], ['weekdays', 'weekdays', 'weekends', 'every', 'pick'])
  const work = { space: 'Work', days: [...DAY_SETS.weekdays], from: '09:00', to: '18:00' }
  const rules = parseRules({
    v: 1,
    rules: [work, { space: '', days: [1], from: '09:00', to: '10:00' }, { space: 'X', days: [], from: '09:00', to: '10:00' }, { space: 'Y', days: [9], from: '09:00', to: '10:00' }, { space: 'Z', days: [1], from: '9am', to: '10:00' }, { space: 'Home', days: [0, 6], from: '00:00', to: '00:00' }, { space: 'A', days: [1], from: '07:00', to: '08:00' }, { space: 'B', days: [1], from: '07:00', to: '08:00' }],
  })
  eq('schedule: broken rules drop out and three is the most', rules.map((r) => r.space), ['Work', 'Home', 'A'])
  eq('schedule: no stored rules', [parseRules(null), parseRules({ rules: 'x' })], [[], []])
  eq('schedule: MAX_RULES is three', MAX_RULES, 3)
  eq('schedule: weekdays 9 to 6 covers Monday morning, up to six', [ruleMatches(work, at(2, 10, 30)), ruleMatches(work, at(2, 9)), ruleMatches(work, at(2, 17, 59)), ruleMatches(work, at(2, 18)), ruleMatches(work, at(2, 8, 59)), ruleMatches(work, at(7, 10, 30))], [true, true, true, false, false, false])
  const night = { space: 'Night', days: [...DAY_SETS.weekdays], from: '22:00', to: '06:00' }
  eq('schedule: a rule past midnight counts from the day it started', [ruleMatches(night, at(2, 23)), ruleMatches(night, at(3, 5)), ruleMatches(night, at(7, 5)), ruleMatches(night, at(8, 5)), ruleMatches(night, at(2, 5)), ruleMatches(night, at(2, 12))], [true, true, true, false, false, false])
  const weekend = { space: 'Home', days: [...DAY_SETS.weekends], from: '00:00', to: '00:00' }
  eq('schedule: the same start and end is all day', [ruleMatches(weekend, at(7, 15)), ruleMatches(weekend, at(8, 0)), ruleMatches(weekend, at(2, 15))], [true, true, false])
  const spaces = [{ id: '1', name: 'Work' }, { id: '2', name: 'Home' }]
  const both = [work, { space: 'Home', days: [...DAY_SETS.every], from: '00:00', to: '00:00' }]
  eq('schedule: the first matching rule picks the space', [scheduledSpace(both, spaces, at(2, 10, 30)), scheduledSpace(both, spaces, at(2, 20)), scheduledSpace([], spaces, at(2, 10))], ['1', '2', null])
  eq('schedule: a rule whose space is gone is skipped', scheduledSpace([{ ...work, space: 'Gone' }, both[1]], spaces, at(2, 10, 30)), '2')
  eq('schedule: spaces match by name, ignoring case and spaces', [spaceFor({ ...work, space: ' work ' }, spaces)?.id, spaceFor({ ...work, space: 'Play' }, spaces)], ['1', null])
  eq('schedule: a new rule starts on the first space, weekdays 9 to 6', [newRule(spaces), newRule([]).space], [{ space: 'Work', days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }, ''])

  eq('today strip: the focus belongs to its day', [focusFor({ day: '2026-11-03', text: ' Ship 0.9.0 ' }, '2026-11-03'), focusFor({ day: '2026-11-02', text: 'Old' }, '2026-11-03'), focusFor(null, '2026-11-03'), focusFor({ day: '2026-11-03', text: 5 }, '2026-11-03')], ['Ship 0.9.0', '', '', ''])
  eq('today strip: one line, capped, emoji kept whole', [cleanFocus('a\n  b '), cleanFocus('x'.repeat(200)).length, [...cleanFocus('\u{1F600}'.repeat(150))].length], ['a b', FOCUS_MAX, FOCUS_MAX])
  eq('today strip: on only when stored as on', [stripOn({ on: true }), stripOn({ on: 'yes' }), stripOn(undefined)], [true, false, false])
  eq('today strip: three shown, the rest counted', [stripShown([1, 2, 3, 4, 5]), stripShown([1])], [{ shown: [1, 2, 3], more: 2 }, { shown: [1], more: 0 }])

  eq('command bar: word starts count double, every term must match', [nameScore('Open Settings', 'set'), nameScore('Open Settings', 'ttings'), nameScore('Open Settings', 'open xyz'), nameScore('Open Settings', '  ')], [2, 1, 0, 0])
  const bm = (id: string, title: string, url: string, stack: string) => ({ id, title, url, parentStackId: stack })
  const tree = {
    rootId: 'r',
    spaces: [
      {
        id: 's1', rawTitle: '\u{1F4BC} Work', name: 'Work', emoji: '\u{1F4BC}',
        stacks: [
          { id: 't1', title: 'Docs', parentSpaceId: 's1', folders: [], bookmarks: [bm('b1', 'Design doc', 'https://docs.example.com/design', 't1'), bm('b2', 'Workday', 'https://workday.example.com/', 't1')] },
          { id: 't2', title: 'Homework', parentSpaceId: 's1', folders: [], bookmarks: [] },
        ],
      },
      {
        id: 's2', rawTitle: '\u{1F3E0} Home', name: 'Home', emoji: '\u{1F3E0}',
        stacks: [{ id: 't3', title: 'Reading', parentSpaceId: 's2', folders: [], bookmarks: Array.from({ length: 10 }, (_, i) => bm(`r${i}`, `Article ${i}`, `https://read.example.com/${i}`, 't3')) }],
      },
    ],
  }
  const all = new Set<CommandAction>(ACTIONS.map((a) => a.id))
  const label = (it: ReturnType<typeof commandItems>[number]) =>
    it.kind === 'action' ? `action:${it.id}` : it.kind === 'space' ? `space:${it.space.name}` : it.kind === 'stack' ? `stack:${it.stack.title}` : `link:${it.bookmark.title}`
  eq('command bar: with no query, the actions on offer and then the spaces', commandItems({ tree, query: '', available: new Set<CommandAction>(['new-space', 'settings']) }).map(label), ['action:new-space', 'action:settings', 'space:Work', 'space:Home'])
  eq('command bar: an action asked for by name comes first', commandItems({ tree, query: 'dark', available: all }).map(label)[0], 'action:dark')
  eq('command bar: actions match their other words too', commandItems({ tree, query: 'theme', available: all }).map(label), ['action:light', 'action:dark'])
  eq('command bar: a stack named for the query comes before an action found only by a related word', commandItems({ tree, query: 'do', available: all }).map(label).slice(0, 2), ['stack:Docs', 'action:new-stack'])
  eq('command bar: spaces, then stacks, then links', commandItems({ tree, query: 'work', available: all }).map(label), ['space:Work', 'stack:Homework', 'link:Workday', 'link:Design doc'])
  eq('command bar: an action not on offer never lists', commandItems({ tree, query: 'tidy', available: new Set<CommandAction>(['settings']) }).map(label), [])
  eq('command bar: links stop at the cap', commandItems({ tree, query: 'article', available: all }).filter((i) => i.kind === 'link').length, COMMAND_CAPS.link)
  eq('command bar: arrows wrap at both ends', [stepIndex(0, -1, 5), stepIndex(4, 1, 5), stepIndex(2, 1, 5), stepIndex(0, 1, 0)], [4, 0, 3, 0])
}

// ---------- 0.8.0: share a stack ----------
{
  const stack = {
    title: 'Reading list',
    links: [
      { title: 'Example', url: 'https://example.com/' },
      { title: 'Docs', url: 'https://docs.example.org/a?b=1#c' },
      { title: 'https://plain.example.net/', url: 'https://plain.example.net/' },
      { title: 'Again', url: 'https://example.com/' },
      { title: 'Script', url: 'javascript:alert(1)' },
      { title: 'Data', url: 'data:text/html,<b>x</b>' },
      { title: 'Chrome page', url: 'chrome://settings/' },
    ],
  }
  const made = await encodeShare(stack)
  const hash = made ? made.url.slice(made.url.indexOf('#') + 1) : ''
  eq('share: the link points at the share page with the stack in the hash', !!made && made.url.startsWith(SHARE_PAGE + '#') && /^[A-Za-z0-9_-]+$/.test(hash), true)
  eq('share: web links only, a URL once', made && [made.links, made.total], [3, 3])
  const back = await decodeShare(hash)
  eq('share: round trip keeps the title and links', back, {
    title: 'Reading list',
    links: [
      { title: 'Example', url: 'https://example.com/' },
      { title: 'Docs', url: 'https://docs.example.org/a?b=1#c' },
      { title: 'https://plain.example.net/', url: 'https://plain.example.net/' },
    ],
  })
  eq('share: the page decodes the extension link the same way', await pageDecodeShare('#' + hash), back)
  eq('share: a leading # is fine', await decodeShare('#' + hash), back)

  eq('share: http and https only', [isShareableUrl('https://a.com/'), isShareableUrl('http://a.com/x'), isShareableUrl('javascript:alert(1)'), isShareableUrl('data:text/plain,hi'), isShareableUrl('file:///C:/x'), isShareableUrl('chrome://flags'), isShareableUrl('https://user:pw@a.com/'), isShareableUrl('not a url')], [true, true, false, false, false, false, false, false])
  eq('share: a hand-made payload loses its script links', parseSharePayload({ v: 1, t: 'x', l: [['bad', 'javascript:alert(1)'], ['ok', 'https://ok.com/'], ['vb', 'vbscript:msgbox'], 'junk', [1, 2]] }), { title: 'x', links: [{ title: 'ok', url: 'https://ok.com/' }] })
  eq('share: junk is no stack', [parseSharePayload(null), parseSharePayload([]), parseSharePayload({ v: 2, t: 'x', l: [['a', 'https://a.com/']] }), parseSharePayload({ v: 1, t: 'x', l: [] }), parseSharePayload({ v: 1, t: 'x', l: [['a', 'javascript:x']] })], [null, null, null, null, null])
  eq('share: junk hashes decode to nothing', [await decodeShare(''), await decodeShare('#'), await decodeShare('!!!'), await decodeShare('AAAA'), await decodeShare('x'.repeat(MAX_SHARE_URL * 3)), await pageDecodeShare('%%%')], [null, null, null, null, null, null])
  // Review batch 2, finding 5: a to-do stack's marker bookmark never travels, either way.
  const marker = 'https://getstackboard.com/todo#abcd1234abcd1234'
  eq('share: the to-do marker is not a shareable link (extension and page)', [isShareableUrl(marker), isShareableUrl('https://www.getstackboard.com/todo/#x'), pageIsShareableUrl(marker), isShareableUrl('https://getstackboard.com/todos')], [false, false, false, true])
  const withMarker = await encodeShare({ title: 'Mixed', links: [{ title: 'Marker', url: marker }, { title: 'Ok', url: 'https://ok.example.com/' }] })
  eq('share: encoding leaves the marker out', withMarker?.links, 1)
  const sneaky = bytesToBase64Url(await deflate(JSON.stringify({ v: 1, t: 'Sneaky', l: [['Marker', marker], ['Ok', 'https://ok.example.com/']] })))
  eq('share: decoding drops a marker someone put in by hand (extension and page)', [(await decodeShare(sneaky))?.links.map((l) => l.url), (await pageDecodeShare(sneaky))?.links.map((l: { url: string }) => l.url)], [['https://ok.example.com/'], ['https://ok.example.com/']])
  const notJson = bytesToBase64Url(await deflate('this is not json'))
  eq('share: valid deflate that isn\'t JSON decodes to nothing', [await decodeShare(notJson), await pageDecodeShare(notJson)], [null, null])
  const bomb = bytesToBase64Url(await deflate('{"v":1,"t":"' + 'a'.repeat(400_000) + '","l":[["a","https://a.com/"]]}'))
  eq('share: an oversized payload is refused before it is parsed', [bomb.length < MAX_SHARE_URL, await decodeShare(bomb), await pageDecodeShare(bomb)], [true, null, null])

  const hidden = String.fromCharCode(0x202e) + 'gnp.exe' + String.fromCharCode(0x200b) + ' tab\u0007name'
  eq('share: titles lose control and direction characters', shareCleanText(hidden), 'gnp.exe tab name')
  eq('share: titles are capped', shareCleanText('x'.repeat(500)).length, SHARE_MAX_TITLE)
  const many = Array.from({ length: SHARE_MAX_LINKS + 50 }, (_, i) => ['t' + i, `https://e.com/${i}`])
  eq('share: at most 500 links come out of a payload', parseSharePayload({ v: 1, t: 'x', l: many })?.links.length, SHARE_MAX_LINKS)
  eq('share: a title equal to its URL travels empty', JSON.parse(sharePayload({ title: 'T', links: [{ title: 'https://a.com/', url: 'https://a.com/' }] })).l, [['', 'https://a.com/']])

  // Random-looking paths so deflate can't shrink them much: the link has to stop at the cap.
  const big = { title: 'Big', links: Array.from({ length: 400 }, (_, i) => ({ title: `Page ${i} ${Math.random().toString(36).slice(2)}`, url: `https://site${i}.example.com/${Math.random().toString(36).slice(2)}/${Math.random().toString(36).slice(2)}` })) }
  const cut = await encodeShare(big)
  const cutBack = cut ? await decodeShare(cut.url.split('#')[1]) : null
  eq('share: a big stack carries the first links that fit in 8 KB', !!cut && cut.url.length <= MAX_SHARE_URL && cut.links < cut.total && cut.total === 400 && cutBack?.links.length === cut.links && cutBack?.links[0].url === big.links[0].url, true)
  eq('share: nothing to share without a web link', await encodeShare({ title: 'x', links: [{ title: 'a', url: 'chrome://flags' }] }), null)
  eq('share: toast wording', [shareNote({ links: 3, total: 3 }).title, shareNote({ links: 1, total: 1 }).title, shareNote({ links: 120, total: 400 }).title, shareNote({ links: 3, total: 3 }).detail], ['3 links', '1 link', '120 of 400 links', 'Anyone with the link sees these titles and addresses.'])
  eq('share: the page draws a letter, never a favicon request', [pageMonogram('https://www.github.com/x'), pageMonogram('https://docs.google.com/'), pageMonogram('https://a.co/')], ['G', 'G', 'A'])
}

import type { StackableTree as SaveTree } from '../src/lib/types'
import { fileBody, fileTargets, readPick, siteOf as fileSiteOf, suggestStack, words as titleWords } from '../src/lib/filePlan'
import { BACKUP_KEEP, backupFileName, backupsToPrune, lastBackupText } from '../src/lib/backupPlan'

// ---------- 0.9.0: suggested stack when saving, backup to a folder ----------
{
  const link = (id: string, url: string, stack: string) => ({ id, title: id, url, parentStackId: stack })
  const stack = (id: string, title: string, space: string, urls: string[], extra: object = {}) => ({
    id,
    title,
    parentSpaceId: space,
    bookmarks: urls.map((u, i) => link(`${id}-${i}`, u, id)),
    ...extra,
  })
  const space = (id: string, emoji: string, name: string, stacks: unknown[], extra: object = {}) => ({ id, rawTitle: `${emoji} ${name}`, name, emoji, stacks, ...extra })
  const tree = {
    rootId: 'r',
    spaces: [
      space('c', '🏢', 'Company', [stack('c1', 'Tools', 'c', ['https://www.allrecipes.com/a', 'https://www.allrecipes.com/b'])], { company: true }),
      space('w', '💼', 'Work', [
        stack('w1', 'Docs', 'w', ['https://docs.google.com/1', 'https://docs.google.com/2']),
        stack('w2', 'Meetings', 'w', ['https://zoom.us/j/1', 'https://docs.google.com/3']),
        stack('w3', 'Plan', 'w', [], { todo: { id: 't', anchorId: 'a' } }),
      ]),
      space('k', '🍳', 'Cooking', [stack('k1', 'Recipes', 'k', ['https://www.allrecipes.com/x']), stack('k2', 'Groceries', 'k', ['https://shop.example.com/'])]),
      space('s', '📥', 'Stash', [stack('s1', 'Stashed Nov 2', 's', ['https://www.allrecipes.com/1', 'https://allrecipes.com/2', 'https://www.allrecipes.com/3'])]),
    ],
  } as unknown as SaveTree

  eq('file: a site is its host without www', [fileSiteOf('https://www.Example.com/a?b=1'), fileSiteOf('http://sub.example.com'), fileSiteOf('chrome://flags'), fileSiteOf('not a link')], ['example.com', 'sub.example.com', '', ''])
  eq('file: title words, common words and numbers left out, plurals folded', titleWords('The Best Chicken Recipes for 2026 | Allrecipes: groceries'), ['chicken', 'recipe', 'allrecipe', 'grocery'])
  eq('file: save targets skip company spaces and to-do stacks, Stash last', fileTargets(tree).map((t) => t.path), [
    'Work › Docs',
    'Work › Meetings',
    'Cooking › Recipes',
    'Cooking › Groceries',
    'Stash › Stashed Nov 2',
  ])
  const site = suggestStack(tree, { url: 'https://www.allrecipes.com/recipe/9', title: 'Garlic chicken' })
  eq('file: the stack holding links from the same site wins, Stash and company spaces aside', [site?.stackId, site?.reason, site?.path], ['k1', 'site', 'Cooking › Recipes'])
  eq('file: most links from the site wins', suggestStack(tree, { url: 'https://docs.google.com/document/d/x', title: 'Weekly sync notes' })?.stackId, 'w1')
  const byWords = suggestStack(tree, { url: 'https://new.example.org/list', title: 'My grocery list for the week' })
  eq('file: with no site match, the stack name matching the title', [byWords?.stackId, byWords?.reason], ['k2', 'words'])
  eq('file: a space name alone is not enough', suggestStack(tree, { url: 'https://new.example.org/', title: 'Cooking class schedule' }), null)
  eq('file: nothing in common, no suggestion', suggestStack(tree, { url: 'https://new.example.org/', title: 'Passport renewal' }), null)
  eq('file: browser pages and an empty board get none', [suggestStack(tree, { url: 'chrome://settings', title: 'Settings' }), suggestStack(null, { url: 'https://a.example/', title: 'Docs' })], [null, null])
  const tie = { rootId: 'r', spaces: [space('x', '🧪', 'Test', [stack('a', 'A', 'x', ['https://site.example/1']), stack('b', 'B', 'x', ['https://site.example/2'])])] } as unknown as SaveTree
  eq('file: a tie goes to the first stack on the board', suggestStack(tie, { url: 'https://site.example/3', title: 'x' })?.stackId, 'a')
  const targets = fileTargets(tree)
  eq('file: the AI answer is a stack from the list it was sent', [readPick({ ok: true, stack: 2 }, targets)?.stackId, readPick({ ok: true, stack: 2 }, targets)?.reason], ['k1', 'ai'])
  eq('file: no pick, out of range or not a number reads as none', [readPick({ stack: null }, targets), readPick({ stack: -1 }, targets), readPick({ stack: 5 }, targets), readPick({ stack: '1' }, targets), readPick(null, targets)], [null, null, null, null, null])
  const body = fileBody({ url: `https://a.example/${'x'.repeat(3000)}`, title: 't'.repeat(400) }, targets, { key: 'SB-1', activationId: 'a1' })
  eq('file: the request carries the page, the stack paths and the key, trimmed', [body.page.title.length, body.page.url.length, body.stacks.length, body.stacks[0], body.license.key], [300, 2000, 5, 'Work › Docs', 'SB-1'])

  eq('backup: one file a day, named by the day', [backupFileName('2026-11-03'), BACKUP_KEEP], ['stackboard-2026-11-03.json', 30])
  const days = Array.from({ length: 32 }, (_, i) => backupFileName(`2026-10-${String(i + 1).padStart(2, '0')}`.replace('2026-10-32', '2026-11-01')))
  const names = [...days, 'notes.txt', 'stackboard-notes.json', 'stackboard-2026-1-1.json', 'Stackboard-2026-01-01.json']
  eq('backup: only our own files past the newest 30 go, oldest first out', backupsToPrune(names), ['stackboard-2026-10-02.json', 'stackboard-2026-10-01.json'])
  eq('backup: nothing goes while there are 30 or fewer', backupsToPrune(days.slice(0, 30)), [])
  eq('backup: the last backup line', [lastBackupText(null, '2026-11-03'), lastBackupText({ day: '2026-11-03' }, '2026-11-03'), lastBackupText({ day: '2026-11-02' }, '2026-11-03')], ['No backup yet', 'Last backup: today', 'Last backup: 2 Nov'])
}

// ---------- 0.8.0: Teams pack 2 ----------
{
  // T6: go links
  const cfg = parseManagedConfig({
    goLinks: { Jira: 'https://jira.example.com/', 'PTO Policy': 'https://hr.example.com/pto', 'go/wiki': 'https://wiki.example.com/', bad: 'javascript:alert(1)', '': 'https://x.example.com', 'has space!': 'https://y.example.com', jira: 'https://dupe.example.com' },
    spaces: [
      { name: 'Welcome', onboarding: true, stacks: [{ name: 'First week', links: [{ title: 'Laptop setup', url: 'https://it.example.com/setup' }] }] },
      { name: 'Tools', stacks: [{ name: 'Daily', links: [{ title: 'Jira board', url: 'https://jira.example.com/board' }, { title: 'Payroll', url: 'https://pay.example.com/' }] }] },
    ],
    brand: { name: '  Acme  ', accent: '#0F766E' },
    lock: { appearance: true, starterPacks: 1, importExport: 'yes' },
  })
  eq('go: names are tidied, bad ones and non-web addresses go, a name counts once', cfg.goLinks, [
    { name: 'jira', url: 'https://jira.example.com/' },
    { name: 'pto-policy', url: 'https://hr.example.com/pto' },
    { name: 'wiki', url: 'https://wiki.example.com/' },
  ])
  eq('go: only the { name: url } map counts, a list reads as none', parseGoLinks([{ name: 'HR', url: 'https://hr.example.com' }, { name: 'x', url: 'ftp://x' }]), [])
  eq('go: admin-console and JSON-string forms unwrap', parseGoLinks({ Value: JSON.stringify({ a: 'https://a.example.com' }) }), [{ name: 'a', url: 'https://a.example.com/' }])
  eq('go: names are capped at 40 characters', [cleanGoName('x'.repeat(40))?.length, cleanGoName('x'.repeat(41)), cleanGoName('-lead'), cleanGoName('hr/benefits')], [40, null, null, 'hr/benefits'])
  eq('go: up to 200 names', parseGoLinks(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`n${i}`, `https://e.example.com/${i}`]))).length, MANAGED_LIMITS.goLinks)

  const spaces = companySpaces(cfg)
  const own = [
    {
      id: '5',
      rawTitle: '⭐ Mine',
      name: 'Mine',
      emoji: '⭐',
      stacks: [
        {
          id: '6',
          title: 'S',
          parentSpaceId: '5',
          bookmarks: [
            { id: '7', title: 'Jira board', url: 'https://jira.example.com/board', parentStackId: '6' },
            { id: '8', title: 'Jira tips', url: 'https://blog.example.com/jira-tips', parentStackId: '6' },
            { id: '9', title: 'Bookmarklet', url: 'javascript:void(0)', parentStackId: '6' },
          ],
        },
      ],
    },
  ]
  const entries = goEntries(cfg.goLinks, [...own, ...spaces])
  eq('go: policy names, then company links, then the board, each address once', entries.map((e) => `${e.from}:${e.url}`), [
    'policy:https://jira.example.com/',
    'policy:https://hr.example.com/pto',
    'policy:https://wiki.example.com/',
    'company:https://it.example.com/setup',
    'company:https://jira.example.com/board',
    'company:https://pay.example.com/',
    'board:https://blog.example.com/jira-tips',
  ])
  eq('go: an exact name wins, then word starts, company before the board', rankGo('jira', entries).map((e) => e.url), ['https://jira.example.com/', 'https://jira.example.com/board', 'https://blog.example.com/jira-tips'])
  eq('go: a word start beats a match inside a word', rankGo('pay', entries)[0]?.url, 'https://pay.example.com/')
  eq('go: two words match two word starts', rankGo('lap set', entries)[0]?.url, 'https://it.example.com/setup')
  eq('go: a name prefix', rankGo('pto', entries)[0]?.url, 'https://hr.example.com/pto')
  eq('go: nothing typed lists the policy names', rankGo('  ', entries).map((e) => e.name), ['jira', 'pto-policy', 'wiki'])
  eq('go: no match, no suggestion', rankGo('zzz', entries), [])
  // Review batch 2, finding 6: a policy name that matches always comes first, and at the same
  // match strength a company link comes before the person's own.
  const ranked = [
    { name: null, title: 'Leave', url: 'https://board.example.com/leave', from: 'board' as const },
    { name: 'hr-leave-policy', title: 'hr-leave-policy', url: 'https://hr.example.com/leave', from: 'policy' as const },
    { name: null, title: 'Leave', url: 'https://company.example.com/leave', from: 'company' as const },
  ]
  eq('go: a matching policy name beats an exact board title', rankGo('leave', ranked)[0]?.url, 'https://hr.example.com/leave')
  eq('go: company before board at the same strength', rankGo('leave', ranked).map((e) => e.from), ['policy', 'company', 'board'])
  // Finding 2: no match goes to the person's default search engine, in the tab the omnibox asked for.
  eq('go: search dispositions', [searchDisposition('currentTab'), searchDisposition('newForegroundTab'), searchDisposition('newBackgroundTab')], ['CURRENT_TAB', 'NEW_TAB', 'NEW_TAB'])
  // Finding 8: the builder's explicit false (JSON false, DWORD 0) turns the ManagedBookmarks folder
  // off, so it feeds neither the company spaces nor go links.
  eq('teams: managed bookmarks off from JSON false or a registry 0', [parseManagedConfig({ showManagedBookmarks: false }).showManagedBookmarks, parseManagedConfig({ showManagedBookmarks: 0 }).showManagedBookmarks, parseManagedConfig({ showManagedBookmarks: { Value: false } }).showManagedBookmarks, parseManagedConfig({}).showManagedBookmarks], [false, false, false, true])
  eq('go: suggestions are XML-safe and carry the address', goSuggestions('ji', [{ name: null, title: 'R&D <wiki>', url: 'https://ji.example.com/a?b=1&c=2', from: 'board' }]), [
    { content: 'https://ji.example.com/a?b=1&c=2', description: 'R&amp;D &lt;wiki&gt; <dim>Your board</dim> <url>ji.example.com</url>' },
  ])
  eq('go: the typed part is marked', goDescription({ name: 'jira', title: 'jira', url: 'https://jira.example.com/', from: 'policy' }, 'JI'), 'go/<match>ji</match>ra <dim>From your company</dim> <url>jira.example.com</url>')
  eq('go: xml escaping', escapeXml(`a&b<c>"d'`), 'a&amp;b&lt;c&gt;&quot;d&apos;')
  eq('go: only full web addresses open as typed', [looksLikeUrl('https://a.example.com/x'), looksLikeUrl('javascript:alert(1)'), looksLikeUrl('jira board'), looksLikeUrl('http://')], [true, false, false, false])
  eq('go: the board search hash round-trips', [readSearchHash(searchHash(' q4 plan ')), readSearchHash('#other'), readSearchHash('#search=%E0%A4%A')], ['q4 plan', null, null])

  // T7: onboarding space
  eq('onboarding: the flag comes through on the space', spaces.map((s) => !!s.onboarding), [true, false])
  const DAY = 86_400_000
  const now = Date.UTC(2026, 10, 3)
  eq('onboarding: on for 30 days from first sight', [onboardingActive(null, now), onboardingActive(now - 29 * DAY, now), onboardingActive(now - 30 * DAY, now), onboardingActive(now + DAY, now)], [true, true, false, true])
  const mbSpace = { id: 'co:mb:1', rawTitle: '🏢 Managed', name: 'Managed', emoji: '🏢', company: true, stacks: [] }
  const ordered = [
    ...companySpaces(
      parseManagedConfig({
        spaces: [
          { name: 'A', stacks: [{ name: 's', links: [{ title: 't', url: 'https://a.example.com' }] }] },
          { name: 'Start', onboarding: true, stacks: [{ name: 's', links: [{ title: 't', url: 'https://b.example.com' }] }] },
        ],
      }),
    ),
    mbSpace,
  ]
  eq('onboarding: leads with a badge while on', arrangeOnboarding(ordered, true).map((s) => `${s.name}:${!!s.startHere}`), ['Start:true', 'A:false', 'Managed:false'])
  eq('onboarding: then follows the other company spaces, badge gone', arrangeOnboarding(ordered, false).map((s) => `${s.name}:${!!s.startHere}`), ['A:false', 'Managed:false', 'Start:false'])
  eq('onboarding: with no onboarding space the order is untouched', arrangeOnboarding(ordered.slice(0, 1), true), ordered.slice(0, 1))
  eq('onboarding: 30 days', ONBOARDING_MS, 30 * DAY)

  // T8: brand and locks
  eq('brand: name tidied, accent lowercased', cfg.brand, { name: 'Acme', accent: '#0f766e' })
  eq('brand: only #rrggbb accents', [parseBrand({ accent: 'red' }), parseBrand({ accent: '#abc' }), parseBrand({ name: 'X', accent: '#12345g' })], [null, null, { name: 'X', accent: null }])
  eq('locks: true (or the registry 1) locks, anything else does not', cfg.lock, { appearance: true, starterPacks: true, importExport: false, pro: false, ai: false, rating: false })
  eq('locks: none by default', parseLocks(undefined), { appearance: false, starterPacks: false, importExport: false, pro: false, ai: false, rating: false })
  eq('teams pack 2: a policy that only sets locks or go links still applies', [isEmptyConfig(parseManagedConfig({ lock: { appearance: true } })), isEmptyConfig(parseManagedConfig({ goLinks: { a: 'https://a.example.com' } })), anyLock(parseLocks({ importExport: true }))], [false, false, true])
  eq('brand: the company accent shows without Pro and wins over a personal one', [lookMirror(DEFAULT_LOOKS, false, '#0f766e').accent, lookMirror(parseLooks({ accent: '#dc2626' }), true, '#0f766e').accent, lookMirror(parseLooks({ accent: '#dc2626' }), true, null).accent], ['#0f766e', '#0f766e', '#dc2626'])
  eq('brand: the boot copy carries the company accent', [
    policyAccentFromMirror(JSON.stringify(bootMirror(DEFAULT_APPEARANCE, DEFAULT_LOOKS, false, '#0f766e'))),
    policyAccentFromMirror(JSON.stringify(bootMirror(DEFAULT_APPEARANCE))),
    bootMirror(DEFAULT_APPEARANCE, DEFAULT_LOOKS, false, '#0f766e').look.accent,
  ], ['#0f766e', null, '#0f766e'])
}

// ---------- 0.9.0: what Pro did, the trial-end recap and the auto-archive line ----------
import { STATS_KEY, addStat, readStats, statsLine } from '../src/lib/statsPlan'
import { MOMENT_SHOWS, TRIAL_CARD_SHOWS, TRIAL_ENDED_WINDOW_MS, claimable, daysUntil, momentLine, pickTrialCard, trialCardTitle, trialEndsAt } from '../src/lib/nudgePlan'
{
  const D = 24 * 60 * 60 * 1000
  const zero = readStats(undefined)
  eq('pro stats: kept under proStats, nothing at first', [STATS_KEY, zero], ['proStats', { archived: 0, snapshots: 0, todosDone: 0, cleaned: 0, tidied: 0 }])
  eq('pro stats: anything unreadable counts as zero', readStats({ archived: -3, snapshots: 'x', todosDone: 2.7, cleaned: Infinity, tidied: 4, extra: 9 }), { archived: 0, snapshots: 0, todosDone: 2, cleaned: 0, tidied: 4 })
  eq('pro stats: adding counts whole positive numbers only', [addStat(zero, 'archived', 214).archived, addStat(zero, 'snapshots').snapshots, addStat(zero, 'tidied', -2).tidied, addStat(zero, 'cleaned', 2.9).cleaned], [214, 1, 0, 2])
  eq('pro stats: nothing to say when Pro did nothing', statsLine(zero), null)
  eq('pro stats: the recap sentence', statsLine({ ...zero, archived: 214, snapshots: 12, todosDone: 9 }), 'Pro archived 214 tabs, kept 12 snapshots and checked off 9 to-dos.')
  eq('pro stats: one of each reads in the singular', statsLine({ archived: 1, snapshots: 1, todosDone: 1, cleaned: 1, tidied: 1 }), 'Pro archived 1 tab, kept 1 snapshot, checked off 1 to-do, cleaned up 1 link and tidied 1 space.')
  eq('pro stats: a single count', statsLine({ ...zero, cleaned: 23 }), 'Pro cleaned up 23 links.')

  const now = new Date(2026, 10, 3, 9, 0).getTime()
  const base = { trialStartedAt: now - 13 * D, now, endingShows: 0, endedShows: 0, checkoutPending: false }
  eq('trial recap: the last two days bring the ending card', [
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 2 } }),
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 1 } }),
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 3 } }),
  ], ['ending', 'ending', null])
  eq('trial recap: two tabs, then retired; answered stays away', [
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 2 }, endingShows: 1 }),
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 2 }, endingShows: TRIAL_CARD_SHOWS }),
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 2 }, endingShows: -1 }),
  ], ['ending', null, null])
  eq('trial recap: not while a checkout this computer opened is pending, never for a key', [
    pickTrialCard({ ...base, state: { kind: 'trial', daysLeft: 2 }, checkoutPending: true }),
    pickTrialCard({ ...base, state: { kind: 'pro' } }),
    pickTrialCard({ ...base, state: { kind: 'paused', reason: 'ended' } }),
    pickTrialCard({ ...base, trialStartedAt: null, state: { kind: 'free', trialUsed: false } }),
  ], [null, null, null, null])
  const start = now - 15 * D
  const ended = { ...base, trialStartedAt: start, state: { kind: 'free', trialUsed: true } as const }
  eq('trial recap: the ended card in the week after the end, two tabs at most', [
    pickTrialCard({ ...ended, now: trialEndsAt(start) + D }),
    pickTrialCard({ ...ended, now: trialEndsAt(start) + TRIAL_ENDED_WINDOW_MS + 1 }),
    pickTrialCard({ ...ended, now: trialEndsAt(start) + D, endedShows: TRIAL_CARD_SHOWS }),
  ], ['ended', null, null])
  const endAt = (y: number, mo: number, d: number, h: number) => new Date(y, mo, d, h, 0).getTime() - 14 * D
  eq('trial recap: today, tomorrow, in 2 days on the local calendar', [
    trialCardTitle('ending', endAt(2026, 10, 3, 18), now),
    trialCardTitle('ending', endAt(2026, 10, 4, 8), now),
    trialCardTitle('ending', endAt(2026, 10, 5, 8), now),
    trialCardTitle('ended', endAt(2026, 10, 2, 8), now),
  ], ['Your Pro trial ends today', 'Your Pro trial ends tomorrow', 'Your Pro trial ends in 2 days', 'Your Pro trial has ended'])
  eq('trial recap: calendar days, not hours', [daysUntil(new Date(2026, 10, 4, 0, 30).getTime(), new Date(2026, 10, 3, 23, 45).getTime()), daysUntil(now, now)], [1, 0])

  const free = { kind: 'free', trialUsed: false } as const
  const used = { kind: 'free', trialUsed: true } as const
  const say = (l: ReturnType<typeof momentLine>) => (l ? `${l.text} ${l.link}` : null)
  eq('auto-archive line: free users before and after their trial', [say(momentLine({ state: free, shown: 0 })), say(momentLine({ state: used, shown: 2 }))], [
    'Auto-archive can do this while you work: idle tabs save themselves. Try Pro free for 14 days.',
    "Auto-archive does this while you work. It's part of Pro.",
  ])
  eq('auto-archive line: three times at most, never for Pro, the trial or a key with a problem', [
    momentLine({ state: free, shown: MOMENT_SHOWS }),
    momentLine({ state: { kind: 'pro' }, shown: 0 }),
    momentLine({ state: { kind: 'trial', daysLeft: 5 }, shown: 0 }),
    momentLine({ state: { kind: 'paused', reason: 'offline' }, shown: 0 }),
  ], [null, null, null, null])
  eq('corner: one card at a time, and the holder may claim again', [claimable(null, 'moment'), claimable('whatsNew', 'trialEnd'), claimable('trialEnd', 'trialEnd')], [true, false, true])
}

// ---------- 0.8.0: nested folders ----------
import {
  OPEN_FOLDERS_MAX,
  allLinks,
  backupStack,
  contentsLabel,
  holderOf,
  locate,
  mapTree,
  moveIndex,
  parseOpenFolders,
  placesIn,
  setFolderOpen,
  walkFolders,
  writeBackupStack,
  type CreateApi,
  type TreeNode,
} from '../src/lib/folderPlan'
import { searchTree } from '../src/lib/search'
import { boardLinks } from '../src/lib/cleanupPlan'
import { flattenNote, flattenedFolders } from '../src/lib/tidyPlan'
import { liveTodoIds } from '../src/lib/folderPlan'
import { carriesFolderLinks } from '../src/lib/sharePlan'
{
  // A Chrome subtree with the children out of order (Chrome returns them in index order, but
  // nothing promises it). The mapping, walks and search follow tokyo51's nested-stacks tests.
  const T0 = Date.UTC(2026, 9, 1)
  const ln = (id: string, index: number, title: string, url: string): TreeNode => ({ id, index, title, url, dateAdded: T0 + index * 60_000 })
  const fd = (id: string, index: number, title: string, children: TreeNode[]): TreeNode => ({ id, index, title, children })
  const MARK = 'https://getstackboard.com/todo#'
  const root = fd('r', 0, 'Stackboard', [
    fd('sp2', 1, '🏠 Home', [fd('chores', 0, 'Chores', [ln('rota', 0, 'Rota', 'https://rota.example/')])]),
    fd('sp1', 0, '🧪 Work', [
      ln('stray', 0, 'Straight in a space', 'https://stray.example/'),
      fd('japan', 2, 'Japan', [
        fd('food', 3, 'Food', [
          ln('ramen', 1, 'Ramen guide', 'https://ramen.example/'),
          fd('kyoto', 2, 'Kyoto', [ln('nishiki', 0, 'Nishiki Market', 'https://nishiki.example/'), ln('mk2', 1, 'Stackboard to-do list', `${MARK}zzzzzzzzzzzzzzzz`)]),
          ln('sushi', 0, 'Sushi map', 'https://sushi.example/'),
        ]),
        ln('jr', 0, 'JR Pass', 'https://jrpass.example/'),
        fd('empty', 2, 'Empty', []),
        ln('untitled', 1, '', 'https://untitled.example/'),
        ln('late', 4, 'Late link', 'https://late.example/'),
      ]),
      fd('list', 1, 'This week', [ln('mk', 0, 'Stackboard to-do list', `${MARK}abcdefghijklmnop`), fd('inner', 1, 'Inner', [])]),
    ]),
  ])
  const tree = mapTree(root)
  const work = tree.spaces[0]
  const japan = work.stacks[1]
  const food = japan.folders![1]
  eq('nested readTree: spaces and stacks in index order, a link straight in a space left out', [tree.rootId, work.name, work.stacks.map((s) => s.title)], ['r', 'Work', ['This week', 'Japan']])
  eq('nested readTree: a stack keeps its own links in order, folders out of the list', japan.bookmarks.map((b) => b.title), ['JR Pass', 'https://untitled.example/', 'Late link'])
  eq("nested readTree: each link carries Chrome's index, folders counted", japan.bookmarks.map((b) => b.index), [0, 1, 4])
  eq('nested readTree: folders inside a stack, in order, empty ones too', japan.folders?.map((f) => [f.title, f.parentId, f.bookmarks.length, f.folders.length]), [['Empty', 'japan', 0, 0], ['Food', 'japan', 2, 1]])
  eq('nested readTree: a folder has its links, pointing at the folder', food.bookmarks.map((b) => [b.title, b.parentStackId]), [['Sushi map', 'food'], ['Ramen guide', 'food']])
  eq('nested readTree: folders nest to any depth; a to-do marker in one is not a link', food.folders.map((f) => [f.title, f.parentId, f.bookmarks.map((b) => b.title)]), [['Kyoto', 'food', ['Nishiki Market']]])
  eq('nested readTree: a stack with no folders has no folders key', 'folders' in tree.spaces[1].stacks[0], false)
  eq('nested readTree: a to-do stack stays a checklist, folders in it unshown', [work.stacks[0].todo?.id, work.stacks[0].bookmarks.length, 'folders' in work.stacks[0]], ['abcdefghijklmnop', 0, false])
  eq('nested readTree: links saved a minute apart are not a batch', food.bookmarks.map((b) => b.batch), [false, false])

  // Walks: counts, open-all, search and the drop targets all go through these.
  eq('nested: every link in a stack, its own first, then each folder depth first', allLinks(japan).map((b) => b.id), ['jr', 'untitled', 'late', 'sushi', 'ramen', 'nishiki'])
  eq('nested: every folder below a stack', walkFolders(japan).map((f) => f.title), ['Empty', 'Food', 'Kyoto'])
  eq('nested: a space walked in board order', placesIn(work).map((p) => [p.container.id, p.path.map((f) => f.id)]), [['list', []], ['japan', []], ['empty', ['empty']], ['food', ['food']], ['kyoto', ['food', 'kyoto']]])
  eq('nested: locate a deep folder with its path', (() => { const p = locate(tree, 'kyoto'); return [p?.space.name, p?.stack.title, p?.path.map((f) => f.title)] })(), ['Work', 'Japan', ['Food', 'Kyoto']])
  eq('nested: locate a stack, and nothing for unknown ids', [locate(tree, 'japan')?.path, locate(tree, 'nope'), locate(null, 'japan')], [[], null, null])
  eq('nested: the holder of a link, at any depth', [holderOf(tree, 'nishiki')?.container.id, holderOf(tree, 'jr')?.container.id, holderOf(tree, 'stray')], ['kyoto', 'japan', null])
  eq('nested: what a delete takes with it', [contentsLabel(japan), contentsLabel(food), contentsLabel(tree.spaces[1].stacks[0])], ['3 folders, 6 links', '1 folder, 3 links', '1 link'])

  // Chrome's move index counts folders: Japan is [JR 0, untitled 1, Empty 2, Food 3, Late 4].
  const [jr, untitled, late] = japan.bookmarks
  eq('nested move: down past a folder in the same stack passes one more', moveIndex(jr, 0, late, 2, true), 5)
  eq('nested move: up in the same stack lands on the index', moveIndex(late, 2, jr, 0, true), 0)
  eq('nested move: into another folder takes its index as it is', moveIndex(jr, 0, food.bookmarks[1], 1, false), 1)
  eq('nested move: list positions when there is no index (demo data)', moveIndex({}, 0, {}, 2, true), 3)
  eq('nested move: untitled down onto Late', moveIndex(untitled, 1, late, 2, true), 5)

  // 0.8.0 review: stacks and spaces carry Chrome's own index, so a loose link sitting straight in
  // a space folder (or the Stackboard folder) can't shift a drop by one.
  {
    const looseRoot: TreeNode = {
      id: 'r', title: 'Stackboard', children: [
        { id: 'sp1', title: '💼 Work', index: 0, children: [
          { id: 'a', title: 'A', index: 0, children: [] },
          { id: 'loose', title: 'Loose link', url: 'https://loose.example/', index: 1 },
          { id: 'b', title: 'B', index: 2, children: [] },
          { id: 'c', title: 'C', index: 3, children: [] },
        ] },
        { id: 'rootLink', title: 'Root link', url: 'https://root.example/', index: 1 },
        { id: 'sp2', title: '📚 Read', index: 2, children: [] },
      ],
    }
    const lt = mapTree(looseRoot)
    const [A, B, C] = lt.spaces[0].stacks
    eq('reorder: stacks and spaces keep Chrome indexes', [A.index, B.index, C.index, lt.spaces[0].index, lt.spaces[1].index], [0, 2, 3, 0, 2])
    eq('reorder: A dropped on C lands after C, past the loose link', moveIndex(A, 0, C, 2, true), 4)
    eq('reorder: C dropped on B lands at B', moveIndex(C, 2, B, 1, true), 2)
    eq('reorder: the first space dropped on the second passes the loose root link', moveIndex(lt.spaces[0], 0, lt.spaces[1], 1, true), 3)
  }

  // Fold state: one list per device, newest last, capped.
  eq('folds: parse keeps strings only', [parseOpenFolders('["a",1,"b"]'), parseOpenFolders('nope'), parseOpenFolders(null)], [['a', 'b'], [], []])
  eq('folds: opening moves a folder to the end, folding drops it', [setFolderOpen(['a', 'b'], 'a', true), setFolderOpen(['a', 'b'], 'a', false), setFolderOpen([], 'c', false)], [['b', 'a'], ['b'], []])
  eq('folds: the list is capped, oldest out', (() => { const l = setFolderOpen(Array.from({ length: OPEN_FOLDERS_MAX }, (_, i) => `f${i}`), 'new', true); return [l.length, l[0], l.at(-1)] })(), [OPEN_FOLDERS_MAX, 'f1', 'new'])

  // Search reaches into folders and says where a hit sits.
  const nishiki = searchTree(tree, 'nishiki')
  eq('nested search: finds a link two levels down, with its folders', nishiki.map((g) => [g.stack.title, g.path.map((f) => f.title), g.hits.map((h) => h.title)]), [['Japan', ['Food', 'Kyoto'], ['Nishiki Market']]])
  eq('nested search: a folder name matches the links below it', searchTree(tree, 'food').flatMap((g) => g.hits.map((h) => h.title)), ['Sushi map', 'Ramen guide', 'Nishiki Market'])
  eq('nested search: a stack name still matches its folders too', searchTree(tree, 'japan').flatMap((g) => g.hits.map((h) => h.id)).sort(), ['jr', 'late', 'nishiki', 'ramen', 'sushi', 'untitled'])
  eq('nested search: Enter opens the best hit, wherever it sits', searchTree(tree, 'ramen')[0]?.hits[0]?.title, 'Ramen guide')

  // An in-memory chrome.bookmarks: create (at an index or last), getChildren, move with Chrome's
  // same-folder rule, remove (empty folders only), and a subtree read back as TreeNodes.
  type Mem = { id: string; title: string; url?: string; parent?: string; kids?: string[] }
  const mem = new Map<string, Mem>()
  let seq = 0
  const put = (id: string, title: string, parent: string | undefined, url?: string) => {
    mem.set(id, { id, title, url, parent, kids: url ? undefined : [] })
    if (parent) mem.get(parent)!.kids!.push(id)
    return id
  }
  let gets = 0
  const api = {
    get: async (id: string) => {
      gets++
      const n = mem.get(id)
      if (!n) throw new Error("Can't find bookmark for id.")
      return [{ id, parentId: n.parent }]
    },
    getChildren: async (id: string) => (mem.get(id)!.kids ?? []).map((k) => ({ id: k, title: mem.get(k)!.title, url: mem.get(k)!.url })),
    create: async ({ parentId, index, title, url }: { parentId: string; index?: number; title: string; url?: string }) => {
      if (url !== undefined && !/^https?:/.test(url)) throw new Error('Invalid URL')
      const id = `m${++seq}`
      put(id, title, undefined, url)
      const kids = mem.get(parentId)!.kids!
      kids.splice(index ?? kids.length, 0, id)
      mem.get(id)!.parent = parentId
      return { id }
    },
    move: async (id: string, { parentId, index }: { parentId: string; index?: number }) => {
      const n = mem.get(id)!
      const from = mem.get(n.parent!)!.kids!
      const old = from.indexOf(id)
      from.splice(old, 1)
      const to = mem.get(parentId)!.kids!
      let at = index ?? to.length
      if (parentId === n.parent && index !== undefined && index > old) at -= 1
      if (at > to.length) throw new Error('index out of range')
      to.splice(at, 0, id)
      n.parent = parentId
    },
    update: async (id: string, { title }: { title?: string }) => {
      if (title !== undefined) mem.get(id)!.title = title
    },
    remove: async (id: string) => {
      const n = mem.get(id)!
      if (n.kids?.length) throw new Error("Can't remove non-empty folder")
      const kids = mem.get(n.parent!)!.kids!
      kids.splice(kids.indexOf(id), 1)
      mem.delete(id)
    },
  }
  const sub = (id: string): TreeNode => {
    const n = mem.get(id)!
    const index = n.parent ? mem.get(n.parent)!.kids!.indexOf(id) : 0
    return n.kids ? { id, title: n.title, index, children: n.kids.map(sub) } : { id, title: n.title, url: n.url, index }
  }
  // Titles and addresses only: what a backup can carry.
  const shapeOf = (c: { title: string; bookmarks: { title: string; url: string }[]; folders?: { title: string; bookmarks: { title: string; url: string }[]; folders: unknown[] }[] }): unknown => ({
    [c.title]: [...c.bookmarks.map((b) => `${b.title}=${b.url}`), ...(c.folders ?? []).map((f) => shapeOf(f as never))],
  })

  // Backup round trip: board -> backup JSON -> a new board, nesting intact.
  const backup: BookmarkBackup = {
    version: 1,
    exportedAt: '2026-11-03T00:00:00.000Z',
    spaces: tree.spaces.map((s) => ({ emoji: s.emoji, name: s.name, stacks: s.stacks.filter((st) => !st.todo).map(backupStack) })),
  }
  eq('nested backup: a stack keeps its folders, nested', backup.spaces[0].stacks[0].folders?.map((f) => [f.name, f.bookmarks.length, f.folders?.map((g) => g.name)]), [['Empty', 0, undefined], ['Food', 2, ['Kyoto']]])
  eq('nested backup: a stack without folders has no folders key (older versions read it as before)', 'folders' in backup.spaces[1].stacks[0], false)
  const file = JSON.parse(JSON.stringify(backup)) as BookmarkBackup
  const newRoot = put('R', 'Stackboard', undefined)
  for (const space of file.spaces) {
    const sp = await api.create({ parentId: newRoot, title: `${space.emoji} ${space.name}` })
    for (const st of space.stacks) await writeBackupStack(api as CreateApi, sp.id, st)
  }
  const again = mapTree(sub(newRoot))
  eq('nested backup: round trip keeps every folder and link in place', again.spaces[0].stacks.map(shapeOf), [shapeOf(japan)])
  eq('nested backup: links inside folders keep their order', allLinks(again.spaces[0].stacks[0]).map((b) => b.title), allLinks(japan).map((b) => b.title))
  eq('nested backup: snapshot counts take in links in folders', [countSpace(backup.spaces[0]), countBackup(backup).links], [{ stacks: 1, links: 6, lists: 0, items: 0 }, 7])

  // Older backups (no folders) and hand-edited ones still import.
  const old = put('O', 'Old', undefined)
  const oldId = await writeBackupStack(api as CreateApi, old, { name: 'Docs', bookmarks: [{ title: 'A', url: 'https://a.example/' }] })
  eq('nested backup: an older backup imports its links only', shapeOf(mapTree({ id: 'x', title: 'x', children: [sub(old)] }).spaces[0].stacks[0]), { Docs: ['A=https://a.example/'] })
  const odd = { name: 'Odd', bookmarks: [{ title: 'B', url: 'https://b.example/' }], folders: [null, { name: 'Ok', bookmarks: [{ title: 'No url' }, { url: 'https://c.example/' }], folders: 'nope' }] }
  await writeBackupStack(api as CreateApi, old, odd as never)
  eq('nested backup: malformed folders and links are passed over', shapeOf(mapTree({ id: 'x', title: 'x', children: [sub(old)] }).spaces[0].stacks[1]), { Odd: ['B=https://b.example/', { Ok: ['https://c.example/=https://c.example/'] }] })
  const bad = { name: 'Bad', bookmarks: [], folders: [{ name: 'F', bookmarks: [{ title: 'Script', url: 'javascript:void(0)' }, { title: 'D', url: 'https://d.example/' }] }] }
  const threw = await writeBackupStack(api as CreateApi, old, bad).then(() => false, () => true)
  const skipped: string[] = []
  await writeBackupStack(api as CreateApi, old, { ...bad, name: 'Bad 2' }, (url) => skipped.push(url))
  eq('nested backup: a refused link stops an import, a snapshot restore skips it', [threw, skipped, mem.get(mem.get(old)!.kids!.at(-1)!)!.title], [true, ['javascript:void(0)'], 'Bad 2'])
  eq('nested backup: written ids come back', typeof oldId, 'string')

  // Clean-up scans see links in folders, with the folder path, and skip to-do markers.
  const links = boardLinks(root)
  eq('nested clean-up: every link on the board, folders included, markers skipped', links.map((l) => l.id), ['jr', 'untitled', 'late', 'sushi', 'ramen', 'nishiki', 'rota'])
  eq('nested clean-up: a link in a folder says where it is', locationLabel(links.find((l) => l.id === 'nishiki')!), '🧪 Work › Japan › Food › Kyoto')
  eq('nested clean-up: its parent is the folder, its index Chrome\'s', [links.find((l) => l.id === 'ramen')?.parentId, links.find((l) => l.id === 'ramen')?.index], ['food', 1])
  eq('nested clean-up: a copy inside a folder is a duplicate', findDuplicates([...links, { ...links[5], id: 'copy', parentId: 'japan', stackTitle: 'Japan' }]).map((g) => g.links.map((l) => l.id)), [['nishiki', 'copy']])

  // AI tidy: links in folders go to the AI too; Apply empties and removes those folders, Undo puts them back.
  const tSpace = put('TS', 'Tidy', undefined)
  const tA = put('TA', 'A', tSpace)
  put('a1', 'a1', tA, 'https://a1.example/')
  const tF = put('TF', 'Folder', tA)
  put('f1', 'f1', tF, 'https://f1.example/')
  const tG = put('TG', 'Deeper', tF)
  put('g1', 'g1', tG, 'https://g1.example/')
  put('TE', 'Kept empty', tA)
  put('a2', 'a2', tA, 'https://a2.example/')
  const tB = put('TB', 'B', tSpace)
  put('b1', 'b1', tB, 'https://b1.example/')
  const tidySpace = mapTree({ id: 'x', title: 'x', children: [sub(tSpace)] }).spaces[0]
  const tInput = tidyInput(tidySpace)
  eq('nested tidy: links in folders are sent too, after the stack\'s own', [tInput.ids, tInput.stacks.map((s) => `${s.id}:${s.ids.length}`)], [['a1', 'a2', 'f1', 'g1', 'b1'], ['TA:4', 'TB:1']])
  const tShape = (id: string): unknown => {
    const n = mem.get(id)!
    return n.kids ? { [n.title]: n.kids.map(tShape) } : n.title
  }
  const tBefore = JSON.stringify(tShape(tSpace))
  const tPlan = markSame([{ name: 'Mixed', links: [0, 2, 4] }, { name: 'Rest', links: [1, 3] }], tInput)
  const tRec = await runApply(api as unknown as BookmarksApi, tSpace, tPlan, tInput)
  eq('nested tidy apply: links leave their folders; a stack left with only empty folders goes, folders and all', tShape(tSpace), {
    Tidy: [{ Mixed: ['a1', 'f1', 'b1'] }, { Rest: ['a2', 'g1'] }],
  })
  eq('nested tidy apply: innermost first, the folder that was empty before too, and the record says so', tRec.removed, ['TG', 'TF', 'TE', 'TA', 'TB'])
  await runUndo(api as unknown as BookmarksApi, tRec)
  eq('nested tidy undo: stacks, folders and links are back exactly', JSON.stringify(tShape(tSpace)), tBefore)
  const tSame = markSame([{ name: 'A', links: [0, 1, 2, 3] }, { name: 'B', links: [4] }], tidyInput(mapTree({ id: 'x', title: 'x', children: [sub(tSpace)] }).spaces[0]))
  eq('nested tidy: a stack the plan keeps whole keeps its folders', tSame.map((p) => !!p.sameAs), [true, true])

  // Merged with main (3 Nov): Tidy flattens folders and the preview says how many; Apply looks for
  // each link where it was right before moving it; share and go links take in links in folders.
  const tNow = () => tidyInput(mapTree({ id: 'x', title: 'x', children: [sub(tSpace)] }).spaces[0])
  const tInput2 = tNow()
  eq('nested tidy: each stack counts the folders in it that hold links', [tInput.stacks.map((s) => s.folders), tInput2.stacks.map((s) => s.folders)], [[2, 0], [2, 0]])
  eq('nested tidy: folders a plan flattens, none in a stack it keeps whole', [flattenedFolders(tPlan, tInput), flattenedFolders(markSame([{ name: 'A', links: [0, 1, 2, 3] }, { name: 'B', links: [4] }], tInput2), tInput2)], [2, 0])
  eq('nested tidy: the preview line', [flattenNote(0), flattenNote(1), flattenNote(3)], [
    null,
    '1 folder inside a stack gets flattened into the new stacks; Undo puts it back.',
    '3 folders inside stacks get flattened into the new stacks; Undo puts them back.',
  ])
  const outside = put('OUT', 'Outside', undefined)
  const deepLink = allLinks(mapTree({ id: 'x', title: 'x', children: [sub(tSpace)] }).spaces[0].stacks[0]).find((b) => b.title === 'g1')!.id
  const tBefore2 = JSON.stringify(tShape(tSpace))
  const realMove = api.move
  let moves = 0
  api.move = async (id: string, dest: { parentId: string; index?: number }) => {
    if (++moves === 1) await realMove(deepLink, { parentId: outside }) // another tab takes g1 away mid-run
    return realMove(id, dest)
  }
  const gets0 = gets
  const tRec2 = await runApply(api as unknown as BookmarksApi, tSpace, markSame([{ name: 'All', links: [0, 1, 2, 3, 4] }], tInput2), tInput2)
  api.move = realMove
  eq('nested tidy apply: a link that left its folder mid-run is skipped, the rest move', [tRec2.skipped, tShape(tSpace)], [
    ['g1'],
    { Tidy: [{ All: ['a1', 'a2', 'f1', 'b1'] }] },
  ])
  eq('nested tidy apply: each link is looked up once, by id, right before it moves', gets - gets0, 5)
  await runUndo(api as unknown as BookmarksApi, tRec2)
  eq('nested tidy undo: folders come back whole, and the link that left stays where it went', [JSON.stringify(tShape(tSpace)), mem.get(deepLink)?.parent], [tBefore2.replace('"g1"', ''), outside])

  eq('nested share: a stack with folders says it goes as one flat list', [shareNote({ links: 5, total: 5 }, true).detail, shareNote({ links: 5, total: 5 }).detail], [
    'Its folders are shared as one flat list. Anyone with the link sees these titles and addresses.',
    'Anyone with the link sees these titles and addresses.',
  ])
  eq('nested go links: links in folders are found too, after the stack\'s own', goEntries([], tree.spaces).map((e) => e.url).slice(0, 7), [
    'https://jrpass.example/', 'https://untitled.example/', 'https://late.example/', 'https://sushi.example/', 'https://ramen.example/', 'https://nishiki.example/', 'https://rota.example/',
  ])

  // Review fixes (3 Nov).
  // 1. The board builder writes each company space as a ManagedBookmarks folder holding its stacks
  //    (writeManagedBookmarks in site/teams/builder/builder.js). Chrome shows that list as one
  //    folder: it keeps the path-named stacks it had before 0.8.0, with no folders.
  const builderOut = [
    { toplevel_name: 'Acme Corp' },
    {
      name: '⚡ Engineering',
      children: [
        { name: 'Tools', children: [{ name: 'Jira', url: 'https://jira.example.com/' }, { name: 'CI', url: 'https://ci.example.com/' }] },
        { name: 'Docs', children: [{ name: 'Handbook', url: 'https://docs.example.com/handbook' }] },
      ],
    },
    { name: '🏥 People', children: [{ name: 'Benefits', children: [{ name: 'Portal', url: 'https://benefits.example.com/' }] }] },
  ]
  let mbSeq = 0
  type PolicyEntry = { name?: string; url?: string; children?: PolicyEntry[] }
  const asNode = (e: PolicyEntry): FolderNode => (e.url ? { id: `mb${++mbSeq}`, title: e.name ?? '', url: e.url } : { id: `mb${++mbSeq}`, title: e.name ?? '', children: (e.children ?? []).map(asNode) })
  const managed: FolderNode = { id: 'mbroot', title: builderOut[0].toplevel_name!, children: (builderOut.slice(1) as PolicyEntry[]).map(asNode) }
  const fromBuilder = managedFolderSpace(managed)
  eq('nested teams: the builder\'s ManagedBookmarks keep path-named stacks, no folders, read-only', fromBuilder?.stacks.map((s) => [s.title, s.bookmarks.length, 'folders' in s, s.readOnly]), [
    ['⚡ Engineering › Tools', 2, false, true],
    ['⚡ Engineering › Docs', 1, false, true],
    ['🏥 People › Benefits', 1, false, true],
  ])
  eq('nested teams: nest: false is only for ManagedBookmarks; an import still nests', planFolder(managed, { name: 'x', emoji: '📁', looseTitle: 'Links' }).space.stacks.map((s) => [s.title, (s.folders ?? []).map((f) => f.title)]), [
    ['⚡ Engineering', ['Tools', 'Docs']],
    ['🏥 People', ['Benefits']],
  ])

  // 3. A to-do stack is passed over whole by the clean-up, extra links and folders in it too.
  const todoRoot = fd('r2', 0, 'Stackboard', [
    fd('s2', 0, '🧪 Work', [
      fd('td', 0, 'This week', [
        ln('mk3', 0, 'Stackboard to-do list', `${MARK}cccccccccccccccc`),
        ln('hidden', 1, 'Hidden link', 'https://hidden.example/'),
        fd('hf', 2, 'Hidden folder', [ln('hidden2', 0, 'Hidden too', 'https://hidden2.example/')]),
      ]),
      fd('st', 1, 'Links', [ln('shown', 0, 'Shown', 'https://shown.example/')]),
    ]),
  ])
  eq('nested clean-up: a to-do stack is passed over whole, as the board shows it', boardLinks(todoRoot).map((l) => l.id), ['shown'])

  // 4. A to-do list moved inside another stack keeps its items: its marker counts as live.
  eq('nested to-do: markers at any depth are live', liveTodoIds(tree).sort(), ['abcdefghijklmnop', 'zzzzzzzzzzzzzzzz'])
  const lists = { abcdefghijklmnop: emptyList(), zzzzzzzzzzzzzzzz: emptyList(), qqqqqqqqqqqqqqqq: emptyList() }
  const swept = (live: string[]) => planSweep(lists, live, Object.keys(lists), Date.UTC(2026, 10, 3)).mark
  eq('nested to-do: the sweep marks only the list whose marker is gone, not one moved inside a stack', [swept(liveTodoIds(tree)), swept(['abcdefghijklmnop'])], [
    ['qqqqqqqqqqqqqqqq'],
    ['zzzzzzzzzzzzzzzz', 'qqqqqqqqqqqqqqqq'],
  ])
  eq('nested to-do: a tree without the marker list falls back to the to-do stacks', liveTodoIds({ ...tree, todoIds: undefined }), ['abcdefghijklmnop'])

  // 8. The share toast talks about folders only when links from them made it into the link.
  const own = [{ title: 'A', url: 'https://a.example/' }, { title: 'B', url: 'https://b.example/' }, { title: 'Script', url: 'javascript:void(0)' }]
  eq('nested share: folder links in the link are what the toast goes by', [carriesFolderLinks({ links: 3 }, own), carriesFolderLinks({ links: 2 }, own), carriesFolderLinks({ links: 1 }, [])], [true, false, true])
}

// ---------- 0.8.0: packed stacks (U1) ----------
import { PACK_MAX_ROWS, PACK_UNIT, packPlan, packedMove } from '../src/lib/packPlan'
import { PACKED_VERSION, parseSavedAppearance, rowsForOldBoard } from '../src/lib/appearance'
{
  // The Layout setting: Packed for everyone, settings saved before 0.8.0 included.
  eq('layout: Packed is the default', [DEFAULT_APPEARANCE.layout, parseAppearance(undefined).layout], ['packed', 'packed'])
  // Packed is for new installs only (3 Nov): saved settings with no layout key come from before
  // 0.8.0, and those boards keep Rows. parseAppearance fills a missing key; parseSavedAppearance reads storage.
  const oldSettings = { mode: 'dark', palette: 'nord', density: 'compact', bg: { kind: 'gradient' } }
  eq('layout: settings saved before 0.8.0 come back Rows', [parseSavedAppearance(oldSettings).layout, parseSavedAppearance(oldSettings).palette, parseAppearance(oldSettings).layout], ['rows', 'nord', 'packed'])
  eq('layout: nothing saved is a new board, Packed; a picked layout stands', [parseSavedAppearance(undefined).layout, parseSavedAppearance({ layout: 'packed' }).layout, parseSavedAppearance({ layout: 'rows' }).layout], ['packed', 'packed', 'rows'])
  const oldMirror = JSON.stringify({ ...bootMirror(parseAppearance(oldSettings)), settings: oldSettings })
  eq('layout: a boot copy from before 0.8.0 opens Rows on the first frame, no copy opens Packed', [settingsFromMirror(oldMirror).layout, settingsFromMirror(null).layout], ['rows', 'packed'])
  eq('layout: an update from before 0.8.0 writes Rows into the saved settings, never over a pick', [rowsForOldBoard(undefined), rowsForOldBoard(oldSettings), rowsForOldBoard({ layout: 'packed' }), rowsForOldBoard({ layout: 'rows' }), PACKED_VERSION], [
    { layout: 'rows' },
    { ...oldSettings, layout: 'rows' },
    null,
    null,
    '0.8.0',
  ])
  eq('layout: Rows survives storage', parseAppearance(JSON.parse(JSON.stringify({ layout: 'rows' }))).layout, 'rows')
  eq('layout: an unknown value falls back to Packed', ['masonry', 'ROWS', '', 3, null, { rows: true }].map((v) => parseAppearance({ layout: v }).layout), Array(6).fill('packed'))
  eq('layout: merging another setting keeps it, and a pick changes it', [mergeAppearance(parseAppearance({ layout: 'rows' }), { density: 'compact' }).layout, mergeAppearance(DEFAULT_APPEARANCE, { layout: 'rows' }).layout], ['rows', 'rows'])
  eq('layout: rides along in the boot copy', settingsFromMirror(JSON.stringify(bootMirror(parseAppearance({ layout: 'rows' })))).layout, 'rows')

  // Column-stable: stack i in column i mod N, starting one gap under the stack above it. With a
  // 28px gap and 4px rows, a 100px stack spans (100 + 28) / 4 = 32 rows.
  const gap = 28
  const heights = [100, 400, 200, 52, 300, 10, 72]
  const p = packPlan(heights, 3, gap)
  eq('pack: 4px rows on an ordinary board', [p.unit, PACK_UNIT], [4, 4])
  eq('pack: stack i goes in column i mod N, as in Rows', p.places.map((x) => x.column), [1, 2, 3, 1, 2, 3, 1])
  eq('pack: a stack starts on the row after the one above it in its column', p.places.map((x) => x.row), [1, 1, 1, 33, 108, 58, 53])
  eq('pack: a span is the height plus the gap, in whole rows', p.places.map((x) => x.span), [32, 107, 57, 20, 82, 10, 25])
  eq('pack: the space under each stack is the gap, at most a row more', heights.map((h, i) => p.places[i].span * p.unit - h - gap).filter((spare) => spare < 0 || spare >= p.unit), [])
  eq('pack: each column reads top to bottom in board order', [1, 2, 3].map((c) => {
    const rows = p.places.filter((x) => x.column === c).map((x) => x.row)
    return rows.every((r, i) => i === 0 || r > rows[i - 1])
  }), [true, true, true])
  eq('pack: under half a pixel over doesn\'t cost a row, a whole pixel does', packPlan([100.3, 101], 2, gap).places.map((x) => x.span), [32, 33])

  // Growing a stack in the first row moves only the stacks under it, and never sideways.
  const grown = packPlan([900, ...heights.slice(1)], 3, gap)
  eq('pack: growing a stack keeps every stack in its column', grown.places.map((x) => x.column), p.places.map((x) => x.column))
  eq('pack: growing a stack moves only the stacks under it', grown.places.map((x, i) => x.row - p.places[i].row), [0, 0, 0, 200, 0, 0, 200])

  eq('pack: one column stacks everything in order', packPlan([100, 50, 20], 1, gap).places, [
    { column: 1, row: 1, span: 32 },
    { column: 1, row: 33, span: 20 },
    { column: 1, row: 53, span: 12 },
  ])
  // The add-stack button (76px with its top margin) is item number `count`, so it takes the next
  // column, or the first one again under the first stack when the row is full.
  eq('pack: the add-stack button takes the next free column in the first row', packPlan([300, 120, 76], 3, gap).places[2], { column: 3, row: 1, span: 26 })
  eq('pack: the add-stack button goes under the first stack when the row is full', packPlan([300, 120, 76], 2, gap).places[2], { column: 1, row: 83, span: 26 })

  eq('pack: nothing to place', packPlan([], 4, gap), { unit: 4, places: [] })
  eq('pack: junk columns, heights and gap stay sane', packPlan([NaN, -5, 0], 0, -3).places, [
    { column: 1, row: 1, span: 1 },
    { column: 1, row: 2, span: 1 },
    { column: 1, row: 3, span: 1 },
  ])
  eq('pack: a fractional column count rounds down', packPlan([10, 10, 10, 10], 3.7, gap).places.map((x) => x.column), [1, 2, 3, 1])
  const tall = packPlan(Array(200).fill(1000), 1, gap)
  const last = tall.places[tall.places.length - 1]
  eq('pack: a board past the grid line limit gets taller rows instead', [tall.unit > PACK_UNIT, last.row + last.span - 1 <= PACK_MAX_ROWS, PACK_MAX_ROWS < 10000], [true, true, true])

  // The drag preview: each stack's corner if the dragged one landed at a new index, worked out by
  // packing the would-be order. Boxes are a packed board: columns 300px apart, the grid top at 100.
  const boxesOf = (hs: number[], n: number) => {
    const { unit, places } = packPlan(hs, n, gap)
    return places.map((q, i) => ({ left: (q.column - 1) * 300, top: 100 + (q.row - 1) * unit, height: hs[i] }))
  }
  const corners = (boxes: Array<{ left: number; top: number }>) => boxes.map(({ left, top }) => ({ left, top }))
  const mix = [80, 360, 400, 440, 120, 80, 240, 80, 160, 280, 40] // the e2e board's shape
  const board = boxesOf(mix, 4)
  const moved = (from: number, to: number) => {
    const order = mix.map((_, i) => i)
    order.splice(to, 0, ...order.splice(from, 1))
    const packed = boxesOf(order.map((i) => mix[i]), 4)
    const at: Array<{ left: number; top: number }> = []
    order.forEach((i, j) => (at[i] = { left: packed[j].left, top: packed[j].top }))
    return at
  }
  eq('preview: a stack dropped where it was moves nothing', packedMove(board, 4, 4, 4, gap), corners(board))
  eq('preview: every stack goes where packing the new order puts it', [packedMove(board, 4, 2, 4, gap), packedMove(board, 0, 10, 4, gap), packedMove(board, 9, 1, 4, gap)], [moved(4, 2), moved(0, 10), moved(9, 1)])
  const overlaps: string[] = []
  for (let from = 0; from < mix.length; from++) {
    for (let to = 0; to < mix.length; to++) {
      const at = packedMove(board, from, to, 4, gap)
      for (let i = 0; i < mix.length; i++) {
        for (let j = i + 1; j < mix.length; j++) {
          if (at[i].left === at[j].left && at[i].top < at[j].top + mix[j] && at[j].top < at[i].top + mix[i]) overlaps.push(`${from}>${to}: ${i}/${j}`)
        }
      }
    }
  }
  eq('preview: no two stacks overlap, whichever moves where', overlaps, [])
  eq('preview: a board with fewer stacks than columns', packedMove(boxesOf([50, 90], 4), 1, 0, 4, gap), [{ left: 300, top: 100 }, { left: 0, top: 100 }])
  eq('preview: indexes off the board change nothing', [packedMove(board, -1, 3, 4, gap), packedMove(board, 2, 11, 4, gap)], [corners(board), corners(board)])
}

// ---------- 0.8.0: what's new ----------
{
  const base = { early: false, shows070: 0, updated080: false, shows080: 0 }
  eq('whats new: a fresh 0.8.0 install sees no note', pickWhatsNew(base), null)
  eq('whats new: an update from before 0.8.0 sees the 0.8.0 note', pickWhatsNew({ ...base, updated080: true }), '080')
  eq('whats new: the Pro note goes first while it is pending', pickWhatsNew({ ...base, early: true, updated080: true }), '070')
  eq('whats new: the 0.8.0 note comes once the Pro note is answered or used up', [pickWhatsNew({ ...base, early: true, shows070: -1, updated080: true }), pickWhatsNew({ ...base, early: true, shows070: WHATS_NEW_SHOWS, updated080: true })], ['080', '080'])
  eq('whats new: an answered or used-up 0.8.0 note stays away', [pickWhatsNew({ ...base, updated080: true, shows080: -1 }), pickWhatsNew({ ...base, updated080: true, shows080: 3 })], [null, null])
  eq('whats new: three tabs at most', [stillPending(0), stillPending(2), stillPending(3), stillPending(-1)], [true, true, false, false])
  eq('whats new: the Pro line for Pro, the trial and early users only', [showProLine({ hasPro: true, early: false }), showProLine({ hasPro: false, early: true }), showProLine({ hasPro: false, early: false })], [true, true, false])
  const open = whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true })
  eq('whats new: the full 0.8.0 lead', open.lead, 'New in Stackboard 0.8.0: folders inside stacks, a Packed layout that closes the gaps under short stacks (Settings > Appearance > Layout), and share a stack as a link.')
  eq('whats new: the Pro line and the Packed offer', [open.pro, open.tryPacked], ['Pro adds due dates and a Today list, clean-up and AI tidy.', true])
  eq('whats new: no Pro line without Pro, the trial or an early board', whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: false }).pro, null)
  // 0.8.0 (the maintainer, 3 Nov): the notes name the 14-day trial; early users without a list hear to-do lists moved into Pro.
  eq('whats new: the Pro note names the trial and counts to-do lists in Pro', proNoteText({ keepsTodo: false, trialOpen: true }), 'An optional upgrade with to-do lists, idle tabs that archive themselves, a daily snapshot of your board, and more looks. Try it free for 14 days, no card needed.')
  eq('whats new: an early user who had a list hears their lists stay free', proNoteText({ keepsTodo: true, trialOpen: true }), 'An optional upgrade: idle tabs archive themselves, your board gets a daily snapshot, to-do lists get due dates, and there are more looks. Try it free for 14 days, no card needed. Your to-do lists stay free either way.')
  eq('whats new: no trial line once the trial is used or running', [proNoteText({ keepsTodo: false, trialOpen: false }).includes('14 days'), proNoteText({ keepsTodo: true, trialOpen: false }).endsWith('Your to-do lists stay free either way.')], [false, true])
  eq('whats new: 0.8.0 tells an early user without a list that to-do lists moved into Pro, with the trial', whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true, todoMoved: true, trialOpen: true }).pro, 'To-do lists now come with Pro, along with due dates and a Today list, clean-up and AI tidy. Try it free for 14 days, no card needed.')
  eq('whats new: the trial line joins the plain Pro line too', whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true, trialOpen: true }).pro, 'Pro adds due dates and a Today list, clean-up and AI tidy. Try it free for 14 days, no card needed.')
  eq('whats new: already Packed, no offer', whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'packed', proLine: false }).tryPacked, false)
  const locked = whatsNew080({ lockAppearance: true, lockImportExport: false, layout: 'rows', proLine: false })
  eq('whats new: a company that manages appearance gets no layout line or button', [locked.lead, locked.tryPacked], ['New in Stackboard 0.8.0: folders inside stacks and share a stack as a link.', false])
  eq('whats new: with import and export locked, sharing goes unmentioned', whatsNew080({ lockAppearance: true, lockImportExport: true, layout: 'rows', proLine: false }).lead, 'New in Stackboard 0.8.0: folders inside stacks.')
}

// ---------- 0.9.0: help link ----------
import { HELP_URL, helpUrl } from '../src/lib/onboarding'
{
  eq('help link: the version rides in the hash', helpUrl('0.9.0'), 'https://getstackboard.com/support#v=0.9.0')
  eq('help link: no version, or a strange one, opens the plain page', [helpUrl(undefined), helpUrl('dev build')], [HELP_URL, HELP_URL])
}

// ---------- 0.9.0: what's new ----------
import { whatsNew090 } from '../src/lib/whatsNewPlan'
{
  const b = { early: false, shows070: 0, updated080: false, shows080: 0 }
  eq('whats new 0.9.0: an update from 0.8.0 shows the 0.9.0 note', pickWhatsNew({ ...b, updated090: true, shows090: 0 }), '090')
  eq('whats new 0.9.0: it takes the place of the 0.8.0 note, answered or not', [pickWhatsNew({ ...b, updated080: true, updated090: true, shows090: 0 }), pickWhatsNew({ ...b, updated080: true, updated090: true, shows090: -1 })], ['090', null])
  eq('whats new 0.9.0: the Pro note still goes first for early users', pickWhatsNew({ ...b, early: true, updated090: true, shows090: 0 }), '070')
  eq('whats new 0.9.0: without a 0.9.0 mark the 0.8.0 note works as before', pickWhatsNew({ ...b, updated080: true }), '080')
  const plain = whatsNew090({ lockAppearance: false, lockImportExport: false, layout: 'rows', missed080: false, todoMoved: false, trialOpen: true })
  eq('whats new 0.9.0: from 0.8.0, the free line and Pro with the trial', [plain.lead, plain.pro, plain.tryPacked], [
    'New in Stackboard 0.9.0: saving a page suggests the right stack.',
    'Stackboard Pro adds a Today strip, stack colours, a command bar (Ctrl+K) and looks that follow the time of day. Try it free for 14 days, no card needed.',
    false,
  ])
  const missed = whatsNew090({ lockAppearance: false, lockImportExport: false, layout: 'rows', missed080: true, todoMoved: true, trialOpen: false })
  eq('whats new 0.9.0: from before 0.8.0, the 0.8.0 items too, and to-do lists moved into Pro', [missed.lead, missed.pro, missed.tryPacked], [
    'New in Stackboard 0.9.0: folders inside stacks, a Packed layout that closes the gaps under short stacks (Settings > Appearance > Layout), share a stack as a link, and saving a page suggests the right stack.',
    'To-do lists now come with Stackboard Pro, along with a Today strip, stack colours, a command bar (Ctrl+K) and looks that follow the time of day.',
    true,
  ])
  eq('whats new 0.9.0: company locks drop Packed and sharing', whatsNew090({ lockAppearance: true, lockImportExport: true, layout: 'rows', missed080: true, todoMoved: false, trialOpen: false }).lead, 'New in Stackboard 0.9.0: folders inside stacks and saving a page suggests the right stack.')
}

// ---------- 0.8.0: the Pro card and finishing a purchase ----------
{
  const DAY = 86_400_000
  const now = Date.UTC(2026, 10, 3, 9, 0)
  eq('pro card: no checkout, nothing pending', [checkoutPending(null, now), checkoutPending(undefined, now)], [false, false])
  eq('pro card: a checkout opened an hour ago is pending', checkoutPending(now - 3_600_000, now), true)
  eq('pro card: a day later it is not', [checkoutPending(now - CHECKOUT_PENDING_MS, now), checkoutPending(now - 2 * DAY, now)], [false, false])
  eq('pro card: a clock that went backwards is not pending', checkoutPending(now + 60_000, now), false)
  eq('pro card: money', [money(299, 'usd'), money(499), money(250, 'eur'), money(100, 'zz')], ['$2.99', '$4.99', '€2.50', '1.00 ZZ'])
  eq('pro card: short date', shortDate(Date.UTC(2027, 10, 3, 8, 41)), '3 Nov 2027')
  const end = Date.UTC(2027, 10, 3, 8, 41)
  eq('pro card: a period end still ahead stays', currentPeriodEnd(end, 'year', now), end)
  eq('pro card: a passed yearly end moves on a year', currentPeriodEnd(end, 'year', Date.UTC(2027, 10, 20)), Date.UTC(2028, 10, 3, 8, 41))
  eq('pro card: years without news move on as many years', currentPeriodEnd(end, 'year', Date.UTC(2029, 11, 1)), Date.UTC(2030, 10, 3, 8, 41))
  eq('pro card: a monthly plan moves a month', currentPeriodEnd(Date.UTC(2026, 10, 1), 'month', Date.UTC(2026, 10, 5)), Date.UTC(2026, 11, 1))
  eq('pro card: days ago', [daysAgo(now, now), daysAgo(now - DAY - 1, now), daysAgo(now - 3 * DAY, now)], ['today', 'yesterday', '3 days ago'])

  const license = { key: 'SB-1A2B-9F2C', activationId: 'a', status: 'granted' as const, checkedAt: now, okAt: now, email: 'buyer@example.com', since: Date.UTC(2026, 10, 3, 8, 41) }
  const sub = { amount: 299, currency: 'usd', interval: 'year', periodEnd: end, startedAt: Date.UTC(2026, 10, 3, 8, 41), at: now }
  const full = proCard({ license, sub, now })
  eq('pro card: the plan line', full.plan, 'Yearly plan, $2.99 a year')
  eq('pro card: the details', full.rows, [
    { label: 'Renews', value: '3 Nov 2027' },
    { label: 'Pro since', value: '3 Nov 2026' },
    { label: 'Email', value: 'buyer@example.com' },
    { label: 'Key', value: 'SB-...-9F2C' },
    { label: 'Checked', value: 'today, with Polar' },
  ])
  eq('pro card: a cancelled plan says when it ends', proCard({ license, sub: { ...sub, cancelAtPeriodEnd: true }, now }).rows[0], { label: 'Ends', value: '3 Nov 2027 (cancelled)' })
  eq('pro card: a pasted key with nothing else shows only the key', proCard({ license: { key: 'SB-1A2B-9F2C' }, sub: null, now }), { plan: '', rows: [{ label: 'Key', value: 'SB-...-9F2C' }] })
  eq('pro card: a free plan shows no price', proCard({ license, sub: { ...sub, amount: 0 }, now }).plan, 'Yearly plan')

  const polarSub = { amount: 299, currency: 'usd', recurring_interval: 'year', current_period_end: '2027-11-03T08:41:49Z', cancel_at_period_end: false, started_at: '2026-11-03T08:41:49Z', status: 'active' }
  eq('pro card: a Polar subscription read', readSub(polarSub, now), { at: now, amount: 299, currency: 'usd', interval: 'year', periodEnd: Date.parse('2027-11-03T08:41:49Z'), cancelAtPeriodEnd: false, startedAt: Date.parse('2026-11-03T08:41:49Z') })
  eq('pro card: junk is no subscription', [readSub(null, now), readSub('x', now), readSub({ status: 'active' }, now)], [null, null, null])

  const prev = { key: 'SB-1', activationId: 'a', status: 'granted' as const, checkedAt: now - 5 * DAY, okAt: now - 5 * DAY }
  const answer = { benefit_id: PRO_BENEFIT_ID, status: 'granted', expires_at: null, created_at: '2026-11-03T08:41:50Z', customer: { email: 'buyer@example.com', name: 'B' } }
  const read = readValidation(200, answer, prev, now)
  eq('pro card: validate keeps the email and the purchase day', [read.email, read.since], ['buyer@example.com', Date.parse('2026-11-03T08:41:50Z')])
  eq('pro card: a later answer without them keeps what we had', readValidation(200, { benefit_id: PRO_BENEFIT_ID, status: 'granted' }, read, now).email, 'buyer@example.com')
  eq('pro card: a key for another product never brings its email', readValidation(200, { ...answer, benefit_id: 'other' }, prev, now).email, undefined)

  const base = { early: true, shows070: 0, updated080: false, shows080: 0 }
  eq('whats new: someone who bought Pro skips the Pro note', [pickWhatsNew({ ...base, paid: true }), pickWhatsNew({ ...base, paid: true, updated080: true })], [null, '080'])
}

// ---------- School mode: the pro, ai and rating locks ----------
import { NO_LOCKS } from '../src/lib/managedPlan'
import { offersTodo } from '../src/lib/proPlan'
import managedSchema from '../public/managed_schema.json'
{
  // Parsing: on with true (or the registry's DWORD 1), off by default, junk locks nothing.
  const school = parseManagedConfig({ lock: { pro: true, ai: true, rating: true } })
  eq('school: the three new locks parse', [school.lock.pro, school.lock.ai, school.lock.rating], [true, true, true])
  eq('school: they leave the other locks alone', school.lock, { appearance: false, starterPacks: false, importExport: false, pro: true, ai: true, rating: true })
  eq('school: the registry DWORD 1 locks too', parseLocks({ pro: 1, ai: 1, rating: 1 }), { ...NO_LOCKS, pro: true, ai: true, rating: true })
  eq('school: off by default', [NO_LOCKS.pro, NO_LOCKS.ai, NO_LOCKS.rating, parseLocks({}).pro, parseLocks(null).ai, parseManagedConfig({}).lock.rating, parseManagedConfig(undefined).lock.pro], [false, false, false, false, false, false, false])
  eq('school: junk values lock nothing', [parseLocks({ pro: 'yes', ai: 2, rating: {} }), parseLocks({ pro: 'true', ai: [true], rating: null }), parseLocks({ pro: 0, ai: false, rating: -1 }), parseLocks('lock everything')], [NO_LOCKS, NO_LOCKS, NO_LOCKS, NO_LOCKS])
  eq('school: the admin console and JSON-string forms unwrap', [
    parseManagedConfig({ lock: { Value: { pro: true } } }).lock.pro,
    parseManagedConfig({ lock: JSON.stringify({ ai: true }) }).lock.ai,
    parseLocks({ rating: { Value: true } }).rating,
    parseManagedConfig({ lock: { Value: { pro: true } } }).lock.ai,
  ], [true, true, true, false])
  eq('school: anyLock counts each new lock on its own', [anyLock({ ...NO_LOCKS, pro: true }), anyLock({ ...NO_LOCKS, ai: true }), anyLock({ ...NO_LOCKS, rating: true }), anyLock(NO_LOCKS)], [true, true, true, false])
  eq('school: a policy with only these locks still applies', [isEmptyConfig(school), isEmptyConfig(parseManagedConfig({ lock: { rating: true } })), isEmptyConfig(parseManagedConfig({ lock: { pro: false, ai: 'yes' } }))], [false, false, true])
  eq('school: the managed schema declares each lock the parser reads, as a switch', Object.entries(managedSchema.properties.lock.properties).map(([k, v]) => `${k}:${v.type}`), Object.keys(NO_LOCKS).map((k) => `${k}:boolean`))
  eq('school: the schema says what each new lock does', ['pro', 'ai', 'rating'].map((k) => (managedSchema.properties.lock.properties as Record<string, { title: string }>)[k].title), [
    'Hide Stackboard Pro: no prices, trial or upgrade prompts',
    'Turn off AI tidy and AI pick',
    'Never ask people to rate Stackboard',
  ])

  // Pro under the pro lock: a trial counts for nothing, a paid key keeps working.
  const DAY = 86_400_000
  const now = Date.UTC(2026, 11, 1)
  const good = { key: 'SB-1', activationId: 'a', status: 'granted' as const, checkedAt: now, okAt: now }
  eq('school pro: a running trial counts for nothing', proState({ license: null, trialStartedAt: now - DAY, now, lockPro: true }), { kind: 'free', trialUsed: true })
  eq('school pro: a paid key keeps working', proState({ license: good, trialStartedAt: now - DAY, now, lockPro: true }), { kind: 'pro' })
  eq('school pro: a key with a problem stays paused, with no trial to fall back on', proState({ license: { key: 'x', status: 'revoked' }, trialStartedAt: now - DAY, now, lockPro: true }), { kind: 'paused', reason: 'ended' })
  eq('school pro: no key and no trial is plain free', proState({ license: null, trialStartedAt: null, now, lockPro: true }), { kind: 'free', trialUsed: false })
  eq('school pro: without the lock the trial runs as before', [proState({ license: null, trialStartedAt: now - DAY, now, lockPro: false }), proState({ license: null, trialStartedAt: now - DAY, now })], [{ kind: 'trial', daysLeft: 13 }, { kind: 'trial', daysLeft: 13 }])
  eq('school pro: New stack offers To-do list only to someone who can make one', [offersTodo({ lockPro: true, canMake: false }), offersTodo({ lockPro: true, canMake: true }), offersTodo({ lockPro: false, canMake: false }), offersTodo({ lockPro: false, canMake: true })], [false, true, true, true])
  const trialHere = proState({ license: null, trialStartedAt: now - DAY, now, lockPro: true })
  eq('school pro: the trial unlocks no list, an early user who kept lists free still makes them', [offersTodo({ lockPro: true, canMake: canMakeTodo(trialHere, false) }), offersTodo({ lockPro: true, canMake: canMakeTodo(trialHere, true) })], [false, true])

  // No trial-end recap, auto-archive line or Pro note under the pro lock.
  const t0 = new Date(2026, 10, 3, 9, 0).getTime()
  const card = { trialStartedAt: t0 - 13 * DAY, now: t0, endingShows: 0, endedShows: 0, checkoutPending: false }
  const ended = { ...card, trialStartedAt: t0 - 15 * DAY, state: { kind: 'free', trialUsed: true } as const }
  eq('school pro: no trial-end recap, ending or ended', [pickTrialCard({ ...card, state: { kind: 'trial', daysLeft: 1 }, lockPro: true }), pickTrialCard({ ...ended, lockPro: true })], [null, null])
  eq('school pro: the same recap shows without the lock', [pickTrialCard({ ...card, state: { kind: 'trial', daysLeft: 1 } }), pickTrialCard(ended)], ['ending', 'ended'])
  eq('school pro: no auto-archive line, before or after a trial', [momentLine({ state: { kind: 'free', trialUsed: false }, shown: 0, lockPro: true }), momentLine({ state: { kind: 'free', trialUsed: true }, shown: 0, lockPro: true }), !!momentLine({ state: { kind: 'free', trialUsed: false }, shown: 0 })], [null, null, true])
  const notes = { early: true, shows070: 0, updated080: false, shows080: 0 }
  eq('school pro: an early user gets no Pro note, and the next note still comes', [pickWhatsNew({ ...notes, lockPro: true }), pickWhatsNew({ ...notes, lockPro: true, updated090: true, shows090: 0 }), pickWhatsNew(notes)], [null, '090', '070'])
  eq('school pro: the 0.8.0 note keeps its lead and drops the Pro line', [
    whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true, todoMoved: true, trialOpen: true, lockPro: true }).pro,
    whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true, lockPro: true }).lead,
  ], [null, 'New in Stackboard 0.8.0: folders inside stacks, a Packed layout that closes the gaps under short stacks (Settings > Appearance > Layout), and share a stack as a link.'])
  const n090 = whatsNew090({ lockAppearance: false, lockImportExport: false, layout: 'rows', missed080: true, todoMoved: true, trialOpen: true, lockPro: true })
  eq('school pro: the 0.9.0 note keeps the free line and drops Pro and the trial', [n090.lead, n090.pro, n090.tryPacked], [
    'New in Stackboard 0.9.0: folders inside stacks, a Packed layout that closes the gaps under short stacks (Settings > Appearance > Layout), share a stack as a link, and saving a page suggests the right stack.',
    null,
    true,
  ])

  // The ai lock: a note never names AI tidy while the company has it off.
  eq('school ai: the 0.8.0 Pro line leaves out AI tidy', [
    whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true, lockAi: true }).pro,
    whatsNew080({ lockAppearance: false, lockImportExport: false, layout: 'rows', proLine: true, todoMoved: true, trialOpen: true, lockAi: true }).pro,
  ], ['Pro adds due dates, a Today list and clean-up.', 'To-do lists now come with Pro, along with due dates, a Today list and clean-up. Try it free for 14 days, no card needed.'])

  // The rating lock: never, whichever rule would fire.
  const r = { opens: 40, firstSeen: t0 - 10 * DAY, now: t0, answered: false, links: 5 }
  eq('school rating: no rating card on a new tab, after a win or at a milestone', [shouldAskForRating({ ...r, lockRating: true }), shouldAskForRating({ ...r, trigger: 'win', lockRating: true }), shouldAskForRating({ ...r, trigger: 'milestone', lockRating: true })], [false, false, false])
  eq('school rating: the same board is asked without the lock', [shouldAskForRating(r), shouldAskForRating({ ...r, trigger: 'win' }), shouldAskForRating({ ...r, trigger: 'milestone' }), shouldAskForRating({ ...r, lockRating: false })], [true, true, true, true])
}

// ---------- 0.9.2: Pro for life, and the reverse trial for new installs ----------
import { LIFETIME_PRICE, REVERSE_TRIAL, lifetimeCheckoutUrl, olderTrialWins, readTrial, reverseTrialOnInstall } from '../src/lib/proPlan'
import { REVERSE_CARD_DAYS, REVERSE_CARD_OPENS, REVERSE_CARD_SHOWS, REVERSE_CARD_WAIT_MS, reverseCardLine, reverseCardTitle, showReverseCard } from '../src/lib/nudgePlan'
{
  const DAY = 86_400_000
  const HOUR = 3_600_000
  const now = Date.UTC(2026, 10, 6, 9, 0)

  // Pro for life: its own checkout, labelled like the yearly one.
  eq('lifetime: the checkout link and the price', [lifetimeCheckoutUrl(), LIFETIME_PRICE], [CHECKOUT.lifetime, '$19'])
  const life = new URL(lifetimeCheckoutUrl({ surface: 'settings-lifetime', plan: 'auto-trial', version: '0.9.2' }))
  eq('lifetime: a labelled link keeps its checkout and carries four labels', [life.origin + life.pathname, [...life.searchParams.keys()].sort().join(',')], [CHECKOUT.lifetime, 'utm_campaign,utm_content,utm_medium,utm_source'])
  eq('lifetime: the labels say button, plan and version', [life.searchParams.get('utm_source'), life.searchParams.get('utm_medium'), life.searchParams.get('utm_content'), life.searchParams.get('utm_campaign')], ['extension', 'settings-lifetime', 'auto-trial', 'v0.9.2'])
  const lifeDev = new URL(lifetimeCheckoutUrl({ surface: 'trial-end-lifetime', plan: 'trial-ended', dev: true }))
  eq('lifetime: an unpacked build is labelled dev, and no version means no campaign', [lifeDev.searchParams.get('utm_source'), lifeDev.searchParams.get('utm_medium'), lifeDev.searchParams.get('utm_content'), lifeDev.searchParams.has('utm_campaign')], ['extension-dev', 'trial-end-lifetime', 'trial-ended', false])
  eq('lifetime: the yearly links stay as they were', [checkoutUrl(true, now), checkoutUrl(false, now), checkoutUrl(false, FOUNDING_ENDS + 1)], [CHECKOUT.early, CHECKOUT.founding, CHECKOUT.regular])

  // The thanks page sends { lifetime: true, amount, currency, started_at } for a Pro for life order.
  eq('lifetime: the hand-off plan reads as Pro for life', readSub({ lifetime: true, amount: 1900, currency: 'usd', started_at: '2026-11-06T08:00:00Z' }, now), { at: now, amount: 1900, currency: 'usd', lifetime: true, startedAt: Date.parse('2026-11-06T08:00:00Z') })
  eq('lifetime: it counts with nothing else, and period fields are dropped', [readSub({ lifetime: true }, now), readSub({ lifetime: true, recurring_interval: 'year', current_period_end: '2027-11-06T08:00:00Z' }, now)], [{ at: now, lifetime: true }, { at: now, lifetime: true }])
  eq('lifetime: only lifetime: true counts', [readSub({ lifetime: 'yes' }, now), readSub({ lifetime: 1 }, now)], [null, null])

  const license = { key: 'SB-1A2B-9F2C', activationId: 'a', status: 'granted' as const, checkedAt: now, okAt: now, email: 'buyer@example.com', since: Date.UTC(2026, 10, 6, 8, 0) }
  const card = proCard({ license, sub: { amount: 1900, currency: 'usd', lifetime: true, startedAt: Date.UTC(2026, 10, 6, 8, 0), at: now }, now })
  eq('lifetime: the Pro card says Pro for life, paid once', card.plan, 'Pro for life, $19 paid once')
  eq('lifetime: no renewal row, the rest as for a yearly key', card.rows, [
    { label: 'Pro since', value: '6 Nov 2026' },
    { label: 'Email', value: 'buyer@example.com' },
    { label: 'Key', value: 'SB-...-9F2C' },
    { label: 'Checked', value: 'today, with Polar' },
  ])
  eq('lifetime: no price from Polar means none on the card; cents stay when there are some', [proCard({ license, sub: { lifetime: true, at: now }, now }).plan, proCard({ license, sub: { lifetime: true, amount: 1950, currency: 'usd', at: now }, now }).plan], ['Pro for life', 'Pro for life, $19.50 paid once'])
  eq('lifetime: a round amount drops the cents only when asked', [money(1900, 'usd', true), money(1900), money(299, 'usd', true), money(100, 'zz', true)], ['$19', '$19.00', '$2.99', '1 ZZ'])

  // The reverse trial, decided by the service worker on install only.
  eq('reverse trial: the switch is on', REVERSE_TRIAL, true)
  eq('reverse trial: a fresh install with nothing synced starts it', reverseTrialOnInstall({ lockPro: false, trial: undefined, key: undefined }), true)
  eq('reverse trial: never under the pro lock, or with a trial or a key already synced', [
    reverseTrialOnInstall({ lockPro: true, trial: undefined, key: undefined }),
    reverseTrialOnInstall({ lockPro: false, trial: { startedAt: now - 30 * DAY }, key: undefined }),
    reverseTrialOnInstall({ lockPro: false, trial: undefined, key: { key: 'SB-1' } }),
  ], [false, false, false])
  eq('reverse trial: readTrial keeps the start and the auto mark', [readTrial({ startedAt: now, auto: true }), readTrial({ startedAt: now }), readTrial({ startedAt: now, auto: 'yes' }), readTrial({ startedAt: -1 }), readTrial(null)], [{ startedAt: now, auto: true }, { startedAt: now, auto: false }, { startedAt: now, auto: false }, null, null])
  eq('reverse trial: an auto trial newer than the one it replaced gives way', [
    olderTrialWins({ startedAt: now - 20 * DAY }, { startedAt: now, auto: true }),
    olderTrialWins({ startedAt: now - 20 * DAY, auto: true }, { startedAt: now, auto: true }),
  ], [true, true])
  eq('reverse trial: every other change stands', [
    olderTrialWins(undefined, { startedAt: now, auto: true }),
    olderTrialWins({ startedAt: now, auto: true }, undefined),
    olderTrialWins({ startedAt: now - DAY }, { startedAt: now }),
    olderTrialWins({ startedAt: now, auto: true }, { startedAt: now - 2 * DAY, auto: true }),
  ], [false, false, false, false])

  // The reverse-trial card.
  const start = now - 2 * DAY
  const base = { state: { kind: 'trial', daysLeft: 12 } as const, trialAuto: true, trialStartedAt: start, firstSeen: start, opens: 5, shows: 0, now, welcoming: false, checkoutPending: false }
  eq('reverse card: an auto trial two days in, on the fifth new tab', showReverseCard(base), true)
  eq('reverse card: from the third new tab', [1, 2, REVERSE_CARD_OPENS].map((opens) => showReverseCard({ ...base, opens })), [false, false, true])
  eq("reverse card: 20 hours after install, counted from this computer's first tab when that came later", [
    showReverseCard({ ...base, trialStartedAt: now - 19 * HOUR, firstSeen: now - 19 * HOUR, state: { kind: 'trial', daysLeft: 14 } }),
    showReverseCard({ ...base, trialStartedAt: now - REVERSE_CARD_WAIT_MS, firstSeen: now - REVERSE_CARD_WAIT_MS, state: { kind: 'trial', daysLeft: 14 } }),
    showReverseCard({ ...base, firstSeen: now - HOUR }),
  ], [false, true, false])
  eq('reverse card: while at least 3 days are left', [showReverseCard({ ...base, state: { kind: 'trial', daysLeft: REVERSE_CARD_DAYS } }), showReverseCard({ ...base, state: { kind: 'trial', daysLeft: 2 } })], [true, false])
  eq('reverse card: two tabs at most, retired when answered', [showReverseCard({ ...base, shows: 1 }), showReverseCard({ ...base, shows: REVERSE_CARD_SHOWS }), showReverseCard({ ...base, shows: -1 })], [true, false, false])
  eq('reverse card: never for an opt-in trial, a key, a trial that ended, the welcome screen, a pending checkout or the pro lock', [
    showReverseCard({ ...base, trialAuto: false }),
    showReverseCard({ ...base, state: { kind: 'pro' } }),
    showReverseCard({ ...base, state: { kind: 'free', trialUsed: true } }),
    showReverseCard({ ...base, welcoming: true }),
    showReverseCard({ ...base, checkoutPending: true }),
    showReverseCard({ ...base, lockPro: true }),
    showReverseCard({ ...base, trialStartedAt: null }),
  ], [false, false, false, false, false, false, false])
  eq('reverse card: the title names the last free day', reverseCardTitle(new Date(2026, 10, 6, 10, 0).getTime()), 'Pro is on, free until 20 Nov')
  eq('reverse card: the line, with the command bar key for the platform', [reverseCardLine(false), reverseCardLine(true)], [
    'Try Ctrl+K to jump anywhere, a to-do list, or a colour on a stack. Everything you make stays when the trial ends.',
    'Try ⌘K to jump anywhere, a to-do list, or a colour on a stack. Everything you make stays when the trial ends.',
  ])
  eq('corner: the reverse-trial card takes its turn like the others', [claimable(null, 'reverseTrial'), claimable('whatsNew', 'reverseTrial'), claimable('reverseTrial', 'trialEnd'), claimable('reverseTrial', 'reverseTrial')], [true, false, false, true])
  // The trial-end recap reads the state and the start only, so a trial that started by itself gets it too.
  const ending = { trialStartedAt: now - 13 * DAY, now, endingShows: 0, endedShows: 0, checkoutPending: false }
  eq('reverse trial: the recap comes at its end too', [pickTrialCard({ ...ending, state: { kind: 'trial', daysLeft: 1 } }), pickTrialCard({ ...ending, trialStartedAt: now - 15 * DAY, state: { kind: 'free', trialUsed: true } })], ['ending', 'ended'])
}

// ---------- 0.9.3: "What stopped you?" after a checkout with no purchase ----------
import { REVERSE_CARD_DELAY_MS, WHY_NOTE_MAX, WHY_NOT_AFTER_MS, WHY_NOT_DELAY_MS, WHY_NOT_MAX, WHY_NOT_WITHIN_MS, WHY_REASONS, showWhyNot, whyAnswer, whyNotOffersTrial } from '../src/lib/nudgePlan'
{
  const DAY = 86_400_000
  const MIN = 60_000
  const now = Date.UTC(2026, 10, 8, 9, 0)
  const at = now - 15 * MIN
  const free = { kind: 'free', trialUsed: false } as const
  const base = { state: free, checkoutAt: at, now, askedAt: 0, asked: 0, welcoming: false, ratingOpen: false }

  // When it asks.
  eq('why not: a free board 15 minutes after a checkout is asked', showWhyNot(base), true)
  eq('why not: the limits are 10 minutes, 7 days and three checkouts', [WHY_NOT_AFTER_MS, WHY_NOT_WITHIN_MS, WHY_NOT_MAX], [10 * MIN, 7 * DAY, 3])
  eq('why not: from 10 minutes after the checkout to 7 days after it', [
    showWhyNot({ ...base, checkoutAt: now - 9 * MIN }),
    showWhyNot({ ...base, checkoutAt: now - WHY_NOT_AFTER_MS }),
    showWhyNot({ ...base, checkoutAt: now - 3 * DAY }),
    showWhyNot({ ...base, checkoutAt: now - WHY_NOT_WITHIN_MS }),
    showWhyNot({ ...base, checkoutAt: now - WHY_NOT_WITHIN_MS - 1 }),
  ], [false, true, true, true, false])
  eq('why not: no checkout, or one stamped in the future, never asks', [showWhyNot({ ...base, checkoutAt: null }), showWhyNot({ ...base, checkoutAt: now + MIN })], [false, false])
  eq('why not: once per checkout, and a newer checkout asks again', [showWhyNot({ ...base, askedAt: at, asked: 1 }), showWhyNot({ ...base, askedAt: at - 2 * DAY, asked: 1 })], [false, true])
  eq('why not: three checkouts at most on this computer', [showWhyNot({ ...base, asked: WHY_NOT_MAX - 1 }), showWhyNot({ ...base, asked: WHY_NOT_MAX }), showWhyNot({ ...base, asked: 9 })], [true, false, false])
  eq('why not: on the trial, after it, and for a key whose plan ended (Renew Pro)', [
    showWhyNot({ ...base, state: { kind: 'trial', daysLeft: 5 } }),
    showWhyNot({ ...base, state: { kind: 'free', trialUsed: true } }),
    showWhyNot({ ...base, state: { kind: 'paused', reason: 'ended' } }),
  ], [true, true, true])
  eq('why not: never with Pro on, or with a key that is being checked or has a problem', [
    showWhyNot({ ...base, state: { kind: 'pro' } }),
    ...(['checking', 'offline', 'disabled', 'unknown-key', 'device-limit', 'removed'] as const).map((reason) => showWhyNot({ ...base, state: { kind: 'paused', reason } })),
  ], [false, false, false, false, false, false, false])
  eq('why not: never under the pro lock, on the welcome screen or with the rating ask open', [
    showWhyNot({ ...base, lockPro: true }),
    showWhyNot({ ...base, welcoming: true }),
    showWhyNot({ ...base, ratingOpen: true }),
    showWhyNot({ ...base, lockPro: false }),
  ], [false, false, false, true])
  eq('why not: it decides after the reverse-trial card, so it goes last', WHY_NOT_DELAY_MS > REVERSE_CARD_DELAY_MS, true)
  eq('corner: "what stopped you?" takes its turn like the others', [claimable(null, 'whyNot'), claimable('reverseTrial', 'whyNot'), claimable('whyNot', 'moment'), claimable('whyNot', 'whyNot')], [true, false, false, true])

  // What a picked answer sends.
  eq('why not: five answers in order, with the reasons the server accepts', WHY_REASONS.map((r) => `${r.reason}: ${r.label}`), ['looking: Just looking', 'try-first: Want to try it first', 'price: The price', 'payment: Payment method', 'other: Something else'])
  const answer = (p: Partial<Parameters<typeof whyAnswer>[0]>) => whyAnswer({ reason: 'price', state: free, trialAuto: false, lifetime: false, version: '0.9.3', ...p })
  eq('why not: an answer is the reason, the note, the plan, the product and the version, nothing else', JSON.stringify(answer({})), '{"reason":"price","note":"","plan":"free","product":"yearly","v":"0.9.3"}')
  eq('why not: the plan at the click, and which checkout it was', [
    answer({ reason: 'looking', state: { kind: 'trial', daysLeft: 3 }, trialAuto: true, lifetime: true }),
    answer({ reason: 'payment', state: { kind: 'free', trialUsed: true } }),
    answer({ reason: 'try-first', state: { kind: 'paused', reason: 'ended' } }),
  ].map((a) => `${a.reason} ${a.plan} ${a.product}`), ['looking auto-trial lifetime', 'payment trial-ended yearly', 'try-first paused yearly'])
  eq('why not: a note goes with Something else only, trimmed and cut at 300 characters', [
    answer({ reason: 'other', note: '  Need an invoice for work  ' }).note,
    answer({ reason: 'other', note: 'x'.repeat(400) }).note.length,
    answer({ reason: 'other' }).note,
    answer({ reason: 'price', note: 'typed, then picked The price' }).note,
  ], ['Need an invoice for work', WHY_NOTE_MAX, '', ''])
  eq('why not: the cap matches the server', WHY_NOTE_MAX, 300)
  eq('why not: Want to try it first offers the trial only when it was never used and the company allows it', [
    whyNotOffersTrial({ reason: 'try-first', trialStartedAt: null }),
    whyNotOffersTrial({ reason: 'try-first', trialStartedAt: now - 20 * DAY }),
    whyNotOffersTrial({ reason: 'try-first', trialStartedAt: null, lockPro: true }),
    whyNotOffersTrial({ reason: 'price', trialStartedAt: null }),
  ], [true, false, false, false])
}

// ---------- 0.9.4: one-tap switches during a trial, and what stops when it ends ----------
import { DEFAULT_ARCHIVE_AFTER } from '../src/lib/archivePlan'
import { joinList } from '../src/lib/statsPlan'
import { trialStopsLine, trialSwitches } from '../src/lib/nudgePlan'
{
  const HOUR = 3_600_000
  const views = (v: ReturnType<typeof trialSwitches>) => v.map((s) => `${s.key} ${s.on ? 'on' : 'off'}: ${s.label}`)

  // The switches on the reverse-trial card and in Settings > Stackboard Pro during a trial.
  eq('trial switches: auto-archive goes to 12 hours, one of the choices in Settings', [DEFAULT_ARCHIVE_AFTER, ARCHIVE_AFTER.some((c) => c.ms === DEFAULT_ARCHIVE_AFTER && c.label === '12 hours')], [12 * HOUR, true])
  eq('trial switches: both off, two buttons, auto-archive first', views(trialSwitches({ archiveAfter: null, stripOn: false, switched: [] })), [
    'archive off: Turn on auto-archive',
    'strip off: Show the Today strip',
  ])
  eq('trial switches: once switched on from here, the button says so', views(trialSwitches({ archiveAfter: DEFAULT_ARCHIVE_AFTER, stripOn: false, switched: ['archive'] })), [
    'archive on: Auto-archive is on: idle tabs save themselves after 12 hours',
    'strip off: Show the Today strip',
  ])
  eq('trial switches: both switched on from here', views(trialSwitches({ archiveAfter: DEFAULT_ARCHIVE_AFTER, stripOn: true, switched: ['archive', 'strip'] })), [
    'archive on: Auto-archive is on: idle tabs save themselves after 12 hours',
    'strip on: Today strip is on',
  ])
  eq('trial switches: no button for a feature that was on already', [
    views(trialSwitches({ archiveAfter: 6 * HOUR, stripOn: false, switched: [] })),
    views(trialSwitches({ archiveAfter: null, stripOn: true, switched: [] })),
  ], [['strip off: Show the Today strip'], ['archive off: Turn on auto-archive']])
  eq('trial switches: nothing when both were on already, so the Settings row goes', trialSwitches({ archiveAfter: DEFAULT_ARCHIVE_AFTER, stripOn: true, switched: [] }), [])
  eq('trial switches: switched off again (in Settings or on another computer), the button comes back', views(trialSwitches({ archiveAfter: null, stripOn: false, switched: ['archive', 'strip'] })), [
    'archive off: Turn on auto-archive',
    'strip off: Show the Today strip',
  ])
  eq('trial switches: the line names the time picked later in Settings', [6 * HOUR, 24 * HOUR, 7 * 24 * HOUR].map((ms) => trialSwitches({ archiveAfter: ms, stripOn: true, switched: ['archive'] })[0]?.label), [
    'Auto-archive is on: idle tabs save themselves after 6 hours',
    'Auto-archive is on: idle tabs save themselves after 1 day',
    'Auto-archive is on: idle tabs save themselves after 1 week',
  ])

  // The trial-end recap's line after the numbers: what stops, from what's switched on.
  const start = new Date(2026, 10, 6, 10, 0).getTime() // the trial ends on 20 Nov
  const line = (card: 'ending' | 'ended', archiveOn: boolean, stripOn: boolean) => trialStopsLine({ card, trialStartedAt: start, archiveOn, stripOn })
  eq('trial stops: before the end, auto-archive is named only while it is on', [line('ending', true, false), line('ending', false, false)], [
    'When it ends on 20 Nov, auto-archive and daily snapshots stop. Everything you made stays.',
    'When it ends on 20 Nov, daily snapshots stop. Everything you made stays.',
  ])
  eq('trial stops: before the end, the Today strip too while it is on', [line('ending', true, true), line('ending', false, true)], [
    'When it ends on 20 Nov, auto-archive, daily snapshots and the Today strip stop. Everything you made stays.',
    'When it ends on 20 Nov, daily snapshots and the Today strip stop. Everything you made stays.',
  ])
  eq('trial stops: after the end, the same names in the past', [line('ended', true, false), line('ended', false, false), line('ended', true, true), line('ended', false, true)], [
    'Auto-archive and daily snapshots have stopped. Everything you made stays.',
    'Daily snapshots have stopped. Everything you made stays.',
    'Auto-archive, daily snapshots and the Today strip have stopped. Everything you made stays.',
    'Daily snapshots and the Today strip have stopped. Everything you made stays.',
  ])
  eq(
    'trial stops: the date is the day and the short month, no leading zero, across a month end',
    trialStopsLine({ card: 'ending', trialStartedAt: new Date(2026, 10, 17, 23, 30).getTime(), archiveOn: false, stripOn: false }),
    'When it ends on 1 Dec, daily snapshots stop. Everything you made stays.',
  )
  eq('trial stops: the same last day the reverse-trial card names', line('ending', false, false).startsWith(`When it ends on ${reverseCardTitle(start).replace('Pro is on, free until ', '')}, `), true)
  eq('trial stops: the list reads like the stats line', [joinList(['a']), joinList(['a', 'b']), joinList(['a', 'b', 'c'])], ['a', 'a and b', 'a, b and c'])

  // The copy rules: plain words, no dashes or dots between them.
  const words = [
    ...views(trialSwitches({ archiveAfter: null, stripOn: false, switched: [] })),
    ...views(trialSwitches({ archiveAfter: DEFAULT_ARCHIVE_AFTER, stripOn: true, switched: ['archive', 'strip'] })),
    ...(['ending', 'ended'] as const).flatMap((c) => [line(c, true, true), line(c, false, false)]),
  ]
  // Em dash, en dash and middle dot, by code point.
  eq('trial copy: no em dashes or middle dots', words.filter((w) => [0x2014, 0x2013, 0xb7].some((c) => w.includes(String.fromCharCode(c)))), [])
}

// ---------- 0.9.4: the founding offer on Pro for life, after The price ----------
import { LIFETIME_OFFER_PRICE, lifetimeOfferUrl } from '../src/lib/proPlan'
import { WHY_PRICE_OFFER, whyNotOffersPrice } from '../src/lib/nudgePlan'
{
  const before = Date.UTC(2026, 10, 10, 9, 0)
  eq('price offer: The price brings it until the founding price ends, and not a second later', [
    whyNotOffersPrice({ reason: 'price', now: before }),
    whyNotOffersPrice({ reason: 'price', now: FOUNDING_ENDS }),
    whyNotOffersPrice({ reason: 'price', now: FOUNDING_ENDS + 1 }),
  ], [true, true, false])
  eq('price offer: never under the company pro lock', [whyNotOffersPrice({ reason: 'price', now: before, lockPro: true }), whyNotOffersPrice({ reason: 'price', now: before, lockPro: false })], [false, true])
  eq('price offer: no other answer brings it', (['looking', 'try-first', 'payment', 'other'] as const).map((reason) => whyNotOffersPrice({ reason, now: before })), [false, false, false, false])
  eq('price offer: the line and the button', [WHY_PRICE_OFFER.line, WHY_PRICE_OFFER.button, LIFETIME_OFFER_PRICE, LIFETIME_PRICE], [
    "Here's a founding offer: Pro for life for $9.99 (usually $19), until 31 Dec.",
    'Get Pro for life for $9.99',
    '$9.99',
    '$19',
  ])
  eq(
    'price offer: 31 Dec in the line is the last day of the founding price, Singapore time',
    [FOUNDING_ENDS, new Date(FOUNDING_ENDS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })],
    [Date.parse('2026-12-31T15:59:59Z'), '31 Dec'],
  )
  eq('price offer: its own checkout link, and the public Pro for life link stays the $19 one', [CHECKOUT.lifetimeOffer, lifetimeOfferUrl(), lifetimeCheckoutUrl()], [
    'https://buy.polar.sh/polar_cl_fdIwiaHAZZJmWaP3q3P2nywkOuzRrtaC5wyPh1cbRTo',
    'https://buy.polar.sh/polar_cl_fdIwiaHAZZJmWaP3q3P2nywkOuzRrtaC5wyPh1cbRTo',
    'https://buy.polar.sh/polar_cl_ypdUWh3QdU4DghsZoSm7xcIG6SoBFZaC8Bl9b1Ad37W',
  ])
  const offer = new URL(lifetimeOfferUrl({ surface: 'why-price-offer', plan: 'trial-ended', version: '0.9.4' }))
  eq(
    'price offer: the link carries the usual labels, why-price-offer as the button',
    [offer.origin + offer.pathname, offer.searchParams.get('utm_source'), offer.searchParams.get('utm_medium'), offer.searchParams.get('utm_content'), offer.searchParams.get('utm_campaign')],
    [CHECKOUT.lifetimeOffer, 'extension', 'why-price-offer', 'trial-ended', 'v0.9.4'],
  )
}

// ---------- 0.9.5: one free AI tidy per person ----------
// The server's budget is plain JavaScript in site/api/_lib/freeTidy.js, with no imports, so it's tested here.
import { FREE_LINKS, FREE_RUNS, dayPrefix, fits, freeDay, markerLinks, markerPath, readBudget, tally } from '../site/api/_lib/freeTidy.js'
import { FREE_TIDY_NOTE, TIDY_LABEL, tidyAccess } from '../src/lib/tidyPlan'
{
  // The daily budget all free runs share.
  eq('free tidy budget: 300 runs and 30,000 links a day', [FREE_RUNS, FREE_LINKS], [300, 30000])
  eq('free tidy budget: runs count towards the UTC day', [freeDay(Date.UTC(2026, 10, 12, 23, 59, 59)), freeDay(Date.UTC(2026, 10, 13, 0, 0, 0))], ['2026-11-12', '2026-11-13'])
  eq("free tidy budget: a marker sits in its day's folder, named by its link count", [dayPrefix('2026-11-12'), markerPath('2026-11-12', 137)], ['free-tidy/2026-11-12/', 'free-tidy/2026-11-12/137.json'])
  eq("free tidy budget: the count reads back with the store's random suffix or without; a name without one counts no links", [
    markerLinks('free-tidy/2026-11-12/137-Ab3xYz9QpL.json'),
    markerLinks('free-tidy/2026-11-12/12.json'),
    markerLinks('free-tidy/2026-11-12/odd-name.json'),
    markerLinks(''),
  ], [137, 12, 0, 0])
  eq("free tidy budget: a day's tally counts every marker as a run", [
    tally(['free-tidy/2026-11-12/137-a1.json', 'free-tidy/2026-11-12/5-b2.json', 'free-tidy/2026-11-12/odd-name.json']),
    tally([]),
  ], [{ runs: 3, links: 142 }, { runs: 0, links: 0 }])
  const budget = readBudget({})
  eq('free tidy budget: a run fits while the day stays within 300 runs and 30,000 links, both included', [
    fits({ runs: 0, links: 0 }, 600, budget),
    fits({ runs: 299, links: 29400 }, 600, budget),
    fits({ runs: 300, links: 0 }, 1, budget),
    fits({ runs: 10, links: 29401 }, 600, budget),
    fits({ runs: 10, links: 30000 }, 1, budget),
  ], [true, true, false, false, false])
  eq('free tidy budget: FREE_TIDY_RUNS and FREE_TIDY_LINKS can change it, and 0 stops free runs', [
    readBudget({ FREE_TIDY_RUNS: '50', FREE_TIDY_LINKS: '5000' }),
    readBudget({ FREE_TIDY_RUNS: '0' }),
    readBudget({ FREE_TIDY_RUNS: ' 12 ', FREE_TIDY_LINKS: '' }),
    readBudget({ FREE_TIDY_RUNS: '-1', FREE_TIDY_LINKS: '1e3' }),
    fits({ runs: 0, links: 0 }, 1, readBudget({ FREE_TIDY_RUNS: '0' })),
  ], [{ runs: 50, links: 5000 }, { runs: 0, links: 30000 }, { runs: 12, links: 30000 }, { runs: 300, links: 30000 }, false])

  // Who gets it.
  const access = (p: Partial<Parameters<typeof tidyAccess>[0]>) => tidyAccess({ state: { kind: 'free', trialUsed: false }, activated: false, freeUsed: false, lockAi: false, lockPro: false, ...p })
  eq('free tidy: free and trial boards, and a key that is paused, get it while it is unused', [
    access({}),
    access({ state: { kind: 'free', trialUsed: true } }),
    access({ state: { kind: 'trial', daysLeft: 9 } }),
    ...(['ended', 'offline', 'disabled', 'unknown-key', 'device-limit', 'removed'] as const).map((reason) => access({ state: { kind: 'paused', reason }, activated: true })),
  ], ['free', 'free', 'free', 'free', 'free', 'free', 'free', 'free', 'free'])
  eq('free tidy: once used, or until that is known, there is none', [access({ freeUsed: true }), access({ freeUsed: null }), access({ state: { kind: 'trial', daysLeft: 3 }, freeUsed: true })], [null, null, null])
  eq('free tidy: a paid key gets Tidy as before, whatever the free tidy says', [
    access({ state: { kind: 'pro' }, activated: true }),
    access({ state: { kind: 'pro' }, activated: true, freeUsed: true }),
    access({ state: { kind: 'pro' }, activated: true, freeUsed: null }),
  ], ['paid', 'paid', 'paid'])
  eq('free tidy: a key with no activation here, or on its first check, gets neither', [access({ state: { kind: 'pro' }, activated: false }), access({ state: { kind: 'paused', reason: 'checking' } })], [null, null])
  eq('free tidy: the ai lock hides Tidy from everyone, the pro lock hides the free one', [
    access({ lockAi: true }),
    access({ state: { kind: 'pro' }, activated: true, lockAi: true }),
    access({ lockPro: true }),
    access({ state: { kind: 'free', trialUsed: true }, lockPro: true }),
    access({ state: { kind: 'pro' }, activated: true, lockPro: true }),
  ], [null, null, null, null, 'paid'])

  // What it sends, and how the answers read.
  const one = { links: [{ title: 'A', url: 'https://a.example/' }], ids: ['1'], stacks: [] }
  eq('free tidy: the same space goes with free: true and no key', JSON.stringify(tidyBody('Home', one, null)), '{"scope":"space","space":"Home","links":[{"title":"A","url":"https://a.example/"}],"free":true}')
  eq('free tidy: a paid run sends its key and no free flag, as before', JSON.stringify(tidyBody('Home', one, { key: 'SB-1', activationId: 'act' })), '{"scope":"space","space":"Home","links":[{"title":"A","url":"https://a.example/"}],"license":{"key":"SB-1","activationId":"act"}}')
  eq('free tidy: the answers to a free run', [
    readAnswer(429, { ok: false, reason: 'free-cap' }, 6, true),
    readAnswer(429, { ok: false, reason: 'busy' }, 6, true),
    readAnswer(402, { ok: false, reason: 'pro' }, 6, true),
    readAnswer(503, { ok: false, reason: 'free-check' }, 6, true),
    readAnswer(503, { ok: false, reason: 'not-ready' }, 6, true),
    readAnswer(403, { ok: false }, 6, true),
    'plan' in readAnswer(200, { ok: true, board: { spaces: [{ stacks: [{ name: 'A', links: [0] }] }] } }, 1, true),
  ], [{ error: 'free-cap' }, { error: 'busy' }, { error: 'not-ready' }, { error: 'busy' }, { error: 'not-ready' }, { error: 'busy' }, true])
  eq('free tidy: a paid run reads its answers as before', [readAnswer(402, { reason: 'pro' }, 6), readAnswer(429, { reason: 'daily-cap' }, 6)], [{ error: 'pro' }, { error: 'cap' }])
  eq('free tidy: the words', [TIDY_LABEL.free, TIDY_LABEL.paid, FREE_TIDY_NOTE.text, FREE_TIDY_NOTE.link, TIDY_ERRORS['free-cap']], [
    'Tidy (free once)',
    'Tidy',
    'That was your free tidy. Pro tidies any space, any time.',
    'See Pro',
    'Free tidies are used up for today. Try again tomorrow.',
  ])
}

// ---------- 0.9.5: the December founding-price note ----------
import { FOUNDING_LAST_DAYS_FROM, FOUNDING_NOTE, FOUNDING_NOTE_DELAY_MS, FOUNDING_NOTE_FROM, foundingNote, foundingWindow } from '../src/lib/nudgePlan'
{
  const DAY = 86_400_000
  const HOUR = 3_600_000
  const sgt = (iso: string) => Date.parse(`${iso}+08:00`)
  eq('founding note: the windows open on 1 Dec and on 28 Dec, 00:00 Singapore time', [FOUNDING_NOTE_FROM, FOUNDING_LAST_DAYS_FROM], [sgt('2026-12-01T00:00:00'), sgt('2026-12-28T00:00:00')])
  eq('founding note: the second window is the last four days before the founding price ends', FOUNDING_LAST_DAYS_FROM, FOUNDING_ENDS + 1000 - 4 * DAY)
  eq('founding note: the windows by the clock', [
    foundingWindow(sgt('2026-11-30T23:59:59')),
    foundingWindow(sgt('2026-12-01T00:00:00')),
    foundingWindow(sgt('2026-12-15T12:00:00')),
    foundingWindow(sgt('2026-12-27T23:59:59')),
    foundingWindow(sgt('2026-12-28T00:00:00')),
    foundingWindow(FOUNDING_ENDS),
    foundingWindow(FOUNDING_ENDS + 1),
    foundingWindow(sgt('2027-03-01T00:00:00')),
  ], [null, 'december', 'december', 'december', 'last-days', 'last-days', null, null])

  const base = {
    state: { kind: 'free', trialUsed: false } as const,
    early: false,
    now: sgt('2026-12-02T12:00:00'),
    shown: null,
    opens: 10,
    firstSeen: sgt('2026-11-20T09:00:00'),
    welcoming: false,
    checkoutPending: false,
  }
  const last = sgt('2026-12-29T12:00:00')
  eq('founding note: before 1 Dec, nothing', [foundingNote({ ...base, now: sgt('2026-11-30T20:00:00') }), foundingNote({ ...base, now: sgt('2026-11-10T09:00:00') })], [null, null])
  eq('founding note: a free board in the first window, on one new tab', [foundingNote(base), foundingNote({ ...base, shown: 'december' })], ['december', null])
  eq('founding note: once more in the last four days, whether or not it showed before', [
    foundingNote({ ...base, now: last, shown: 'december' }),
    foundingNote({ ...base, now: last }),
    foundingNote({ ...base, now: last, shown: 'last-days' }),
  ], ['last-days', 'last-days', null])
  eq('founding note: up to the deadline, and nothing after it', [foundingNote({ ...base, now: FOUNDING_ENDS }), foundingNote({ ...base, now: FOUNDING_ENDS + 1 }), foundingNote({ ...base, now: sgt('2027-01-02T09:00:00') })], ['last-days', null, null])
  eq('founding note: trial boards too, and boards whose trial ended', [foundingNote({ ...base, state: { kind: 'trial', daysLeft: 6 } }), foundingNote({ ...base, state: { kind: 'free', trialUsed: true }, now: last })], ['december', 'last-days'])
  eq('founding note: never for an early user, who keeps $2.99 whenever they buy', [foundingNote({ ...base, early: true }), foundingNote({ ...base, early: true, now: last }), foundingNote({ ...base, early: true, state: { kind: 'trial', daysLeft: 6 } })], [null, null, null])
  eq('founding note: never for a paid key, or a key that is paused', [
    foundingNote({ ...base, state: { kind: 'pro' } }),
    foundingNote({ ...base, state: { kind: 'pro' }, now: last }),
    ...(['ended', 'checking', 'offline'] as const).map((reason) => foundingNote({ ...base, state: { kind: 'paused', reason } })),
  ], [null, null, null, null, null])
  eq('founding note: never under the company pro lock', [foundingNote({ ...base, lockPro: true }), foundingNote({ ...base, lockPro: true, now: last }), foundingNote({ ...base, lockPro: false })], [null, null, 'december'])
  eq('founding note: not on the welcome screen, or while a checkout from this computer is pending', [foundingNote({ ...base, welcoming: true }), foundingNote({ ...base, checkoutPending: true })], [null, null])
  eq("founding note: a new install settles in first, as for the reverse-trial card: the third new tab and 20 hours", [
    foundingNote({ ...base, opens: REVERSE_CARD_OPENS - 1 }),
    foundingNote({ ...base, opens: REVERSE_CARD_OPENS }),
    foundingNote({ ...base, firstSeen: base.now - 19 * HOUR }),
    foundingNote({ ...base, firstSeen: base.now - REVERSE_CARD_WAIT_MS }),
  ], [null, 'december', null, 'december'])
  eq('founding note: the words', [FOUNDING_NOTE.title, FOUNDING_NOTE.line, FOUNDING_NOTE.button], [
    '$2.99 a year ends on 31 Dec',
    'After that Pro is $4.99 a year. If you join before then, it stays $2.99 while you keep Pro.',
    'See Pro',
  ])
  eq('founding note: the prices are the ones Settings shows either side of the deadline', [priceLabel(false, FOUNDING_ENDS), priceLabel(false, FOUNDING_ENDS + 1)], ['$2.99 a year', '$4.99 a year'])
  eq('founding note: it decides after "what stopped you?" and takes its turn in the corner', [
    FOUNDING_NOTE_DELAY_MS > WHY_NOT_DELAY_MS,
    claimable(null, 'founding'),
    claimable('whyNot', 'founding'),
    claimable('founding', 'moment'),
    claimable('founding', 'founding'),
  ], [true, true, false, false, true])

  // The copy rules: plain words, no dashes or dots between them.
  const words = [FOUNDING_NOTE.title, FOUNDING_NOTE.line, FOUNDING_NOTE.button, FREE_TIDY_NOTE.text, FREE_TIDY_NOTE.link, TIDY_LABEL.free, TIDY_ERRORS['free-cap']]
  // Em dash, en dash and middle dot, by code point.
  eq('0.9.5 copy: no em dashes or middle dots', words.filter((w) => [0x2014, 0x2013, 0xb7].some((c) => w.includes(String.fromCharCode(c)))), [])
}

// ---------- 0.9.6: the tidy coach mark after an import, and the rating ask after a tidy ----------
import { TIDY_COACH, TIDY_COACH_DELAY_MS, TIDY_COACH_MIN_LINKS, coachAccess, coachBody, coachSpace, tidyCoach } from '../src/lib/tidyCoachPlan'
import { RATING_MILESTONE_DAYS, RATING_WIN_DELAY_MS, tidyRatingStep } from '../src/lib/onboarding'
{
  // Which space it points at: 15 to 600 links, the most of them, the first of equals.
  eq("tidy coach: the floor is 15 links and the cap is Tidy's own 600", [TIDY_COACH_MIN_LINKS, TIDY_MAX_LINKS], [15, 600])
  eq('tidy coach: a space of 15 to 600 links, both included', [
    coachSpace([{ id: 'a', links: 14 }]),
    coachSpace([{ id: 'a', links: 15 }]),
    coachSpace([{ id: 'a', links: 600 }]),
    coachSpace([{ id: 'a', links: 601 }]),
    coachSpace([]),
  ], [null, 'a', 'a', null, null])
  eq('tidy coach: of several new spaces, the one with the most links within the limits, the first of equals', [
    coachSpace([{ id: 'a', links: 20 }, { id: 'b', links: 300 }, { id: 'c', links: 900 }]),
    coachSpace([{ id: 'a', links: 40 }, { id: 'b', links: 40 }]),
    coachSpace([{ id: 'a', links: 3 }, { id: 'b', links: 650 }, { id: 'c', links: 16 }]),
    coachSpace([{ id: 'a', links: 12 }, { id: 'b', links: 14 }]),
  ], ['b', 'a', 'c', null])
  // The import counts a new space's links as Tidy does: links in folders inside a stack count, a to-do stack doesn't.
  const bm = (id: string) => ({ id, title: id, url: `https://${id}.example/`, parentStackId: 'K' })
  const imported: Space = {
    id: 'N',
    rawTitle: '⭐ Bookmarks bar',
    name: 'Bookmarks bar',
    emoji: '⭐',
    stacks: [
      { id: 'T', title: 'To do', parentSpaceId: 'N', bookmarks: [], todo: { id: 'todo-x', anchorId: 'm' } },
      { id: 'K', title: 'Reading', parentSpaceId: 'N', bookmarks: Array.from({ length: 10 }, (_, i) => bm(`r${i}`)), folders: [{ id: 'F', title: 'Deep', parentId: 'K', bookmarks: Array.from({ length: 5 }, (_, i) => bm(`d${i}`)), folders: [] }] },
    ],
  }
  eq('tidy coach: links in a folder inside a stack count towards the 15, as Tidy sends them', [tidyInput(imported).links.length, coachSpace([{ id: imported.id, links: tidyInput(imported).links.length }])], [15, 'N'])

  // Who sees it.
  const base = { spaces: [{ id: 'x', links: 20 }], access: 'free' as const, shown: false, lockAi: false, lockPro: false }
  eq('tidy coach: for the free tidy while it is unused, and for a paid key', [tidyCoach(base), tidyCoach({ ...base, access: 'paid' })], ['x', 'x'])
  eq("tidy coach: not for someone who can't press Tidy; not known yet still names the space, and the mark waits for it", [tidyCoach({ ...base, access: null }), tidyCoach({ ...base, access: undefined })], [null, 'x'])
  eq('tidy coach: once per Chrome profile', [tidyCoach({ ...base, shown: true }), tidyCoach({ ...base, access: 'paid', shown: true })], [null, null])
  eq('tidy coach: never under the company ai or pro lock, a paid key included', [
    tidyCoach({ ...base, lockAi: true }),
    tidyCoach({ ...base, access: 'paid', lockAi: true }),
    tidyCoach({ ...base, lockPro: true }),
    tidyCoach({ ...base, access: 'paid', lockPro: true }),
  ], [null, null, null, null])
  eq('tidy coach: an import under 15 links, or over 600, shows nothing', [tidyCoach({ ...base, spaces: [{ id: 'x', links: 14 }] }), tidyCoach({ ...base, spaces: [{ id: 'x', links: 601 }] })], [null, null])

  // Who can press Tidy, as the import knows it.
  const know = (p: Partial<Parameters<typeof coachAccess>[0]>) =>
    coachAccess({ proReady: true, state: { kind: 'free', trialUsed: false }, activated: false, freeUsed: false, lockAi: false, lockPro: false, ...p })
  eq('tidy coach: once it is known, the same answer as the Tidy button (tidyAccess)', [
    know({}),
    know({ state: { kind: 'trial', daysLeft: 12 } }),
    know({ freeUsed: true }),
    know({ state: { kind: 'pro' }, activated: true, freeUsed: true }),
    know({ state: { kind: 'pro' }, activated: false }),
    know({ state: { kind: 'paused', reason: 'ended' }, activated: true }),
  ], ['free', 'free', null, 'paid', null, 'free'])
  eq('tidy coach: not known yet while Pro loads, a key has its first check, or the free tidy is unread (the welcome screen)', [
    know({ proReady: false }),
    know({ state: { kind: 'paused', reason: 'checking' } }),
    know({ freeUsed: null }),
    know({ state: { kind: 'trial', daysLeft: 14 }, freeUsed: null }),
  ], [undefined, undefined, undefined, undefined])
  eq('tidy coach: a paid key, or a lock, needs no free tidy read', [
    know({ state: { kind: 'pro' }, activated: true, freeUsed: null }),
    know({ freeUsed: null, lockAi: true }),
    know({ freeUsed: null, lockPro: true }),
    know({ proReady: false, lockAi: true }),
  ], ['paid', null, null, null])

  // What it says, and when.
  eq('tidy coach: the words', [TIDY_COACH.title, coachBody('free'), coachBody('paid'), TIDY_COACH.sort, TIDY_COACH.later], [
    'Want these sorted?',
    'Tidy reads the titles and links in this space and sorts them into stacks. You can undo it. Your first one is free.',
    'Tidy reads the titles and links in this space and sorts them into stacks. You can undo it.',
    'Sort them for me',
    'Not now',
  ])
  eq("tidy coach: it shows after the import's toast lands, and after any rating ask the import brings", [TIDY_COACH_DELAY_MS, TIDY_COACH_DELAY_MS > RATING_WIN_DELAY_MS], [2000, true])
  eq('corner: the coach mark takes its turn like the cards', [
    claimable(null, 'tidyCoach'),
    claimable('whatsNew', 'tidyCoach'),
    claimable('founding', 'tidyCoach'),
    claimable('tidyCoach', 'moment'),
    claimable('tidyCoach', 'tidyCoach'),
  ], [true, false, false, false, true])

  // The rating ask after a tidy that worked.
  const DAY = 86_400_000
  const HOUR = 3_600_000
  const now = 1_800_000_000_000
  const r = { opens: 2, firstSeen: now - 2 * DAY, now, answered: false, links: 30 }
  eq('tidy rating: an applied tidy asks once the install is a day old, at any tab count', [RATING_MILESTONE_DAYS, tidyRatingStep(r), tidyRatingStep({ ...r, opens: 1, firstSeen: now - DAY })], [1, 'ask', 'ask'])
  const early = { ...r, firstSeen: now - 3 * HOUR }
  eq('tidy rating: before day one it is kept, then asks on the first new tab after the one-day mark', [
    tidyRatingStep(early),
    tidyRatingStep({ ...early, now: early.firstSeen + DAY - 1 }),
    tidyRatingStep({ ...early, now: early.firstSeen + DAY }),
  ], ['later', 'later', 'ask'])
  eq('tidy rating: asked once per device, and never if already answered', [tidyRatingStep({ ...r, answered: true }), tidyRatingStep({ ...early, answered: true })], ['drop', 'drop'])
  eq('tidy rating: never under the company rating lock, kept or not', [tidyRatingStep({ ...r, lockRating: true }), tidyRatingStep({ ...early, lockRating: true }), tidyRatingStep({ ...r, lockRating: false })], ['drop', 'drop', 'ask'])
  eq('tidy rating: it needs links on the board, like the other milestones', tidyRatingStep({ ...r, links: 0 }), 'later')
  eq('tidy rating: the same rule as a milestone, which the other triggers keep', [
    shouldAskForRating({ ...r, trigger: 'milestone' }),
    shouldAskForRating({ ...r, trigger: 'win' }),
    shouldAskForRating({ ...r, trigger: 'load' }),
  ], [true, false, false])

  // A late policy (0.9.6): a paint that can't wait uses the lock set kept from the last answer, as
  // { lock } in place of the policy. It reads back as the same locks, and on its own it applies.
  const kept = { ...NO_LOCKS, ai: true, rating: true, importExport: true }
  const back = parseManagedConfig({ lock: parseLocks(JSON.parse(JSON.stringify(kept))) })
  eq('late policy: the kept lock set reads back as the same locks, and a policy of locks alone applies', [back.lock, isEmptyConfig(back), anyLock(back.lock), anyLock(NO_LOCKS)], [kept, false, true, false])

  // The copy rules: plain words, no dashes or dots between them, and no "X, not Y".
  const words = [TIDY_COACH.title, coachBody('free'), coachBody('paid'), TIDY_COACH.sort, TIDY_COACH.later]
  // Em dash, en dash and middle dot, by code point.
  eq('0.9.6 copy: no em dashes or middle dots', words.filter((w) => [0x2014, 0x2013, 0xb7].some((c) => w.includes(String.fromCharCode(c)))), [])
  eq('0.9.6 copy: no "X, not Y" contrasts', words.filter((w) => /, not |\bnot just\b|\bnot only\b|\brather than\b/i.test(w)), [])
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
process.exit(fails ? 1 : 0)
