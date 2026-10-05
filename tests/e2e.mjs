// End-to-end check of the built Stackboard extension in Chrome for Testing.
// Loads dist/ unpacked into a throwaway profile, seeds bookmarks through chrome.bookmarks,
// and drives the new-tab page with real mouse and keyboard input. 79 checks, ~2 min.
//
// Setup (branded Chrome ignores --load-extension, so use Chrome for Testing):
//   npm i puppeteer-core@24 @puppeteer/browsers@2
//   npx @puppeteer/browsers install chrome@stable --path ./browsers
// Run: STACKABLE_TEST_CHROME=<.../chrome-win64/chrome.exe> STACKABLE_DIST=<.../dist> node e2e.mjs
// (copy this file next to that node_modules so the puppeteer-core import resolves)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CHROME = process.env.STACKABLE_TEST_CHROME
if (!CHROME) throw new Error('Set STACKABLE_TEST_CHROME to a Chrome for Testing chrome.exe')
let EXT = process.env.STACKABLE_DIST ?? path.resolve(ROOT, '../dist')
// --load-extension takes a comma-separated list, so a path with a comma in it splits in
// two and nothing loads. Stage dist in a comma-free temp folder.
if (EXT.includes(',')) {
  const staged = path.join(os.tmpdir(), 'stackable-e2e-dist')
  fs.rmSync(staged, { recursive: true, force: true })
  fs.cpSync(EXT, staged, { recursive: true })
  EXT = staged
}
const PROFILE = path.join(os.tmpdir(), 'stackable-e2e-profile')
const SHOTS = path.join(os.tmpdir(), 'stackable-e2e-shots')
fs.rmSync(PROFILE, { recursive: true, force: true })
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
const errors = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 30000,
  userDataDir: PROFILE,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1400,900',
  ],
  defaultViewport: { width: 1400, height: 900 },
})

try {
  // ---------- extension id ----------
  const probe = await browser.newPage()
  await probe.goto('chrome://extensions')
  await sleep(800)
  const extId = await probe.evaluate(() => {
    const list = document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-item-list')
    return list?.shadowRoot?.querySelector('extensions-item')?.id ?? null
  })
  check('extension loaded', !!extId, extId ?? 'no id')
  if (!extId) throw new Error('extension did not load')
  const NTP = `chrome-extension://${extId}/newtab.html`
  // 0.4.0: the service worker opens a new tab on install, so people land on Stackboard.
  const installTab = browser
    .targets()
    .some((t) => t.type() === 'page' && (t.url() === NTP || t.url().startsWith('chrome://newtab')))
  check('install opens a new tab', installTab)

  // ---------- control page (runs chrome.* calls; is itself a Stackable page) ----------
  const control = probe
  control.on('pageerror', (e) => errors.push(`control: ${e.message}`))
  await control.goto(NTP)
  await control.waitForFunction(() => document.body.innerText.includes('Welcome to Stackboard'), { timeout: 10000 })

  await control.evaluate(async () => {
    const kids = await chrome.bookmarks.getChildren('2')
    const root = kids.find((k) => k.title === 'Stackboard' && !k.url)
    const mk = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, url })
    const work = await mk(root.id, '🧪 Test')
    const japan = await mk(work.id, 'Japan')
    await mk(japan.id, 'Crown Jewel', 'http://crown-jewel.invalid/')
    await mk(japan.id, 'GitHub', 'https://github.com/')
    await mk(japan.id, 'Figma File – Figma', 'https://www.figma.com/design/abc/File?node-id=0-1')
    await mk(japan.id, 'Example Domain', 'https://example.com/')
    const big = await mk(work.id, 'Big')
    for (let i = 0; i < 18; i++) await mk(big.id, `Link ${i}`, `https://example.org/${i}`)
    const home = await mk(root.id, '🏠 Personal')
    const h = await mk(home.id, 'Home')
    await mk(h.id, 'Wikipedia', 'https://en.wikipedia.org/')
  })

  // A real tab on github.com: caches its favicon and should light the "open" dot.
  const gh = await browser.newPage()
  await gh.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  const cached = await control.evaluate(async () => {
    const fp = (src) => new Promise((res) => {
      const img = new Image()
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16); res(Array.from(x.getImageData(0, 0, 16, 16).data).join(',')) }
      img.onerror = () => res(null)
      img.src = src + '&t=' + Date.now()
    })
    const u = (p) => chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(p) + '&size=32'
    const globe = await fp(u('https://stackable-no-favicon.invalid/'))
    for (let i = 0; i < 40; i++) {
      if ((await fp(u('https://github.com/'))) !== globe) return true
      await new Promise((r) => setTimeout(r, 500))
    }
    return false
  })
  console.log('github favicon cached in profile:', cached)

  // Fresh new-tab page (history.length === 1), opened the way Chrome opens one.
  const openNtp = async (ready = () => !!document.querySelector('main h1')) => {
    // Must be a NEW target: the control page sits on the same URL.
    const known = new Set(browser.targets())
    const waiter = browser.waitForTarget(
      (t) => !known.has(t) && t.type() === 'page' && (t.url() === NTP || t.url().startsWith('chrome://newtab')),
      { timeout: 10000 },
    )
    await control.evaluate(() => chrome.tabs.create({ active: true })) // a real new tab, overridden by Stackable
    const target = await waiter
    const p = await target.page()
    await p.setViewport({ width: 1400, height: 900 })
    p.on('pageerror', (e) => errors.push(`ntp: ${e.message}`))
    p.on('console', (m) => m.type() === 'error' && errors.push(`ntp console: ${m.text()}`))
    await p.waitForFunction(ready, { timeout: 10000 })
    await sleep(600)
    return p
  }

  let ntp = await openNtp()
  await ntp.bringToFront()
  // First run lands on the first space.
  const diag = await ntp.evaluate(async () => {
    const fp = (src) => new Promise((res) => {
      const img = new Image()
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16); res(Array.from(x.getImageData(0, 0, 16, 16).data).join(',').length + ':' + Array.from(x.getImageData(0, 0, 16, 16).data).slice(0, 40).join(',')) }
      img.onerror = () => res('error')
      img.src = src
    })
    const u = (p) => { const x = new URL(chrome.runtime.getURL('/_favicon/')); x.searchParams.set('pageUrl', p); x.searchParams.set('size', '32'); return x.toString() }
    const globe = await fp(u('https://stackable-no-favicon.invalid/'))
    const ghPlain = await fp(u('https://github.com/'))
    const ghBust = await fp(u('https://github.com/') + '&bust=' + Date.now())
    return { plainIsGlobe: ghPlain === globe, bustIsGlobe: ghBust === globe, globe: globe.slice(0, 60), ghPlain: ghPlain.slice(0, 60) }
  })
  console.log('favicon diag:', JSON.stringify(diag))
  const heading = await ntp.$eval('main h1', (h) => h.textContent)
  check('first space shown', heading === 'Test', heading)
  await sleep(800)
  await ntp.screenshot({ path: path.join(SHOTS, '01-initial.png') })

  // ---------- cards: favicon vs monogram, suffix strip, open dot ----------
  const cards = await ntp.evaluate(() =>
    [...document.querySelectorAll('a[href^="http"]')].slice(0, 4).map((a) => ({
      text: a.querySelector('span.min-w-0')?.textContent ?? '',
      raw: a.title.split(String.fromCharCode(10))[0],
      accent: [...a.parentElement.children].some((el) => String(el.className).includes('w-[3px]')),
      img: !!a.querySelector('img') && a.querySelector('img').style.visibility !== 'hidden',
      tile: a.querySelector('span[style]')?.textContent ?? null,
      dot: !!a.querySelector('span.rounded-full'),
    })),
  )
  console.log(JSON.stringify(cards))
  const byText = (t) => cards.find((c) => c.raw.startsWith(t))
  check('no-favicon site gets a monogram', byText('Crown')?.tile === 'C')
  check('github keeps its real favicon', byText('GitHub')?.img === true && !byText('GitHub')?.tile)
  check('open github tab lights the dot', byText('GitHub')?.dot === true)
  check('figma suffix dropped', cards.some((c) => c.text === 'Figma File'))
  check('closed site has no dot', byText('Crown')?.dot === false)
  // The seed wrote these in one burst, like an import: no "new" accent. A lone save gets one.
  check('a burst of saves stays quiet', cards.every((c) => !c.accent), JSON.stringify(cards.map((c) => c.accent)))
  await control.evaluate(async () => {
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    const test = (await chrome.bookmarks.getChildren(root.id)).find((c) => c.title === '🧪 Test')
    const later = await chrome.bookmarks.create({ parentId: test.id, title: 'Later' })
    await chrome.bookmarks.create({ parentId: later.id, title: 'Solo save', url: 'https://solo.example.com/' })
  })
  await sleep(700)
  const soloAccent = await ntp.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="http"]')].find((x) => x.textContent.includes('Solo save'))
    return a ? [...a.parentElement.children].some((el) => String(el.className).includes('w-[3px]')) : null
  })
  check('a single save carries the new accent', soloAccent === true, String(soloAccent))

  // ---------- Ctrl+click: background tab, page stays ----------
  const before = (await browser.pages()).length
  const example = await ntp.evaluateHandle(() =>
    [...document.querySelectorAll('a[href^="http"]')].find((a) => a.textContent.includes('Example Domain')),
  )
  await ntp.keyboard.down('Control')
  await example.click()
  await ntp.keyboard.up('Control')
  await sleep(1500)
  const after = (await browser.pages()).length
  check('ctrl+click opens a new tab', after === before + 1, `${before} -> ${after}`)
  check('ctrl+click leaves stackable in place', ntp.url() === NTP)

  // ---------- drag a card with the real mouse ----------
  const box = async (text) =>
    ntp.evaluate((t) => {
      const a = [...document.querySelectorAll('a[href^="http"]')].find((x) => x.textContent.includes(t))
      const r = a.parentElement.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }
    }, text)
  const from = await box('Crown Jewel')
  const to = await box('Example Domain')
  await ntp.mouse.move(from.x, from.y)
  await ntp.mouse.down()
  for (let i = 1; i <= 12; i++) await ntp.mouse.move(from.x, from.y + ((to.y - from.y + 8) * i) / 12)
  await sleep(250)
  const mid = await ntp.evaluate(() => {
    const g = document.querySelector('[data-lifted]')
    return {
      ghost: !!g,
      transform: g ? getComputedStyle(g).transform : null,
      slot: !!document.querySelector('[data-drop-slot].border-dashed'),
    }
  })
  await ntp.screenshot({ path: path.join(SHOTS, '02-mid-drag.png') })
  await ntp.mouse.up()
  await sleep(700)
  check('drag shows a lifted, tilted ghost', mid.ghost && mid.transform !== 'none' && mid.transform !== 'matrix(1, 0, 0, 1, 0, 0)', mid.transform)
  check('drag leaves a dashed slot', mid.slot)
  const order = await control.evaluate(async () => {
    const [n] = (await chrome.bookmarks.search({ title: 'Japan' })).filter((x) => !x.url)
    return (await chrome.bookmarks.getChildren(n.id)).map((c) => c.title)
  })
  check('drop reorders the stack', order[order.length - 1] === 'Crown Jewel', order.join(' | '))
  check('drop does not navigate', ntp.url() === NTP)
  check('ghost cleared after drop', await ntp.evaluate(() => !document.querySelector('[data-lifted]')))
  await ntp.screenshot({ path: path.join(SHOTS, '03-after-drop.png') })

  // ---------- delete a bookmark, then Undo ----------
  const menuDelete = async (text) => {
    await ntp.evaluate((t) => {
      const a = [...document.querySelectorAll('a[href^="http"]')].find((x) => x.textContent.includes(t))
      a.parentElement.querySelector('button[aria-label="Bookmark options"]').click()
    }, text)
    await sleep(150)
    await ntp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click())
  }
  await menuDelete('Crown Jewel')
  await sleep(600)
  const toast1 = await ntp.evaluate(() => document.querySelector('.toast')?.textContent ?? null)
  check('delete shows the undo toast', !!toast1 && toast1.includes('Deleted') && toast1.includes('Crown Jewel'), toast1)
  const delCount = await control.evaluate(async () => (await chrome.bookmarks.search({ title: 'Crown Jewel' })).length)
  check('bookmark actually deleted', delCount === 0, `${delCount} left`)
  await ntp.screenshot({ path: path.join(SHOTS, '04-toast.png') })
  await ntp.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
  await sleep(900)
  const restored = await control.evaluate(async () => {
    const [n] = (await chrome.bookmarks.search({ title: 'Japan' })).filter((x) => !x.url)
    return (await chrome.bookmarks.getChildren(n.id)).map((c) => c.title)
  })
  check('undo restores the bookmark in place', restored.join('|') === order.join('|'), restored.join(' | '))
  const toast2 = await ntp.evaluate(() => document.querySelector('.toast')?.textContent ?? null)
  check('toast confirms the restore', !!toast2 && toast2.startsWith('Restored'), toast2)

  // ---------- delete a whole stack, then Ctrl+Z ----------
  await ntp.evaluate(() => {
    const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Japan')
    col.querySelector('button[aria-label="Stack options"]').click()
  })
  await sleep(150)
  await ntp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click())
  await sleep(700)
  const toast3 = await ntp.evaluate(() => document.querySelector('.toast')?.textContent ?? null)
  check('stack delete toast counts links', !!toast3 && toast3.includes('Japan') && toast3.includes('4 links'), toast3)
  const gone = await control.evaluate(async () => (await chrome.bookmarks.search({ title: 'Japan' })).filter((x) => !x.url).length)
  check('stack actually deleted', gone === 0)
  await ntp.mouse.click(120, 860) // focus the page, away from any input (the empty end of the sidebar)
  await ntp.keyboard.down('Control')
  await ntp.keyboard.press('KeyZ')
  await ntp.keyboard.up('Control')
  await sleep(1200)
  const back = await control.evaluate(async () => {
    const [n] = (await chrome.bookmarks.search({ title: 'Japan' })).filter((x) => !x.url)
    if (!n) return null
    const siblings = await chrome.bookmarks.getChildren(n.parentId)
    return { index: siblings.findIndex((s) => s.id === n.id), kids: (await chrome.bookmarks.getChildren(n.id)).map((c) => c.title) }
  })
  check('ctrl+z restores the stack at its old position', back?.index === 0, JSON.stringify(back))
  check('restored stack keeps its links in order', back?.kids.join('|') === order.join('|'))
  await ntp.screenshot({ path: path.join(SHOTS, '05-stack-restored.png') })

  // ---------- two-step confirm on the 18-link stack ----------
  const armed = await ntp.evaluate(async () => {
    const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Big')
    const b = col.querySelector('button[aria-label^="Open all"]')
    b.click()
    await new Promise((r) => setTimeout(r, 100))
    return b.textContent
  })
  check('big stack asks before opening 18 tabs', armed === 'Open 18?', armed)
  await ntp.screenshot({ path: path.join(SHOTS, '06-armed.png') })
  await sleep(3300)
  const disarmed = await ntp.evaluate(() => {
    const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Big')
    return col.querySelector('button[aria-label^="Open all"]').textContent
  })
  check('confirm disarms after 3s', disarmed === '', JSON.stringify(disarmed))

  // ---------- search ----------
  await ntp.mouse.click(120, 860)
  await ntp.keyboard.press('/')
  await ntp.keyboard.type('wiki')
  await sleep(300)
  const search = await ntp.evaluate(() => ({
    h1: document.querySelector('main h1')?.textContent,
    hits: [...document.querySelectorAll('main section a')].map((a) => a.querySelector('span.min-w-0')?.textContent),
  }))
  check('search finds links in other spaces', search.hits.includes('Wikipedia'), JSON.stringify(search))
  await ntp.screenshot({ path: path.join(SHOTS, '07-search.png') })
  await ntp.keyboard.press('Escape')
  await sleep(200)

  // ---------- space delete via modal, then Undo; remembered space ----------
  await ntp.evaluate(() => {
    const row = [...document.querySelectorAll('aside .group')].find((r) => r.textContent.includes('Personal'))
    row.querySelector('button[aria-label="Space options"]').click()
  })
  await sleep(150)
  await ntp.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === 'Delete').click())
  await sleep(200)
  await ntp.evaluate(() => [...document.querySelectorAll('.fixed button')].find((b) => b.textContent.trim() === 'Delete').click())
  await sleep(700)
  const toast4 = await ntp.evaluate(() => document.querySelector('.toast')?.textContent ?? null)
  check('space delete toast', !!toast4 && toast4.includes('Personal') && toast4.includes('1 stack, 1 link'), toast4)
  await ntp.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
  await sleep(1200)
  const h1 = await ntp.$eval('main h1', (h) => h.textContent)
  check('undo restores the space and shows it', h1 === 'Personal', h1)
  await ntp.screenshot({ path: path.join(SHOTS, '08-space-restored.png') })

  // New tab remembers the last space.
  const ntp2 = await openNtp()
  const h1b = await ntp2.$eval('main h1', (h) => h.textContent)
  check('a new tab opens on the last space', h1b === 'Personal', h1b)
  // Back to Test for the switch-to-tab check.
  await ntp2.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim().endsWith('Test')).click())
  await sleep(500)

  // ---------- plain click on an open site switches to it and closes the new tab ----------
  const ghTargetId = gh.target()._targetId
  const ntp2Target = ntp2.target()
  const hist = await ntp2.evaluate(() => history.length)
  const ghPoint = await ntp2.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="http"]')].find((x) => x.title.startsWith('GitHub'))
    const r = a.getBoundingClientRect()
    return { x: r.x + 40, y: r.y + r.height / 2 }
  })
  console.log('clicking github card at', JSON.stringify(ghPoint), 'history.length', hist)
  await ntp2.mouse.click(ghPoint.x, ghPoint.y).catch((e) => console.log('click note:', e.message))
  await sleep(1500)
  const pages = await browser.pages()
  const ntp2Closed = !pages.some((p) => p.target() === ntp2Target)
  const active = await control.evaluate(async () => (await chrome.tabs.query({ active: true })).map((t) => t.url))
  check('switch-to-tab focuses the github tab', active.some((u) => u.startsWith('https://github.com')), active.join(', '))
  check('the fresh new tab closes itself', ntp2Closed, `history.length was ${hist}`)
  void ghTargetId

  // ---------- toast dismisses itself ----------
  await ntp.bringToFront()
  await sleep(300)
  await menuDelete('Wikipedia')
  await sleep(900)
  const up = await ntp.evaluate(() => !!document.querySelector('.toast'))
  await sleep(7600)
  const down = await ntp.evaluate(() => !document.querySelector('.toast'))
  check('undo toast dismisses itself after ~7s', up && down, `up=${up} down=${down}`)

  // ---------- 0.3.0 rename: a pre-rename "Stackable" folder carries over ----------
  const legacyId = await control.evaluate(async () => {
    for (const k of await chrome.bookmarks.getChildren('2')) {
      if (!k.url && (k.title === 'Stackboard' || k.title === 'Stackable')) await chrome.bookmarks.removeTree(k.id)
    }
    const legacy = await chrome.bookmarks.create({ parentId: '2', title: 'Stackable' })
    const sp = await chrome.bookmarks.create({ parentId: legacy.id, title: '🧳 Legacy' })
    const st = await chrome.bookmarks.create({ parentId: sp.id, title: 'Old stack' })
    await chrome.bookmarks.create({ parentId: st.id, title: 'Example Domain', url: 'https://example.com/' })
    await chrome.storage.local.remove('stackableRootId')
    return legacy.id
  })
  const ntp3 = await openNtp()
  await sleep(800)
  const mig = await control.evaluate(async (id) => {
    const [n] = await chrome.bookmarks.get(id)
    return { title: n.title, cached: (await chrome.storage.local.get('stackableRootId')).stackableRootId === id }
  }, legacyId)
  check('legacy Stackable folder shows up', (await ntp3.$eval('main h1', (h) => h.textContent)) === 'Legacy')
  check('legacy folder renamed to Stackboard in place', mig.title === 'Stackboard' && mig.cached, JSON.stringify(mig))

  // A device on an old version can recreate an empty "Stackable" and cache it: the fuller root must win.
  await control.evaluate(async () => {
    const dup = await chrome.bookmarks.create({ parentId: '2', title: 'Stackable' })
    await chrome.storage.local.set({ stackableRootId: dup.id })
  })
  const ntp4 = await openNtp()
  await sleep(800)
  const h1dup = await ntp4.$eval('main h1', (h) => h.textContent).catch(() => '(none)')
  const cachedNow = await control.evaluate(async () => (await chrome.storage.local.get('stackableRootId')).stackableRootId)
  check('an empty duplicate root never hides the real one', h1dup === 'Legacy' && cachedNow === legacyId, `${h1dup} ${cachedNow === legacyId}`)

  // ---------- 0.4.0: welcome screen, copy from Chrome bookmarks ----------
  await control.evaluate(async () => {
    for (const k of await chrome.bookmarks.getChildren('2')) {
      if (!k.url && (k.title === 'Stackboard' || k.title === 'Stackable')) await chrome.bookmarks.removeTree(k.id)
    }
    await chrome.storage.local.remove('stackableRootId')
    const mk = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, url })
    await mk('1', 'Example Domain', 'https://example.com/')
    await mk('1', 'Bookmarklet', 'javascript:void(0)')
    const reading = await mk('1', 'Reading')
    await mk(reading.id, 'Wikipedia', 'https://en.wikipedia.org/')
    const deep = await mk(reading.id, 'Deep')
    await mk(deep.id, 'MDN', 'https://developer.mozilla.org/')
  })
  const ntp5 = await openNtp(() => !!document.querySelector('[data-welcome="import"] label'))
  await ntp5.screenshot({ path: path.join(SHOTS, '20-welcome.png') })
  const welcome = await ntp5.evaluate(() => ({
    title: document.querySelector('main h2')?.textContent,
    rows: [...document.querySelectorAll('[data-welcome="import"] label')].map((l) => l.textContent),
    note: document.querySelector('[data-welcome="import"] p.mt-3')?.textContent ?? '',
    packs: document.querySelectorAll('[data-welcome="packs"] button').length,
  }))
  check('welcome shows on an empty board', welcome.title === 'Welcome to Stackboard', welcome.title)
  check('welcome offers the bookmarks bar with counts', welcome.rows.some((r) => r.includes('Bookmarks bar') && r.includes('3 links') && r.includes('3 stacks')), JSON.stringify(welcome.rows))
  check('welcome says what stays behind', welcome.note.includes('1 bookmarklet or browser page stays behind'), welcome.note)
  check('welcome lists five starter packs', welcome.packs === 5, String(welcome.packs))

  await ntp5.evaluate(() =>
    [...document.querySelectorAll('[data-welcome="import"] button')].find((b) => b.textContent.startsWith('Copy 3 links')).click(),
  )
  await ntp5.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Bookmarks bar', { timeout: 15000 })
  await sleep(500)
  await ntp5.screenshot({ path: path.join(SHOTS, '21-imported.png') })
  const copied = await control.evaluate(async () => {
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    const [sub] = await chrome.bookmarks.getSubTree(root.id)
    const space = sub.children[0]
    return {
      space: space.title,
      stacks: space.children.map((st) => `${st.title}:${st.children.length}`),
      bar: (await chrome.bookmarks.getChildren('1')).length,
    }
  })
  check('copy makes a space from the bookmarks bar', copied.space === '⭐ Bookmarks bar', copied.space)
  check('each folder becomes a stack with its links', copied.stacks.join('|') === 'On the bar:1|Reading:1|Reading › Deep:1', copied.stacks.join('|'))
  check('originals stay in the bookmarks bar', copied.bar === 3, String(copied.bar))
  const toast5 = await ntp5.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
  check('copy toast offers undo', toast5.includes('Copied') && toast5.includes('Undo'), toast5)

  // ---------- 0.4.0: starter pack from Settings ----------
  const clickText = (page, sel, text) =>
    page.evaluate((sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().startsWith(text))
      if (!el) return false
      el.click()
      return true
    }, sel, text)
  await clickText(ntp5, 'aside button', 'Settings')
  await sleep(300)
  await clickText(ntp5, 'button', 'Starter packs')
  await sleep(300)
  const addDev = await ntp5.evaluate(() => {
    const row = [...document.querySelectorAll('li')].find((li) => li.textContent.includes('Developer'))
    const btn = row && [...row.querySelectorAll('button')].find((b) => b.textContent.includes('Add'))
    btn?.click()
    return !!btn
  })
  await ntp5.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Developer', { timeout: 10000 }).catch(() => {})
  const dev = await control.evaluate(async () => {
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    const [sub] = await chrome.bookmarks.getSubTree(root.id)
    const space = sub.children.find((c) => c.title === '💻 Developer')
    return space ? space.children.map((st) => `${st.title}:${st.children.length}`).join('|') : null
  })
  check('starter pack adds a ready-made space', addDev && dev === 'Code:5|Tools:5|Learn:4', String(dev))
  await ntp5.keyboard.press('Escape')

  // ---------- 0.4.0: "Keep it" hint on a fresh install ----------
  await control.evaluate(async () => {
    await chrome.storage.local.set({ stackboardFresh: Date.now() })
    localStorage.removeItem('stackable:keepHintShown')
  })
  const ntp8 = await openNtp()
  await ntp8.waitForSelector('[data-keep-hint]', { timeout: 5000 }).catch(() => {})
  const hint = await ntp8.evaluate(() => document.querySelector('[data-keep-hint]')?.textContent ?? '')
  check('fresh install explains the Keep it prompt', hint.includes('Keep it'), hint)
  await ntp8.evaluate(() => document.querySelector('[data-keep-hint] button')?.click())
  await sleep(300)
  const hintGone = await control.evaluate(async () => !(await chrome.storage.local.get('stackboardFresh')).stackboardFresh)
  check('dismissing the hint retires it', hintGone && (await ntp8.evaluate(() => !document.querySelector('[data-keep-hint]'))))

  // ---------- 0.4.0/0.4.1: one-time rating ask ----------
  await control.evaluate(() => {
    localStorage.setItem('stackable:opens', '24')
    localStorage.setItem('stackable:firstSeen', String(Date.now() - 4 * 86400000))
    localStorage.removeItem('stackable:rating')
  })
  const ntp6 = await openNtp()
  await ntp6.waitForSelector('[data-rating-prompt]', { timeout: 5000 }).catch(() => {})
  await ntp6.screenshot({ path: path.join(SHOTS, '22-rating.png') })
  check('rating ask appears on a new tab after 3 days and 25 tabs', await ntp6.evaluate(() => !!document.querySelector('[data-rating-prompt]')))
  await clickText(ntp6, '[data-rating-prompt] button', 'No thanks')
  await sleep(200)
  check('no thanks retires the ask', await ntp6.evaluate(() => !document.querySelector('[data-rating-prompt]') && localStorage.getItem('stackable:rating') === 'dismissed'))
  const ntp7 = await openNtp()
  await sleep(400)
  check('rating ask never repeats', await ntp7.evaluate(() => !document.querySelector('[data-rating-prompt]')))

  // ---------- 0.4.1: a happy moment asks sooner ----------
  await control.evaluate(() => {
    localStorage.setItem('stackable:opens', '15')
    localStorage.setItem('stackable:firstSeen', String(Date.now() - 4 * 86400000))
    localStorage.removeItem('stackable:rating')
  })
  const ntp9 = await openNtp()
  await sleep(800)
  check('a plain new tab waits at 16 tabs', await ntp9.evaluate(() => !document.querySelector('[data-rating-prompt]')))
  await clickText(ntp9, 'aside button', 'Settings')
  await sleep(300)
  await clickText(ntp9, 'button', 'Starter packs')
  await sleep(300)
  const addStudy = await ntp9.evaluate(() => {
    const row = [...document.querySelectorAll('li')].find((li) => li.textContent.includes('Study'))
    const btn = row && [...row.querySelectorAll('button')].find((b) => b.textContent.includes('Add'))
    btn?.click()
    return !!btn
  })
  await ntp9.keyboard.press('Escape')
  await ntp9.waitForSelector('[data-rating-prompt]', { timeout: 6000 }).catch(() => {})
  check('adding a starter pack brings the ask at 16 tabs', addStudy && (await ntp9.evaluate(() => !!document.querySelector('[data-rating-prompt]'))))
  await clickText(ntp9, '[data-rating-prompt] button', 'No thanks')
  await sleep(200)

  // ---------- 0.4.0: stash this window ----------
  const win = await control.evaluate(async (ntpUrl) => {
    const w = await chrome.windows.create({ url: ['https://example.com/', 'https://example.org/', 'https://en.wikipedia.org/wiki/Bookmark_(digital)'], focused: true })
    const tabs = await chrome.tabs.query({ windowId: w.id })
    const groupId = await chrome.tabs.group({ tabIds: [tabs[1].id, tabs[2].id], createProperties: { windowId: w.id } })
    await chrome.tabGroups.update(groupId, { title: 'Research' })
    await chrome.tabs.create({ windowId: w.id, url: 'https://example.net/', pinned: true })
    await chrome.tabs.create({ windowId: w.id, url: ntpUrl.replace('newtab.html', 'popup.html'), active: true })
    return w.id
  }, NTP)
  const popupTarget = await browser.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 })
  const popup = await popupTarget.page()
  await popup.waitForSelector('[data-stash] button', { timeout: 15000 })
  const offer = await popup.evaluate(() => document.querySelector('[data-stash]')?.textContent ?? '')
  check('popup offers to stash the window', offer.includes('Stash and close 3 tabs') && offer.includes('1 pinned tab and 1 browser page stay open'), offer)
  const knownBefore = new Set(browser.targets())
  await clickText(popup, '[data-stash] button', 'Stash and close')
  const stashTab = await browser
    .waitForTarget((t) => !knownBefore.has(t) && t.type() === 'page' && (t.url() === NTP || t.url().startsWith('chrome://newtab')), { timeout: 15000 })
    .then((t) => t.page())
    .catch(() => null)
  await sleep(2500)
  const stashed = await control.evaluate(async (windowId) => {
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    const [sub] = await chrome.bookmarks.getSubTree(root.id)
    const space = sub.children.find((c) => c.title === '📥 Stash')
    const left = (await chrome.tabs.query({ windowId })).map((t) => (t.pinned ? 'pinned' : new URL(t.pendingUrl || t.url).protocol))
    return {
      stacks: space ? space.children.map((st) => `${st.title.startsWith('Stashed ') ? 'Stashed' : st.title}:${st.children.length}`) : null,
      left: left.sort(),
    }
  }, win)
  check('stash saves one stack per tab group', stashed.stacks?.join('|') === 'Stashed:1|Research:2', JSON.stringify(stashed.stacks))
  check('stash closes the saved tabs only', stashed.left.join(',') === 'chrome-extension:,chrome-extension:,pinned' || stashed.left.join(',') === 'chrome-extension:,chrome:,pinned', stashed.left.join(','))
  const landed = stashTab ? await stashTab.evaluate(() => ({ h1: document.querySelector('main h1')?.textContent, toast: document.querySelector('.toast')?.textContent ?? '' })) : null
  check('stash opens a new tab on the Stash space', landed?.h1 === 'Stash' && landed.toast.includes('Stashed 3 tabs'), JSON.stringify(landed))

  // ---------- 0.5.0: appearance ----------
  const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
  }
  const look = (page) =>
    page.evaluate(() => {
      const card = document.querySelector('main a[href^="http"]')?.parentElement
      return {
        palette: document.documentElement.dataset.palette,
        scheme: document.documentElement.dataset.scheme,
        canvas: getComputedStyle(document.body).backgroundColor,
        heading: getComputedStyle(document.querySelector('main h1')).color,
        card: card ? getComputedStyle(card).backgroundColor : null,
        panel: getComputedStyle(document.querySelector('aside')).backgroundColor,
      }
    })
  const ntpA = await openNtp()
  await ntpA.bringToFront()
  await ntpA.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await sleep(300)
  const cream = await look(ntpA)
  check('default look is the cream Stackboard palette', cream.palette === 'stackboard' && cream.canvas === rgb('#fbf3e8') && cream.card === rgb('#ffffff'), JSON.stringify(cream))

  await clickText(ntpA, 'aside button', 'Settings')
  await ntpA.waitForSelector('[data-appearance]', { timeout: 5000 })
  const pick = async (sel) => {
    const found = await ntpA.evaluate((s) => {
      const el = document.querySelector(s)
      el?.click()
      return !!el
    }, sel)
    if (!found) console.log('missing control:', sel)
    await sleep(250)
  }
  await pick('[data-palette-option="catppuccin"]')
  const latte = await look(ntpA)
  check('Catppuccin on a light system is Latte', latte.scheme === 'light' && latte.canvas === rgb('#e6e9ef') && latte.card === rgb('#eff1f5') && latte.heading === rgb('#4c4f69'), JSON.stringify(latte))
  await pick('[aria-label="Mode"] [data-option="dark"]')
  const mocha = await look(ntpA)
  check('Dark turns it into Catppuccin Mocha', mocha.scheme === 'dark' && mocha.canvas === rgb('#1e1e2e') && mocha.card === rgb('#313244') && mocha.heading === rgb('#cdd6f4'), JSON.stringify(mocha))
  await pick('[data-palette-option="gruvbox"]')
  const gruvbox = await look(ntpA)
  check('Gruvbox Dark colours', gruvbox.canvas === rgb('#282828') && gruvbox.card === rgb('#3c3836') && gruvbox.panel === rgb('#1d2021') && gruvbox.heading === rgb('#fbf1c7'), JSON.stringify(gruvbox))
  await pick('[data-palette-option="nord"]')
  const nord = await look(ntpA)
  check('Nord colours', nord.canvas === rgb('#2e3440') && nord.card === rgb('#3b4252') && nord.heading === rgb('#eceff4'), JSON.stringify(nord))
  await pick('[aria-label="Mode"] [data-option="light"]')
  const nordLight = await look(ntpA)
  const modeNote = await ntpA.evaluate(() => document.querySelector('[data-mode-note]')?.textContent ?? '')
  check('Nord stays dark when Light is picked, and says why', nordLight.scheme === 'dark' && nordLight.canvas === rgb('#2e3440') && modeNote.includes('only comes in dark'), modeNote)
  const saved = await control.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance)
  check('appearance is saved in chrome.storage.local', saved?.palette === 'nord' && saved?.mode === 'light', JSON.stringify(saved))

  await pick('[data-palette-option="stackboard"]')
  await pick('[aria-label="Mode"] [data-option="system"]')
  const sysLight = await look(ntpA)
  await ntpA.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await sleep(400)
  const sysDark = await look(ntpA)
  check('System mode follows the OS into dark', sysLight.canvas === rgb('#fbf3e8') && sysDark.scheme === 'dark' && sysDark.canvas === rgb('#1b1714'), `${sysLight.canvas} -> ${sysDark.canvas}`)
  await ntpA.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await sleep(300)
  check('and back to light', (await look(ntpA)).canvas === rgb('#fbf3e8'))

  // theme-boot.js paints the first frame from the localStorage copy, before any module runs.
  await pick('[aria-label="Mode"] [data-option="dark"]')
  const booted = await ntpA.evaluate(
    () =>
      new Promise((resolve) => {
        const root = document.documentElement
        for (const a of ['data-palette', 'data-scheme', 'data-mode']) root.removeAttribute(a)
        const s = document.createElement('script')
        s.src = '/theme-boot.js'
        s.onload = () => resolve({ palette: root.dataset.palette, scheme: root.dataset.scheme, mode: root.dataset.mode })
        s.onerror = () => resolve(null)
        document.head.appendChild(s)
      }),
  )
  check('the boot script restores the saved theme before first paint', booted?.palette === 'stackboard' && booted?.scheme === 'dark' && booted?.mode === 'dark', JSON.stringify(booted))
  await pick('[aria-label="Mode"] [data-option="system"]')

  const cardHeight = () => ntpA.evaluate(() => document.querySelector('main a[href^="http"]').getBoundingClientRect().height)
  const roomy = await cardHeight()
  await pick('[aria-label="Density"] [data-option="compact"]')
  const tight = await cardHeight()
  check('compact density makes cards shorter', tight < roomy - 4, `${roomy} -> ${tight}`)
  await pick('[aria-label="Density"] [data-option="comfortable"]')

  await pick('[aria-label="Background"] [data-option="gradient"]')
  await pick('[data-gradient-option="2"]')
  const gradient = await ntpA.evaluate(() => ({ kind: document.documentElement.dataset.bg, n: document.documentElement.dataset.gradient, image: getComputedStyle(document.body).backgroundImage }))
  check('a gradient background paints the page', gradient.kind === 'gradient' && gradient.n === '2' && gradient.image.includes('radial-gradient'), `${gradient.kind} ${gradient.n} ${gradient.image.slice(0, 40)}`)

  // A picture, through the real file input.
  const picture = path.join(SHOTS, 'picture.png')
  await ntpA.screenshot({ path: picture, clip: { x: 0, y: 0, width: 320, height: 200 } })
  await (await ntpA.$('[data-bg-file]')).uploadFile(picture)
  // Polled from here: the control tab has been hidden for minutes by now, and Chrome's intensive
  // throttling holds its timers (and so waitForFunction) to about one tick a minute.
  let imageSaved = false
  for (let i = 0; i < 50 && !imageSaved; i++) {
    imageSaved = await control.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance?.bg?.kind === 'image')
    if (!imageSaved) await sleep(200)
  }
  check('picking an image makes it the background', imageSaved)
  await ntpA.keyboard.press('Escape')

  const ntpB = await openNtp()
  await ntpB.waitForSelector('[data-backdrop] .backdrop-image', { timeout: 10000 }).catch(() => {})
  const wall = await ntpB.evaluate(async () => {
    const el = document.querySelector('[data-backdrop] .backdrop-image')
    const mark = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null
    const stored = await new Promise((resolve) => {
      const req = indexedDB.open('stackboard', 1)
      req.onerror = () => resolve(null)
      req.onsuccess = () => {
        const get = req.result.transaction('files', 'readonly').objectStore('files').get('background')
        get.onsuccess = () => resolve(get.result ? { type: get.result.blob.type, size: get.result.blob.size } : null)
        get.onerror = () => resolve(null)
      }
    })
    return { src: el?.style.backgroundImage ?? null, board: mark('sb:board'), backdrop: mark('sb:backdrop'), stored }
  })
  check('the background image comes back on a new tab', !!wall.src && wall.src.includes('blob:chrome-extension://'), JSON.stringify(wall))
  check('the picture loads only after the board has painted', wall.board !== null && wall.backdrop !== null && wall.backdrop > wall.board, `board ${wall.board}, picture ${wall.backdrop}`)
  const storageUse = await control.evaluate(async () => ({ sync: await chrome.storage.sync.getBytesInUse(null), local: JSON.stringify(await chrome.storage.local.get(null)).length }))
  check('the picture lives in IndexedDB, never in chrome.storage', !!wall.stored && wall.stored.size > 0 && storageUse.sync === 0 && storageUse.local < 4000, JSON.stringify({ stored: wall.stored, storageUse }))
  await ntpB.screenshot({ path: path.join(SHOTS, '30-wallpaper.png') })

  // Keys 1-9 jump to spaces; digits typed into search stay there.
  const spaceNames = await control.evaluate(async () => {
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    return (await chrome.bookmarks.getChildren(root.id)).filter((c) => !c.url).map((c) => c.title.replace(/^\S+\s/, ''))
  })
  await ntpB.bringToFront()
  await ntpB.mouse.click(120, 860)
  await ntpB.keyboard.press('2')
  await sleep(250)
  const onSecond = await ntpB.$eval('main h1', (h) => h.textContent)
  await ntpB.keyboard.press('1')
  await sleep(250)
  const onFirst = await ntpB.$eval('main h1', (h) => h.textContent)
  check('keys 1-9 switch spaces', spaceNames.length > 1 && onSecond === spaceNames[1] && onFirst === spaceNames[0], `${onSecond}, ${onFirst} vs ${spaceNames.join(' | ')}`)
  await ntpB.keyboard.press('/')
  await ntpB.keyboard.type('2')
  await sleep(250)
  const typed = await ntpB.evaluate(() => document.querySelector('aside input')?.value)
  await ntpB.keyboard.press('Escape')
  await sleep(200)
  const stayed = await ntpB.$eval('main h1', (h) => h.textContent)
  check('a digit typed into search stays in the search box', typed === '2' && stayed === spaceNames[0], `${typed} ${stayed}`)

  // Other open tabs and the toolbar popup follow a change; the popup never gets the wallpaper.
  await control.evaluate(async () => {
    const { appearance } = await chrome.storage.local.get('appearance')
    await chrome.storage.local.set({ appearance: { ...appearance, palette: 'nord', mode: 'dark' } })
  })
  await sleep(500)
  check('other open tabs follow a change', (await look(ntpB)).canvas === rgb('#2e3440'))
  const popupPage = await browser.newPage()
  await popupPage.goto(NTP.replace('newtab.html', 'popup.html'))
  await sleep(600)
  const popupLook = await popupPage.evaluate(() => ({ canvas: getComputedStyle(document.body).backgroundColor, bg: document.documentElement.dataset.bg ?? null }))
  check('the toolbar popup takes the palette, without the wallpaper', popupLook.canvas === rgb('#2e3440') && popupLook.bg === null, JSON.stringify(popupLook))

  // Nothing leaves the browser, and no new permissions.
  const quiet = await browser.newPage()
  const outside = []
  quiet.on('request', (r) => {
    if (/^(https?|wss?):/.test(r.url())) outside.push(r.url())
  })
  await quiet.goto(NTP, { waitUntil: 'load' })
  await quiet.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
  await sleep(1500)
  check('the new tab makes no network requests', outside.length === 0, outside.slice(0, 3).join(', '))
  const shipped = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'))
  check(
    'no new permissions',
    JSON.stringify(shipped.permissions) === JSON.stringify(['bookmarks', 'favicon', 'tabs', 'storage', 'tabGroups']) && !shipped.host_permissions && !shipped.optional_permissions,
    JSON.stringify(shipped.permissions),
  )
} catch (e) {
  console.log('ERROR', e.message)
  results.push({ name: 'script error', ok: false })
} finally {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (errors.length) console.log('Page errors:\n  ' + [...new Set(errors)].join('\n  '))
  await browser.close()
}
