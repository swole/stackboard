import { displayTitle, splitTitle } from '../src/lib/title'
import { urlKey, buildIndex, findOpenTab } from '../src/lib/openTabs'
import { parseBookmarkTitle } from '../src/lib/icon'
import { monogram } from '../src/lib/favicon'
import { planFolder, isImportableUrl, countPlanned, type FolderNode } from '../src/lib/importPlan'
import { installedAt, shouldAskForRating } from '../src/lib/onboarding'
import { STARTER_PACKS } from '../src/lib/starterPacks'
import { batchFlags } from '../src/lib/fresh'
import { planStash, staysNote } from '../src/lib/stashPlan'
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
import { glyphOf } from '../src/lib/favicon'
import palettesCss from '../src/styles/palettes.css'
import { contrastRatio, gradientStops, mix, over, readPalettes } from './contrast'

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
eq('plan: stacks follow the tree', plan.space.stacks.map((s) => s.title), ['On the bar', 'Work', 'Work › Clients', 'Only folders › Deep'])
eq('plan: counts links', [plan.links, countPlanned(plan.space)], [4, 4])
eq('plan: skips bookmarklets and chrome pages', plan.skipped, 2)
eq('plan: blank title falls back to the url', plan.space.stacks[2].links[0].title, 'https://acme.example.com/')
eq('plan: never copies Stackboard into itself', plan.space.stacks.some((s) => s.links.some((l) => l.url.includes('ours'))), false)
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

// Appearance settings: whatever storage holds comes back complete and in range.
eq('appearance: nothing stored gives the defaults', parseAppearance(undefined), DEFAULT_APPEARANCE)
eq('appearance: junk gives the defaults', parseAppearance('dark please'), DEFAULT_APPEARANCE)
eq(
  'appearance: unknown palette, mode, density and kind fall back',
  parseAppearance({ palette: 'dracula', mode: 'dim', density: 'cosy', bg: { kind: 'video' } }),
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
const picked = { mode: 'dark', palette: 'nord', density: 'compact', bg: { kind: 'image', gradient: 2, dim: 50, blur: 8, imageRev: 1791200000000 } }
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

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
process.exit(fails ? 1 : 0)
