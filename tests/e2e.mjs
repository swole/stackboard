// End-to-end check of the built Stackboard extension in Chrome for Testing.
// Loads dist/ unpacked into a throwaway profile, seeds bookmarks through chrome.bookmarks,
// and drives the new-tab page with real mouse and keyboard input. 92 checks, ~2 min.
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
// 0.8.0 adds `search` (go links fall back to the default search engine); Chrome shows no install
// warning for it, which the go-link block checks with getPermissionWarningsByManifest.
const PERMISSIONS = ['bookmarks', 'favicon', 'tabs', 'storage', 'tabGroups', 'search']
// 0.9.2: the Pro for life checkout (CHECKOUT.lifetime in src/lib/proPlan.ts).
const LIFETIME_CHECKOUT = 'https://buy.polar.sh/polar_cl_ypdUWh3QdU4DghsZoSm7xcIG6SoBFZaC8Bl9b1Ad37W'
// 0.9.4: Pro for life at the founding offer, after The price (CHECKOUT.lifetimeOffer).
const LIFETIME_OFFER_CHECKOUT = 'https://buy.polar.sh/polar_cl_fdIwiaHAZZJmWaP3q3P2nywkOuzRrtaC5wyPh1cbRTo'
// 0.9.4: anything the trial's one-tap switches say (trialSwitches in src/lib/nudgePlan.ts), as a
// regex source, since page.evaluate takes no RegExp.
const SWITCH_WORDS = 'Make the most of your trial|Turn on auto-archive|Show the Today strip|Auto-archive is on|Today strip is on'
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

/**
 * A step that can stall (a page left behind another tab, a reply that never comes) gets `ms` to
 * answer, then one more try with its page in front, then fails on its own with its label instead
 * of hanging until the protocol timeout ends the whole run (3 Nov 2026: two runs stopped dead
 * right after the share block's parked-stacks check).
 */
async function bounded(label, pg, fn, ms = 15000) {
  const once = () => {
    const run = Promise.resolve().then(fn)
    run.catch(() => {}) // the attempt that was given up on may still fail later: ignore it
    let timer
    const limit = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: no answer in ${ms} ms`)), ms)
    })
    return Promise.race([run, limit]).finally(() => clearTimeout(timer))
  }
  try {
    return await once()
  } catch (e) {
    if (!pg || !String(e?.message).includes('no answer')) throw e
    console.log(`RETRY  ${label} (brought its page to the front)`)
    await pg.bringToFront().catch(() => {})
    return once()
  }
}

/** Asks the service worker from an extension page, giving up after `ms` with { error: 'no reply' }. */
function askWorker(pg, msg, ms = 8000) {
  return bounded(`worker ${msg?.type}`, pg, () =>
    pg.evaluate(
      (m, t) => Promise.race([chrome.runtime.sendMessage(m), new Promise((r) => setTimeout(() => r({ error: 'no reply' }), t))]),
      msg,
      ms,
    ),
  )
}

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
  // 0.8.0: with a managed_schema the install tab can open after this page and take the front;
  // a background page gets no animation frames, so puppeteer's waits would never poll.
  await control.bringToFront()
  await control.waitForFunction(() => document.body.innerText.includes('Welcome to Stackboard'), { timeout: 10000 })

  // ---------- 0.9.2: the reverse trial on install ----------
  // Every run installs fresh, so the service worker starts the Pro trial by itself, a moment after
  // install (it waits for the company policy first). Check it here, on the empty board, then take it
  // away: the blocks below expect a free board unless they set a trial themselves.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    await until(control, async () => !!(await chrome.storage.sync.get('proTrial')).proTrial, null, 15000)
    const got = await control.evaluate(async () => (await chrome.storage.sync.get('proTrial')).proTrial ?? null)
    check('reverse trial: a fresh install starts the Pro trial by itself, marked auto', got?.auto === true && typeof got.startedAt === 'number' && Math.abs(Date.now() - got.startedAt) < 5 * 60000, JSON.stringify(got))
    await control.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    const inSettings = await until(control, () => document.querySelector('[data-pro]')?.dataset.pro === 'trial')
    const said = await control.evaluate(() => document.querySelector('[data-pro]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
    check(
      'reverse trial: Settings says the trial started on install, and nothing says it never starts by itself',
      inSettings && said.includes('Your free Pro trial started when you added Stackboard: 14 days left. When it ends, Pro features pause and everything you made stays.') && !/by itself/i.test(said),
      said.slice(0, 220),
    )
    await control.keyboard.press('Escape')
    await until(control, () => !document.querySelector('[role=dialog]'))

    // Due by every other rule (two days in, the fifth new tab), the reverse-trial card still stays
    // off the welcome screen of an empty board.
    const ls = await control.evaluate(() => Object.fromEntries(['stackable:opens', 'stackable:firstSeen', 'stackable:reverseTrial'].map((k) => [k, localStorage.getItem(k)])))
    await control.evaluate(async () => {
      const at = Date.now() - 2 * 86400000
      await chrome.storage.sync.remove('proTrial')
      await chrome.storage.sync.set({ proTrial: { startedAt: at, auto: true } })
      localStorage.setItem('stackable:opens', '4')
      localStorage.setItem('stackable:firstSeen', String(at))
      localStorage.removeItem('stackable:reverseTrial')
    })
    const known = new Set(browser.targets())
    const opening = browser.waitForTarget((t) => !known.has(t) && t.type() === 'page' && (t.url() === NTP || t.url().startsWith('chrome://newtab')), { timeout: 10000 })
    await control.evaluate(() => chrome.tabs.create({ active: true }))
    const welcome = await (await opening).page()
    welcome.on('pageerror', (e) => errors.push(`reverse trial welcome: ${e.message}`))
    await welcome.waitForFunction(() => document.body.innerText.includes('Welcome to Stackboard'), { timeout: 10000 })
    await sleep(3000) // the card decides 1.5 s after the board loads
    const onWelcome = await welcome.evaluate(() => ({ card: !!document.querySelector('[data-reverse-trial]'), shows: localStorage.getItem('stackable:reverseTrial'), opens: localStorage.getItem('stackable:opens') }))
    check('reverse card: never on the welcome screen of an empty board', !onWelcome.card && onWelcome.shows === null && onWelcome.opens === '5', JSON.stringify(onWelcome))
    await welcome.close()
    await control.bringToFront()
    await control.evaluate(async (ls) => {
      await chrome.storage.sync.remove('proTrial')
      for (const [k, v] of Object.entries(ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
    }, ls)
    // An update never starts it: the worker's update step, as the suite plays it, leaves sync alone.
    const replay = await askWorker(control, { type: 'e2e-updated-from', previousVersion: '0.9.1' })
    await sleep(500)
    const afterUpdate = await control.evaluate(async () => (await chrome.storage.sync.get('proTrial')).proTrial ?? null)
    check('reverse trial: the update step starts no trial', replay?.ok === true && afterUpdate === null, JSON.stringify({ replay, afterUpdate }))
  }

  // 0.9.5: the one free tidy would put "Tidy (free once)" on every free board (and Settings would ask
  // getstackboard.com about it), and the December founding-price note goes by the real clock. Their
  // own blocks set both up; for every other block the free tidy counts as used and the note as shown
  // in both its windows, as on a board that has seen them.
  await control.evaluate(async () => {
    await chrome.storage.sync.set({ freeTidy: { at: Date.now() } })
    localStorage.setItem('stackable:foundingNote', 'last-days')
  })

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
  // 0.8.0: "Deep" stays a folder inside the Reading stack, so 2 stacks (it was a third, "Reading › Deep").
  check('welcome offers the bookmarks bar with counts', welcome.rows.some((r) => r.includes('Bookmarks bar') && r.includes('3 links') && r.includes('2 stacks')), JSON.stringify(welcome.rows))
  check('welcome says folders inside stay folders', welcome.note.includes('2 stacks, one per folder, and 1 folder inside them'), welcome.note)
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
    const walk = (n) => (n.url ? n.title : { [n.title]: (n.children ?? []).map(walk) })
    return {
      space: space.title,
      stacks: space.children.map((st) => `${st.title}:${st.children.length}`),
      reading: JSON.stringify(walk(space.children.find((st) => st.title === 'Reading'))),
      bar: (await chrome.bookmarks.getChildren('1')).length,
    }
  })
  check('copy makes a space from the bookmarks bar', copied.space === '⭐ Bookmarks bar', copied.space)
  check('each folder becomes a stack with its links', copied.stacks.join('|') === 'On the bar:1|Reading:2', copied.stacks.join('|'))
  check('a folder inside a folder stays nested in its stack', copied.reading === JSON.stringify({ Reading: ['Wikipedia', { Deep: ['MDN'] }] }), copied.reading)
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
  // 0.5.2: one highlighted tab keeps the popup exactly as it was.
  const singleTitle = await popup.evaluate(() => document.querySelector('[data-popup-title]')?.textContent ?? '')
  check('one highlighted tab keeps the single-tab popup', singleTitle === 'Save current tab' && !(await popup.$('[data-selected-tabs]')), singleTitle)
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

  // ---------- 0.5.2: save selected tabs (C1) ----------
  const selWin = await control.evaluate(async (ntpUrl) => {
    const w = await chrome.windows.create({ url: ['https://example.com/?sel=1', 'about:blank', 'https://example.org/?sel=2', 'https://example.net/?sel=3'], focused: true })
    const pop = await chrome.tabs.create({ windowId: w.id, url: ntpUrl.replace('newtab.html', 'popup.html?sel'), active: true })
    return { windowId: w.id, popIndex: pop.index }
  }, NTP)
  const selPopup = await browser.waitForTarget((t) => t.url().endsWith('/popup.html?sel'), { timeout: 10000 }).then((t) => t.page())
  await selPopup.waitForSelector('[data-popup-title]', { timeout: 10000 })
  // Ctrl+click in the tab strip, done through the API: the popup tab (active) plus tabs 0-2.
  await control.evaluate((w) => chrome.tabs.highlight({ windowId: w.windowId, tabs: [w.popIndex, 0, 1, 2] }), selWin)
  await selPopup.reload()
  await selPopup.waitForSelector('[data-selected-tabs]', { timeout: 10000 }).catch(() => {})
  const selOffer = await selPopup.evaluate(() => ({
    title: document.querySelector('[data-popup-title]')?.textContent ?? '',
    list: [...document.querySelectorAll('[data-selected-tabs] li')].length,
    note: document.querySelector('[data-selected-tabs]')?.textContent ?? '',
    input: !!document.querySelector('input[type="text"]'),
  }))
  check('several highlighted tabs offer "Save 2 selected tabs"', selOffer.title === 'Save 2 selected tabs' && selOffer.list === 2 && !selOffer.input, JSON.stringify(selOffer))
  check('browser pages in the selection are skipped', selOffer.note.includes("2 browser pages can't be saved"), selOffer.note)
  const picked = await selPopup.evaluate(() => {
    const space = [...document.querySelectorAll('button')].find((b) => b.querySelector('span.flex-1')?.textContent === 'Stash')
    space?.click()
    return !!space
  })
  await sleep(300)
  const pickedStack = await selPopup.evaluate(() => {
    const st = [...document.querySelectorAll('button')].find((b) => b.querySelector('span.truncate')?.textContent === 'Research')
    st?.click()
    return !!st
  })
  await sleep(500)
  const selDone = await selPopup.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).catch(() => '')
  await sleep(1000)
  const selSaved = await control.evaluate(async () => {
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    const [sub] = await chrome.bookmarks.getSubTree(root.id)
    const space = sub.children.find((c) => c.title === '📥 Stash')
    const research = space?.children.find((st) => st.title === 'Research')
    return (research?.children ?? []).map((b) => b.url).filter((u) => u.includes('?sel='))
  })
  check('the selected tabs land in the chosen stack', picked && pickedStack && selSaved.join(',') === 'https://example.com/?sel=1,https://example.org/?sel=2', JSON.stringify(selSaved))
  check('the popup confirms how many were saved', selDone.includes('Saved 2 tabs to Stash › Research'), selDone.slice(0, 120))
  await control.evaluate((id) => chrome.windows.remove(id), selWin.windowId).catch(() => {})

  // ---------- 0.5.1: tab bankruptcy (every window) ----------
  // 0.5.3: a fresh rating state one day in, so the saved certificate is a rating milestone.
  await control.evaluate(() => {
    localStorage.setItem('stackable:opens', '2')
    localStorage.setItem('stackable:firstSeen', String(Date.now() - 2 * 86400000))
    localStorage.setItem('stackable:stashes', '0')
    localStorage.removeItem('stackable:rating')
  })
  const bk = await control.evaluate(async (ntpUrl) => {
    const a = await chrome.windows.create({ url: ['https://example.com/?bk=1', 'https://example.org/?bk=2'], focused: false })
    const b = await chrome.windows.create({ url: ['https://example.com/?bk=3', 'https://example.com/?bk=3', 'https://example.net/?bk=4'], focused: true })
    await chrome.tabs.create({ windowId: b.id, url: ntpUrl.replace('newtab.html', 'popup.html'), active: true })
    return [a.id, b.id]
  }, NTP)
  const bkPopupTarget = await browser.waitForTarget((t) => t.url().endsWith('/popup.html') && !knownBefore.has(t), { timeout: 10000 })
  const bkPopup = await bkPopupTarget.page()
  await bkPopup.waitForSelector('[data-bankruptcy]', { timeout: 15000 })
  const bkOffer = await bkPopup.evaluate(() => document.querySelector('[data-bankruptcy]')?.textContent ?? '')
  check('popup offers tab bankruptcy across windows', /Declare tab bankruptcy: stash all \d+ tabs in \d+ windows/.test(bkOffer), bkOffer)
  await bkPopup.click('[data-bankruptcy]')
  await sleep(200)
  const armedText = await bkPopup.evaluate(() => document.querySelector('[data-bankruptcy]')?.textContent ?? '')
  check('bankruptcy asks before closing', armedText.startsWith('Sure? Close all'), armedText)
  const knownBk = new Set(browser.targets())
  await bkPopup.click('[data-bankruptcy]').catch(() => {})
  const certTab = await browser
    .waitForTarget((t) => !knownBk.has(t) && t.type() === 'page' && (t.url() === NTP || t.url().startsWith('chrome://newtab')), { timeout: 15000 })
    .then((t) => t.page())
    .catch(() => null)
  await sleep(3000)
  const bkState = await control.evaluate(async () => {
    const tabs = await chrome.tabs.query({})
    const web = tabs.filter((t) => !t.pinned && /^https?:/.test(t.pendingUrl || t.url))
    const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
    const [sub] = await chrome.bookmarks.getSubTree(root.id)
    const space = sub.children.find((c) => c.title === '📥 Stash')
    const bkStacks = space.children.filter((st) => st.title.startsWith('Tab bankruptcy'))
    return { web: web.length, pinned: tabs.filter((t) => t.pinned).length, stacks: bkStacks.map((st) => st.title.replace(/^Tab bankruptcy [^(]+/, 'TB').trim() + ':' + st.children.length) }
  })
  check('bankruptcy closes every web tab, pinned stay', bkState.web === 0 && bkState.pinned >= 1, JSON.stringify(bkState))
  check('bankruptcy saves a stack per window', bkState.stacks.length >= 2 && bkState.stacks[0].startsWith('TB:') && bkState.stacks.some((x) => x.startsWith('TB(window 2)')), JSON.stringify(bkState.stacks))
  const certified = certTab
    ? await certTab
        .waitForSelector('[data-certificate] canvas', { timeout: 8000 })
        .then(() => certTab.evaluate(() => ({ h: document.querySelector('[data-certificate] h2')?.textContent, w: document.querySelector('[data-certificate] canvas')?.width })))
        .catch(() => null)
    : null
  check('bankruptcy opens a new tab with the certificate', !!certified && /^\d+ tabs discharged$/.test(certified.h) && certified.w === 1200, JSON.stringify(certified))
  // ---------- 0.5.3: rating ask at a milestone (R1) ----------
  let milestone = null
  if (certTab) {
    const askedOverCert = await certTab.evaluate(() => !!document.querySelector('[data-rating-prompt]'))
    await clickText(certTab, '[data-certificate] button', 'Copy text')
    await sleep(300)
    await certTab.keyboard.press('Escape')
    await certTab.waitForSelector('[data-rating-prompt]', { timeout: 4000 }).catch(() => {})
    milestone = await certTab.evaluate(() => {
      const card = document.querySelector('[data-rating-prompt]')
      if (!card) return null
      const r = card.getBoundingClientRect()
      return { centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 4, stars: card.querySelectorAll('svg.lucide-star').length, text: card.textContent }
    })
    await certTab.screenshot({ path: path.join(SHOTS, '30-rating-milestone.png') })
    check('the ask waits while the certificate is open', !askedOverCert)
    check('a saved certificate brings the ask after one day at 2 tabs', !!milestone, JSON.stringify(milestone))
    check('the ask is a centred card with no stars', !!milestone && milestone.centred && milestone.stars === 0 && milestone.text.includes('open source'), JSON.stringify(milestone))
    await certTab.keyboard.press('Escape')
    await sleep(200)
    check('esc retires the milestone ask', await certTab.evaluate(() => !document.querySelector('[data-rating-prompt]') && localStorage.getItem('stackable:rating') === 'dismissed'))
  } else {
    check('a saved certificate brings the ask after one day at 2 tabs', false, 'no certificate tab')
  }

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
  // 0.5.2: True black, an OLED palette with a pure #000000 canvas (dark only, like Nord).
  await pick('[data-palette-option="black"]')
  const blackLook = await look(ntpA)
  const blackNote = await ntpA.evaluate(() => document.querySelector('[data-mode-note]')?.textContent ?? '')
  check('True black: pure black canvas, dark even in Light mode', blackLook.palette === 'black' && blackLook.scheme === 'dark' && blackLook.canvas === rgb('#000000') && blackLook.card === rgb('#121212') && blackLook.heading === rgb('#ffffff') && blackNote.includes('only comes in dark'), JSON.stringify(blackLook))
  const blackSwatch = await ntpA.evaluate(() => document.querySelector('[data-palette-option="black"]')?.textContent ?? '')
  check('True black swatch is named and marked dark only', blackSwatch.includes('True black') && blackSwatch.includes('Dark only'), blackSwatch)
  // 0.5.4 (F2): Dracula is dark only like Nord; Rosé Pine in Light mode is Dawn and survives a reload.
  await pick('[data-palette-option="dracula"]')
  const dracula = await look(ntpA)
  const draculaNote = await ntpA.evaluate(() => document.querySelector('[data-mode-note]')?.textContent ?? '')
  check('Dracula stays dark when Light is picked, and says why', dracula.palette === 'dracula' && dracula.scheme === 'dark' && dracula.canvas === rgb('#282a36') && draculaNote.includes('only comes in dark'), draculaNote)
  await pick('[data-palette-option="rosepine"]')
  await ntpA.reload({ waitUntil: 'load' })
  await ntpA.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
  await sleep(300)
  const dawn = await look(ntpA)
  check('Rosé Pine applies data-palette and persists across a reload (Dawn in Light mode)', dawn.palette === 'rosepine' && dawn.scheme === 'light' && dawn.canvas === rgb('#faf4ed'), JSON.stringify(dawn))
  await clickText(ntpA, 'aside button', 'Settings')
  await ntpA.waitForSelector('[data-appearance]', { timeout: 5000 })

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
  // 0.7.0: sync holds the small Pro marks (proEarly), never the picture.
  check('the picture lives in IndexedDB, never in chrome.storage', !!wall.stored && wall.stored.size > 0 && storageUse.sync < 200 && storageUse.local < 4000, JSON.stringify({ stored: wall.stored, storageUse }))
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
    JSON.stringify(shipped.permissions) === JSON.stringify(PERMISSIONS) && !shipped.host_permissions && !shipped.optional_permissions,
    JSON.stringify(shipped.permissions),
  )
  const enMsgs = path.join(EXT, '_locales', 'en', 'messages.json')
  check(
    'store name and summary come from _locales (en default)',
    shipped.default_locale === 'en' && shipped.name === '__MSG_extName__' && fs.existsSync(enMsgs) &&
      JSON.parse(fs.readFileSync(enMsgs, 'utf8')).extName.message === 'Stackboard: New Tab Bookmarks & Visual Bookmark Manager',
    `${shipped.default_locale} ${shipped.name}`,
  )
  // 0.5.6: ten more store languages (backlog S4); each one is its own store-search shelf
  const shippedLocales = fs.readdirSync(path.join(EXT, '_locales'))
  check('21 store languages ship', shippedLocales.length === 21 && ['ru', 'zh_TW', 'th'].every((l) => shippedLocales.includes(l)), shippedLocales.join(' '))

  // ---------- 0.7.0: Stackboard Pro ----------
  // Settings sells Pro; the trial is opt-in and syncs; a pasted key is checked before any call.
  // The test board is new, so whether it counts as early depends on the date (PRO_CUTOFF); the
  // to-do block below pins the early mark so its checks hold on any date.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    await control.evaluate(() => chrome.storage.sync.remove(['proTrial', 'proKey']))
    const page = await openNtp()
    await page.bringToFront()
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    const shown = await until(page, () => document.querySelector('[data-pro]')?.dataset.pro === 'free')
    const offer = await page.evaluate(() => document.querySelector('[data-pro]')?.innerText ?? '')
    check('pro: Settings offers Pro with a trial and a key box', shown && offer.includes('Get Pro') && offer.includes('Try it free for 14 days'), offer.slice(0, 160))
    // 0.9.4: the trial's one-tap switches (and their row) never show for a free board.
    const freeRow = await page.evaluate((re) => ({ row: !!document.querySelector('[data-pro-trial-switches], [data-trial-switch]'), words: new RegExp(re).test(document.body.innerText) }), SWITCH_WORDS)
    check('trial switches: none for a free board, in Settings or on the board', !freeRow.row && !freeRow.words, JSON.stringify(freeRow))
    // 0.9.3: Get Pro names the price the note above it gives, and stays second to the trial; one quiet
    // line under the buttons says how checkout works and promises a refund, above Pro for life.
    const sells = () => page.evaluate(() => {
      const pro = document.querySelector('[data-pro]')
      const buttons = [...(pro?.querySelectorAll('button') ?? [])]
      const getPro = buttons.find((b) => /^Get Pro for \$/.test(b.textContent.trim()))
      const refund = document.querySelector('[data-pro-refund]')
      const life = document.querySelector('[data-pro-lifetime]')
      const after = (a, b) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      return {
        getPro: getPro?.textContent.trim() ?? null,
        price: pro?.innerText.match(/\$\d+\.\d\d a year/)?.[0] ?? null,
        secondary: !!getPro && getPro.className.includes('border'),
        refund: refund?.innerText.trim() ?? null,
        order: after(getPro, refund) && after(refund, life),
      }
    })
    const REFUND = 'Checkout is by Polar: card, Apple Pay or Google Pay. Changed your mind? Full refund within 14 days.'
    const free = await sells()
    check('pro: Get Pro names the price from the note above it, and stays second to the trial', !!free.price && free.getPro === `Get Pro for ${free.price}` && free.secondary, JSON.stringify(free))
    check('pro: one line under the buy buttons says how checkout works and promises a refund, above Pro for life', free.refund === REFUND && free.order, JSON.stringify(free))

    await page.evaluate(() => document.querySelector('[data-pro] input[aria-label="License key"]').focus())
    await page.keyboard.type('nope')
    await page.evaluate(() => document.querySelector('[data-pro-key] button[type=submit]').click())
    const badNote = await until(page, () => document.querySelector('[data-pro]').innerText.includes("doesn't look like a license key"))
    check('pro: a pasted non-key says so without calling anyone', badNote)

    await page.evaluate(() => document.querySelector('[data-pro-trial]').click())
    const trial = await until(page, () => document.querySelector('[data-pro]')?.dataset.pro === 'trial' && document.querySelector('[data-pro]').innerText.includes('14 days left'))
    const synced = await control.evaluate(async () => (await chrome.storage.sync.get('proTrial')).proTrial)
    check('pro: the trial starts on a click and syncs', trial && typeof synced?.startedAt === 'number', JSON.stringify(synced))
    // 0.9.2: a trial started with a click carries no auto mark, and Settings keeps its own line.
    const optInLine = await page.evaluate(() => document.querySelector('[data-pro-trial-line]')?.dataset.proTrialLine ?? null)
    check('pro: a trial started with a click has no auto mark', !!synced && !('auto' in synced) && optInLine === 'opt-in', JSON.stringify({ synced, optInLine }))
    // 0.9.4: during any trial, a row under the trial line offers the features that are still off.
    const optInRow = await until(page, () => !!document.querySelector('[data-pro-trial-switches]'))
    const row = await page.evaluate(() => {
      const r = document.querySelector('[data-pro-trial-switches]')
      return {
        text: r?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        buttons: [...(r?.querySelectorAll('[data-trial-switch]') ?? [])].map((b) => `${b.dataset.trialSwitch}: ${b.textContent.trim()}`),
        under: !!r && r.previousElementSibling === document.querySelector('[data-pro-trial-line]'),
      }
    })
    check(
      'trial switches: a trial started with a click gets the row under the trial line, both features off',
      optInRow && !!row.text?.startsWith('Make the most of your trial:') && row.buttons.join('|') === 'archive: Turn on auto-archive|strip: Show the Today strip' && row.under,
      JSON.stringify(row),
    )
    check('pro: with the trial on, Settings shows auto-archive', await until(page, () => !!document.querySelector('[data-archive-setting]')))
    const onTrial = await sells()
    check('pro: on the trial, Get Pro still names the price, with the refund line under it', !!onTrial.price && onTrial.getPro === `Get Pro for ${onTrial.price}` && onTrial.refund === REFUND && onTrial.order, JSON.stringify(onTrial))

    const other = await openNtp()
    await other.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    check('pro: another tab shows the running trial', await until(other, () => document.querySelector('[data-pro]')?.dataset.pro === 'trial'))
    await other.close()

    const perms = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'))
    check('pro: no new permissions or host access', JSON.stringify(perms.permissions) === JSON.stringify(PERMISSIONS) && !perms.host_permissions && !perms.optional_host_permissions, JSON.stringify(perms.permissions))
    await control.evaluate(() => chrome.storage.sync.remove('proTrial'))
    await page.close()
  }

  // ---------- 0.8.0: the Pro card and finishing a purchase ----------
  // Polar is stubbed in the page: activate gives an id, validate says granted with the buyer's
  // email and the purchase day. The checkout tab is caught before it opens.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    await control.evaluate(() => Promise.all([chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub']), chrome.storage.local.remove(['proLicense', 'proCheckout'])]))
    const stub = () => {
      window.__polar = []
      window.__opened = []
      const real = window.fetch.bind(window)
      const json = (b, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } }))
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url
        if (url.startsWith('https://api.polar.sh/')) {
          const op = url.split('/').pop()
          window.__polar.push(op)
          if (op === 'activate') return json({ id: 'act-e2e' })
          if (op === 'validate') return json({ benefit_id: 'f204b661-dc9b-4ce5-91f5-7cc6559d1617', status: 'granted', expires_at: null, created_at: '2026-11-03T08:41:50Z', customer: { email: 'buyer@example.com' } })
          if (op === 'deactivate') return new Response(null, { status: 204 })
        }
        return real(input, init)
      }
      try {
        const create = chrome.tabs.create.bind(chrome.tabs)
        chrome.tabs.create = (o, ...rest) => (/polar\.sh/.test(o?.url ?? '') ? (window.__opened.push(o.url), Promise.resolve({ id: -1 })) : create(o, ...rest))
      } catch {
        // read-only binding: the test closes the real checkout tab instead
      }
    }
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    page.on('pageerror', (e) => errors.push(`pro card ntp: ${e.message}`))
    await page.evaluateOnNewDocument(stub)
    await page.goto(NTP, { waitUntil: 'load' })
    await page.bringToFront()
    await page.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(page, () => document.querySelector('[data-pro]')?.dataset.pro === 'free')
    check('pro card: a free board says where a bought key is', await page.evaluate(() => !!document.querySelector('[data-pro-find-key]')))

    // 0.9.2: one quiet line under the buttons sells Pro for life, through its own checkout with the
    // same labels; the finishing steps follow, and Back to checkout returns to that checkout.
    const lastCheckout = async () => {
      const opened = await page.evaluate(() => window.__opened.splice(0))
      const tabs = browser.targets().filter((t) => /polar\.sh/.test(t.url())).map((t) => t.url())
      for (const t of browser.targets()) if (/polar\.sh/.test(t.url())) await (await t.page().catch(() => null))?.close().catch(() => {})
      await page.bringToFront()
      return [...opened, ...tabs].map((u) => new URL(u)).filter((u) => /(^|\.)polar\.sh$/.test(u.hostname)).pop() ?? null
    }
    const lifeLine = await page.evaluate(() => document.querySelector('[data-pro-lifetime]')?.innerText.replace(/\s+/g, ' ').trim() ?? null)
    check("lifetime: a free board's Settings offers Pro for life in one line", lifeLine === 'Prefer to pay once? Get Pro for life for $19.', String(lifeLine))
    await page.evaluate(() => [...document.querySelectorAll('[data-pro-lifetime] button')].find((b) => b.textContent.trim() === 'Get Pro for life')?.click())
    const lifeSteps = await until(page, () => !!document.querySelector('[data-pro-pending]'))
    const life = await lastCheckout()
    const lifeMark = await control.evaluate(async () => (await chrome.storage.local.get('proCheckout')).proCheckout ?? null)
    check(
      'lifetime: Get Pro for life opens the lifetime checkout with the labels, and the finishing steps',
      lifeSteps && !!life && life.origin + life.pathname === LIFETIME_CHECKOUT && life.searchParams.get('utm_source') === 'extension-dev' && life.searchParams.get('utm_medium') === 'settings-lifetime' && /^(free|trial-ended)$/.test(life.searchParams.get('utm_content') ?? '') && /^v\d/.test(life.searchParams.get('utm_campaign') ?? '') && lifeMark?.lifetime === true,
      JSON.stringify({ life: life?.href, lifeMark }),
    )
    check('lifetime: the finishing steps carry no lifetime line', await page.evaluate(() => !document.querySelector('[data-pro-lifetime]')))
    check('refund line: the finishing steps carry none, and no priced Get Pro', await page.evaluate(() => !!document.querySelector('[data-pro-pending]') && !document.querySelector('[data-pro-refund]') && ![...document.querySelectorAll('[data-pro] button')].some((b) => /^Get Pro for \$/.test(b.textContent.trim()))))
    await page.evaluate(() => [...document.querySelectorAll('[data-pro-pending] button')].find((b) => b.textContent.trim() === 'Back to checkout')?.click())
    await sleep(600)
    const back = await lastCheckout()
    check('lifetime: Back to checkout opens the lifetime checkout again', !!back && back.origin + back.pathname === LIFETIME_CHECKOUT && back.searchParams.get('utm_medium') === 'settings-pending', String(back?.href))
    // Start over: no checkout pending, so Settings sells Pro again.
    await control.evaluate(() => chrome.storage.local.remove('proCheckout'))
    await until(page, () => !document.querySelector('[data-pro-pending]') && !!document.querySelector('[data-pro-lifetime]'))
    await page.evaluate(() => window.__opened.splice(0))

    // Get Pro opens the checkout and turns Settings to the steps that finish the purchase.
    // 0.9.3: the button names the price ("Get Pro for $2.99 a year").
    await page.evaluate(() => [...document.querySelectorAll('[data-pro] button')].find((b) => /^Get Pro for \$\d+\.\d\d a year$/.test(b.textContent.trim())).click())
    const steps = await until(page, () => !!document.querySelector('[data-pro-pending]'))
    const opened = await page.evaluate(() => window.__opened.slice())
    const polarTabs = browser.targets().filter((t) => /polar\.sh/.test(t.url())).map((t) => t.url())
    for (const t of browser.targets()) if (/polar\.sh/.test(t.url())) await (await t.page().catch(() => null))?.close().catch(() => {})
    await page.bringToFront()
    const marked = await control.evaluate(async () => (await chrome.storage.local.get('proCheckout')).proCheckout)
    check('pro card: Get Pro opens the checkout and shows the finishing steps', steps && typeof marked?.at === 'number', JSON.stringify({ opened, marked }))
    // 0.9.1: the link says which button and plan sent them; an unpacked build is labelled dev.
    const tagged = [...opened, ...polarTabs].map((u) => new URL(u)).find((u) => /(^|\.)polar\.sh$/.test(u.hostname))
    check(
      'pro card: the checkout link names the button, the plan and the version (dev label on an unpacked build)',
      !!tagged && tagged.searchParams.get('utm_source') === 'extension-dev' && tagged.searchParams.get('utm_medium') === 'settings' && /^(free|trial-ended)$/.test(tagged.searchParams.get('utm_content') ?? '') && /^v\d/.test(tagged.searchParams.get('utm_campaign') ?? ''),
      JSON.stringify({ opened, polarTabs }),
    )
    check('pro card: after a look at the checkout, the finishing steps still offer the trial', await page.evaluate(() => !!document.querySelector('[data-pro-pending-trial]')))

    // A good key: crown card with the details, a thank-you, a toast and the crown in the sidebar.
    await page.evaluate(() => document.querySelector('[data-pro] input[aria-label="License key"]').focus())
    await page.keyboard.type('SB-E2E0-0000-0000-9F2C')
    await page.evaluate(() => document.querySelector('[data-pro-key] button[type=submit]').click())
    const on = await until(page, () => document.querySelector('[data-pro]')?.dataset.pro === 'pro' && !!document.querySelector('[data-pro-card]'))
    const card = await page.evaluate(() => document.querySelector('[data-pro-card]')?.innerText ?? '')
    check('pro card: a good key shows the crown card and its details', on && /active/i.test(card) && card.includes('buyer@example.com') && card.includes('3 Nov 2026') && card.includes('SB-...-9F2C') && !card.includes('Yearly plan'), card.replace(/\s+/g, ' ').slice(0, 220))
    check('pro card: a thank-you on the card and a toast', await until(page, () => !!document.querySelector('[data-pro-welcome]') && document.body.innerText.includes('Switched on')))
    check('pro card: a crown beside the name in the sidebar', await page.evaluate(() => !!document.querySelector('[data-pro-crown]')))
    // 0.9.4: the trial's one-tap switches are for the trial only.
    const paidRow = await page.evaluate((re) => ({ row: !!document.querySelector('[data-pro-trial-switches], [data-trial-switch]'), words: new RegExp(re).test(document.body.innerText) }), SWITCH_WORDS)
    check('trial switches: none for a paid key, in Settings or on the board', !paidRow.row && !paidRow.words, JSON.stringify(paidRow))
    const after = await control.evaluate(async () => ({
      checkout: (await chrome.storage.local.get('proCheckout')).proCheckout ?? null,
      key: (await chrome.storage.sync.get('proKey')).proKey ?? null,
      lic: (await chrome.storage.local.get('proLicense')).proLicense ?? null,
    }))
    check('pro card: the steps clear, the key syncs and the email is kept', after.checkout === null && after.key?.key === 'SB-E2E0-0000-0000-9F2C' && after.lic?.email === 'buyer@example.com', JSON.stringify(after))

    // A plan saved by the purchase hand-off (or another computer) adds the price and the renewal.
    await control.evaluate(() => chrome.storage.sync.set({ proSub: { amount: 299, currency: 'usd', interval: 'year', periodEnd: Date.parse('2027-11-03T08:41:49Z'), at: Date.now() } }))
    const priced = await until(page, () => (document.querySelector('[data-pro-plan]')?.textContent ?? '').includes('$2.99 a year') && (document.querySelector('[data-pro-card]')?.innerText ?? '').includes('3 Nov 2027'))
    check('pro card: a synced plan shows the price and the renewal date', priced, await page.evaluate(() => document.querySelector('[data-pro-card]')?.innerText.replace(/\s+/g, ' ').slice(0, 200)))

    // Remove, clicked twice, takes the key, the plan and the license off again.
    await page.evaluate(() => document.querySelector('[data-pro-remove]').click())
    await page.evaluate(() => document.querySelector('[data-pro-remove]').click())
    const gone = await until(page, () => document.querySelector('[data-pro]')?.dataset.pro === 'free')
    const left = await control.evaluate(async () => ({ ...(await chrome.storage.sync.get(['proKey', 'proSub'])), ...(await chrome.storage.local.get('proLicense')) }))
    check('pro card: Remove clears the key, the plan and the license', gone && Object.keys(left).length === 0, JSON.stringify(left))
    await page.close()
  }

  // ---------- 0.8.0: the thanks page hands the key over ----------
  // Polar sends a buyer to getstackboard.com/pro/thanks with a customer session token. The page is
  // served from the site folder on its real origin; Polar's customer portal API is stubbed in the
  // page. The page reads the key and the plan and hands them to the extension, which keeps them in
  // sync storage; the next new tab activates the key with the (stubbed) license API.
  {
    const SITE = process.env.STACKABLE_SITE || path.resolve(process.env.STACKABLE_DIST ?? path.resolve(ROOT, '../dist'), '..', 'site')
    const THANKS = path.join(SITE, 'pro', 'thanks', 'index.html')
    if (!fs.existsSync(THANKS)) {
      console.log(`SKIP  pro hand-off: no site/pro/thanks page under ${SITE} (set STACKABLE_SITE)`)
    } else {
      const until = async (page, fn, arg, ms = 8000) => {
        for (let t = 0; t < ms; t += 150) {
          if (await page.evaluate(fn, arg).catch(() => false)) return true
          await sleep(150)
        }
        return false
      }
      const KEY = 'SB-HAND-0000-0000-7A1B'
      await control.evaluate(() => Promise.all([chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub']), chrome.storage.local.remove(['proLicense', 'proCheckout'])]))
      const openSite = async (url, portal) => {
        const page = await browser.newPage()
        page.on('pageerror', (e) => errors.push(`pro thanks: ${e.message}`))
        await page.evaluateOnNewDocument((id, portal) => {
          window.__STACKBOARD_EXT_ID = id
          window.__portalCalls = []
          const real = window.fetch.bind(window)
          window.fetch = async (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url
            if (url.startsWith('https://api.polar.sh/v1/customer-portal/')) {
              window.__portalCalls.push([url.replace('https://api.polar.sh/v1/customer-portal', ''), (init.headers || {}).Authorization || ''])
              const body = url.includes('/license-keys/') ? portal.keys : url.includes('/subscriptions/') ? portal.subs : url.includes('/orders/') ? portal.orders ?? { items: [] } : { items: [] }
              return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            return real(input, init)
          }
        }, extId, portal)
        await page.setRequestInterception(true)
        page.on('request', (req) => {
          const u = new URL(req.url())
          if (u.origin !== 'https://getstackboard.com') return req.continue()
          if (u.pathname === '/pro/thanks') return req.respond({ status: 200, contentType: 'text/html', body: fs.readFileSync(THANKS) })
          return req.respond({ status: 404, body: 'not found' })
        })
        await page.goto(url, { waitUntil: 'load' })
        return page
      }
      const portal = {
        keys: { items: [
          { key: 'SB-OTHR-0000-0000-0000', benefit_id: 'some-other-benefit', status: 'granted', created_at: '2026-11-03T08:00:00Z' },
          { key: KEY, benefit_id: 'f204b661-dc9b-4ce5-91f5-7cc6559d1617', status: 'granted', created_at: '2026-11-03T08:41:50Z' },
        ] },
        subs: { items: [{ amount: 299, currency: 'usd', recurring_interval: 'year', current_period_end: '2027-11-03T08:41:49Z', cancel_at_period_end: false, started_at: '2026-11-03T08:41:49Z', status: 'active' }] },
      }
      const stub = () => {
        window.__fetchBeforeStub = window.__fetchBeforeStub || window.fetch
        const real = window.__fetchBeforeStub.bind(window)
        window.fetch = async (input, init = {}) => {
          const url = typeof input === 'string' ? input : input.url
          if (url.startsWith('https://api.polar.sh/v1/customer-portal/license-keys/')) {
            const op = url.split('/').pop()
            if (op === 'activate') return new Response(JSON.stringify({ id: 'act-hand' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            if (op === 'validate') return new Response(JSON.stringify({ benefit_id: 'f204b661-dc9b-4ce5-91f5-7cc6559d1617', status: 'granted', expires_at: null, created_at: '2026-11-03T08:41:50Z', customer: { email: 'buyer@example.com' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }
          return real(input, init)
        }
      }
      // Every open Stackboard tab (the control page, the tab opened on install) activates a key the
      // moment it syncs, so they all get the stubbed license API and no test key reaches Polar.
      const boards = (await browser.pages()).filter((pg) => pg.url().startsWith(`chrome-extension://${extId}/`) || pg.url().startsWith('chrome://newtab'))
      for (const pg of boards) await pg.evaluate(stub).catch(() => {})
      const thanks = await openSite('https://getstackboard.com/pro/thanks?customer_session_token=polar_cst_e2e', portal)
      const handed = await until(thanks, () => document.getElementById('handoff')?.classList.contains('on'))
      const shown = await thanks.evaluate(() => ({ key: document.getElementById('key')?.textContent, url: location.href, calls: window.__portalCalls }))
      check('pro hand-off: the thanks page shows the key for our product', shown.key === KEY, JSON.stringify(shown.key))
      check('pro hand-off: the token leaves the address bar at once and goes only to Polar', !shown.url.includes('polar_cst') && shown.calls.length >= 1 && shown.calls.every(([, auth]) => auth === 'Bearer polar_cst_e2e'), JSON.stringify(shown))
      const saved = await control.evaluate(async () => chrome.storage.sync.get(['proKey', 'proSub']))
      check('pro hand-off: the extension keeps the key and the plan', handed && saved.proKey?.key === KEY && saved.proSub?.amount === 299 && saved.proSub?.interval === 'year', JSON.stringify(saved))
      await thanks.close()

      // The next new tab activates the handed-over key and shows the price and the renewal.
      const ntp = await browser.newPage()
      await ntp.setViewport({ width: 1400, height: 900 })
      ntp.on('pageerror', (e) => errors.push(`pro hand-off ntp: ${e.message}`))
      await ntp.evaluateOnNewDocument(stub)
      await ntp.goto(NTP, { waitUntil: 'load' })
      await ntp.bringToFront()
      await ntp.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      await ntp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
      const on = await until(ntp, () => document.querySelector('[data-pro]')?.dataset.pro === 'pro' && (document.querySelector('[data-pro-plan]')?.textContent ?? '').includes('$2.99 a year'))
      check('pro hand-off: the next new tab is Pro with the plan on the card', on, await ntp.evaluate(() => document.querySelector('[data-pro]')?.innerText.replace(/\s+/g, ' ').slice(0, 200)))
      await ntp.close()

      // Any other page on the site is ignored, and so is a junk key.
      const other = await openSite('https://getstackboard.com/pro/thanks?customer_session_token=polar_cst_none', { keys: { items: [] }, subs: { items: [] } })
      const replies = await other.evaluate((id) => Promise.all([
        new Promise((r) => chrome.runtime.sendMessage(id, { type: 'pro-key', key: 'nope <x>' }, (v) => r(v ?? null))),
      ]), extId)
      await other.close()
      const page2 = await browser.newPage()
      await page2.setRequestInterception(true)
      page2.on('request', (req) => (new URL(req.url()).origin === 'https://getstackboard.com' ? req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }) : req.continue()))
      await page2.goto('https://getstackboard.com/s', { waitUntil: 'load' })
      const fromShare = await page2.evaluate((id) => new Promise((r) => {
        chrome.runtime.sendMessage(id, { type: 'pro-key', key: 'SB-EVIL-0000-0000-0000' }, (v) => r(v ?? null))
        setTimeout(() => r('timeout'), 3000)
      }), extId)
      await page2.close()
      const still = await control.evaluate(async () => (await chrome.storage.sync.get('proKey')).proKey?.key)
      check('pro hand-off: a junk key is refused and other site pages are ignored', JSON.stringify(replies) === JSON.stringify([{ ok: false }]) && still === KEY, JSON.stringify({ replies, fromShare, still }))

      // 0.9.2: Pro for life is a one-time purchase with no subscription, so the page reads the paid
      // order (passing over a refunded one and a yearly one) and hands over a lifetime plan. The
      // next new tab's card says Pro for life, with no renewal row.
      await control.evaluate(async () => {
        // The license first, so no open page tries to free a computer for the old key.
        await chrome.storage.local.remove(['proLicense', 'proCheckout'])
        await chrome.storage.sync.remove(['proKey', 'proSub'])
      })
      await sleep(400)
      const LIFE = '8fc36071-441d-4550-b9f4-5bc55b5d2b85'
      const lifePortal = {
        keys: portal.keys,
        subs: { items: [] },
        orders: { items: [
          { id: 'o-year', status: 'paid', net_amount: 299, total_amount: 299, currency: 'usd', created_at: '2026-11-06T09:30:00Z', product_id: 'yearly', product: { name: 'Stackboard Pro', is_recurring: true } },
          { id: 'o-refund', status: 'refunded', net_amount: 1900, total_amount: 1900, currency: 'usd', created_at: '2026-11-06T09:00:00Z', product_id: LIFE, product: { name: 'Stackboard Pro Lifetime', is_recurring: false } },
          { id: 'o-life', status: 'paid', net_amount: 1900, total_amount: 2071, currency: 'usd', created_at: '2026-11-06T08:41:50Z', product_id: LIFE, product: { name: 'Stackboard Pro Lifetime', is_recurring: false } },
        ] },
      }
      const lifeThanks = await openSite('https://getstackboard.com/pro/thanks?customer_session_token=polar_cst_life', lifePortal)
      const lifeHanded = await until(lifeThanks, () => document.getElementById('handoff')?.classList.contains('on'))
      const lifeCalls = await lifeThanks.evaluate(() => window.__portalCalls.map(([u]) => u.split('?')[0]))
      await lifeThanks.close()
      const lifeSaved = await control.evaluate(async () => chrome.storage.sync.get(['proKey', 'proSub']))
      const ls = lifeSaved.proSub ?? {}
      check(
        'pro hand-off: a Pro for life purchase hands over a lifetime plan from its paid order',
        lifeHanded && lifeSaved.proKey?.key === KEY && ls.lifetime === true && ls.amount === 1900 && ls.currency === 'usd' && ls.startedAt === Date.parse('2026-11-06T08:41:50Z') && !('interval' in ls) && !('periodEnd' in ls) && lifeCalls.includes('/orders/'),
        JSON.stringify({ lifeSaved, lifeCalls }),
      )
      const lifeNtp = await browser.newPage()
      await lifeNtp.setViewport({ width: 1400, height: 900 })
      lifeNtp.on('pageerror', (e) => errors.push(`pro hand-off lifetime ntp: ${e.message}`))
      await lifeNtp.evaluateOnNewDocument(stub)
      await lifeNtp.goto(NTP, { waitUntil: 'load' })
      await lifeNtp.bringToFront()
      await lifeNtp.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      await lifeNtp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
      const lifeOn = await until(lifeNtp, () => document.querySelector('[data-pro]')?.dataset.pro === 'pro' && !!document.querySelector('[data-pro-card]'))
      const lifeCard = await lifeNtp.evaluate(() => ({
        plan: document.querySelector('[data-pro-plan]')?.textContent.trim() ?? null,
        rows: [...document.querySelectorAll('[data-pro-details] dt')].map((d) => d.textContent.trim()),
        buttons: [...document.querySelectorAll('[data-pro-card] button')].map((b) => b.textContent.trim()),
      }))
      check(
        'pro hand-off: the lifetime card says Pro for life, $19 paid once, with no renewal and a purchase to manage',
        lifeOn && lifeCard.plan === 'Pro for life, $19 paid once' && !lifeCard.rows.includes('Renews') && !lifeCard.rows.includes('Ends') && lifeCard.rows.includes('Pro since') && lifeCard.buttons.includes('Manage purchase'),
        JSON.stringify(lifeCard),
      )
      await lifeNtp.close()
      await control.evaluate(() => Promise.all([chrome.storage.sync.remove(['proKey', 'proSub']), chrome.storage.local.remove(['proLicense', 'proCheckout'])]))
      for (const pg of boards) await pg.evaluate(() => { if (window.__fetchBeforeStub) window.fetch = window.__fetchBeforeStub }).catch(() => {})
    }
  }

  // ---------- 0.6.0: to-do stacks ----------
  // A stack folder holding one marker bookmark; the items live in chrome.storage.sync.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const items = (page) => page.evaluate(() => [...document.querySelectorAll('[data-todo-item]')].map((r) => `${r.dataset.todoItem}:${r.textContent.trim()}`))
    const stored = () => control.evaluate(async () => {
      const all = await chrome.storage.sync.get(null)
      return Object.entries(all).filter(([k]) => k.startsWith('todo:')).map(([k, v]) => ({ k, v }))
    })

    // New installs need Pro for a new list (0.7.0); an early user who already had a list when 0.8.0
    // arrived doesn't (the to-do Pro block covers the rest).
    await control.evaluate(() => chrome.storage.sync.set({ proEarly: { from: 'e2e', at: Date.now() }, proEarlyTodo: { keep: true, at: Date.now() } }))
    const page = await openNtp()
    await page.bringToFront()
    await page.evaluate(() => document.querySelector('button[aria-label="Add space"]').click())
    await page.waitForSelector('[role=dialog] input', { timeout: 5000 })
    await page.type('[role=dialog] input', 'Todo test')
    await page.keyboard.press('Enter')
    await until(page, () => document.querySelector('main h1')?.textContent === 'Todo test')
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add empty Stack').click())
    await page.waitForSelector('[role=dialog] [data-option="todo"]', { timeout: 5000 })
    await page.click('[role=dialog] [data-option="todo"]')
    await page.type('[role=dialog] input', 'This week')
    await page.keyboard.press('Enter')
    const made = await until(page, () => !!document.querySelector('[data-todo-input]'))
    check('to-do: a new to-do stack shows its input', made)
    const marker = await control.evaluate(async () => {
      const [folder] = (await chrome.bookmarks.search({ title: 'This week' })).filter((n) => !n.url)
      const kids = folder ? await chrome.bookmarks.getChildren(folder.id) : []
      return kids.map((k) => k.url)
    })
    check('to-do: the folder holds one marker bookmark', marker.length === 1 && /^https:\/\/getstackboard\.com\/todo#[a-z0-9]{16}$/.test(marker[0]), marker.join(' '))
    const listId = marker[0]?.split('#')[1]
    check('to-do: the input takes focus on create', await until(page, () => document.activeElement?.hasAttribute('data-todo-input')))

    await page.keyboard.type('Buy milk')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Call the bank')
    await page.keyboard.press('Enter')
    await until(page, () => document.querySelectorAll('[data-todo-item]').length === 2)
    check('to-do: Enter adds items and keeps focus', JSON.stringify(await items(page)) === JSON.stringify(['open:Buy milk', 'open:Call the bank']) &&
      (await page.evaluate(() => document.activeElement?.hasAttribute('data-todo-input'))), JSON.stringify(await items(page)))
    const s1 = await stored()
    check('to-do: items are saved in storage.sync under todo:<id>', s1.length === 1 && s1[0].k === `todo:${listId}` && s1[0].v.items.length === 2, JSON.stringify(s1))

    await page.evaluate(() => document.querySelector('[data-todo-item] [data-todo-toggle]').click())
    await until(page, () => document.querySelector('[data-todo-item]:last-child')?.dataset.todoItem === 'done')
    check('to-do: a done item sinks below the open ones', JSON.stringify(await items(page)) === JSON.stringify(['open:Call the bank', 'done:Buy milk']), JSON.stringify(await items(page)))
    const head = await page.evaluate(() => [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'This week')?.querySelector('h3 + span')?.textContent)
    check('to-do: the header counts open items', head === '1', String(head))

    // Another tab sees the list, and a change there reaches this tab.
    const other = await openNtp()
    await other.evaluate(() => [...document.querySelectorAll('aside button, nav button, button')].find((b) => b.textContent.includes('Todo test'))?.click())
    const seen = await until(other, () => document.querySelectorAll('[data-todo-item]').length === 2)
    check('to-do: a second tab shows the same items', seen, JSON.stringify(await items(other)))
    await other.evaluate(() => document.querySelector('[data-todo-input]').focus())
    await other.keyboard.type('From tab two')
    await other.keyboard.press('Enter')
    check('to-do: a change in one tab shows in the other', await until(page, () => document.body.innerText.includes('From tab two')))
    await sleep(5500) // let a sweep run while the list is live, so this device records it as seen
    await other.close()

    // Delete with Undo.
    await page.bringToFront()
    await page.evaluate(() => [...document.querySelectorAll('[data-todo-item]')].find((r) => r.textContent.includes('Call the bank')).querySelector('[data-todo-delete]').click())
    await until(page, () => document.querySelector('.toast')?.textContent?.includes('Call the bank'))
    check('to-do: delete removes the item and offers Undo', !(await page.evaluate(() => document.querySelector('main').innerText.includes('Call the bank\n'))) &&
      (await page.evaluate(() => !![...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')))))
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
    check('to-do: Undo puts it back in place', await until(page, () => [...document.querySelectorAll('[data-todo-item]')][0]?.textContent.includes('Call the bank')), JSON.stringify(await items(page)))

    // Clear done from the stack menu.
    await page.evaluate(() => [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'This week').querySelector('button[aria-label="Stack options"]').click())
    await sleep(150)
    const clearBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Clear 1 done')
      b?.click()
      return !!b
    })
    check('to-do: Clear done removes finished items', clearBtn && (await until(page, () => ![...document.querySelectorAll('[data-todo-item]')].some((r) => r.dataset.todoItem === 'done'))))

    // The toolbar popup never offers a to-do stack as a place to save a tab.
    // A popup opened as a tab would try to save itself, so a web tab is highlighted beside it.
    const tdWin = await control.evaluate(async (ntpUrl) => {
      const w = await chrome.windows.create({ url: 'https://example.com/?todo=1', focused: true })
      const pop = await chrome.tabs.create({ windowId: w.id, url: ntpUrl.replace('newtab.html', 'popup.html?todo'), active: true })
      await chrome.tabs.highlight({ windowId: w.id, tabs: [pop.index, 0] })
      return w.id
    }, NTP)
    const popup = await browser.waitForTarget((t) => t.url().endsWith('/popup.html?todo'), { timeout: 10000 }).then((t) => t.page())
    await popup.reload()
    await popup.waitForSelector('[data-popup-title]', { timeout: 10000 })
    await popup.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.querySelector('span.flex-1')?.textContent === 'Todo test')?.click())
    await sleep(300)
    const popupText = await popup.evaluate(() => document.body.innerText)
    check('to-do: the save popup leaves to-do stacks out', popupText.includes('No stacks in this space.') && !popupText.includes('This week'), popupText.slice(0, 200))
    await control.evaluate((id) => chrome.windows.remove(id), tdWin)

    // Deleting the stack, then Undo, brings the same list back (same marker, same items).
    await page.evaluate(() => [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'This week').querySelector('button[aria-label="Stack options"]').click())
    await sleep(150)
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click())
    await until(page, () => document.querySelector('.toast')?.textContent?.includes('This week'))
    const toastText = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
    check('to-do: stack delete toast counts to-dos', toastText.includes('2 to-dos'), toastText)
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
    check('to-do: undoing a stack delete brings its items back', await until(page, () => document.querySelectorAll('[data-todo-item]').length === 2), JSON.stringify(await items(page)))

    // A list whose stack is gone for good is marked on the next new tab, not dropped at once.
    await control.evaluate(async () => {
      const [folder] = (await chrome.bookmarks.search({ title: 'This week' })).filter((n) => !n.url)
      await chrome.bookmarks.removeTree(folder.id)
    })
    const later = await openNtp()
    let marked = null
    for (let t = 0; t < 9000 && !marked; t += 300) {
      const s = await stored()
      marked = s.find((x) => x.k === `todo:${listId}` && typeof x.v.orphanSince === 'number') ?? null
      await sleep(300)
    }
    check('to-do: an orphaned list is marked, its items kept for the grace week', !!marked && marked.v.items.length === 2, JSON.stringify(marked))
    await later.close()

    const perms = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).permissions ?? []
    check('to-do: no new permissions', JSON.stringify(perms) === JSON.stringify(PERMISSIONS), perms.join(' '))
    await page.close()
  }

  // ---------- 0.5.2: writes survive a stuck root lock and say when they fail ----------
  // A Brave user (r/startpages, 2026-10-11) had a frozen Stackboard tab holding 'stackboard-root':
  // every load and create waited forever and the buttons looked dead.
  {
    const holder = await openNtp()
    await holder.evaluate(() => { void navigator.locks.request('stackboard-root', () => new Promise(() => {})) })
    await control.evaluate(() => chrome.storage.local.remove('stackableRootId')) // miss the fast path: load must take the lock
    const t0 = Date.now()
    const page = await openNtp().catch(() => null)
    check('a stuck root lock no longer blocks loading', !!page, `${Date.now() - t0} ms`)
    if (page) {
      await page.evaluate(() => document.querySelector('button[aria-label="Add space"]').click())
      await page.waitForSelector('[role=dialog] input', { timeout: 5000 })
      await page.type('[role=dialog] input', 'Lock test')
      await page.keyboard.press('Enter')
      const made = await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Lock test', { timeout: 10000 }).then(() => true, () => false)
      check('a stuck root lock no longer blocks New space', made)
      await page.evaluate(() => {
        Object.defineProperty(chrome.bookmarks, 'create', { value: () => Promise.reject(new Error('Bookmark write refused')), configurable: true, writable: true })
        document.querySelector('button[aria-label="Add space"]').click()
      })
      await page.waitForSelector('[role=dialog] input', { timeout: 5000 })
      await page.type('[role=dialog] input', 'Will fail')
      await page.keyboard.press('Enter')
      const toast = await page
        .waitForFunction(() => document.querySelector('.toast')?.textContent?.includes("Couldn't create the space"), { timeout: 5000 })
        .then(() => page.evaluate(() => document.querySelector('.toast').textContent), () => null)
      check('a failed write shows the error', !!toast && toast.includes('Bookmark write refused'), String(toast))
      await page.close()
    }
    await holder.close()
  }

  // ---------- 0.7.1: due dates and repeats (Pro) ----------
  // With the trial on, a to-do takes a date and a repeat, shows in Today, and a repeating one
  // moves to its next date when ticked. Without Pro the dates stay visible and the controls go.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const day = (page, plus = 0) => page.evaluate((n) => {
      const d = new Date()
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    }, plus)
    const waitFor = async (fn, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await fn().catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const clickIn = (page, text, sel) => page.evaluate(([t, s]) => {
      const el = [...document.querySelectorAll('[data-todo-item]')].find((r) => r.textContent.includes(t))?.querySelector(s)
      el?.click()
      return !!el
    }, [text, sel])
    const dueOf = (page, text) => page.evaluate((t) => {
      const el = [...document.querySelectorAll('[data-todo-item]')].find((r) => r.textContent.includes(t))?.querySelector('[data-todo-due]')
      return el ? { day: el.dataset.todoDue, repeat: el.dataset.todoRepeat, label: el.textContent } : null
    }, text)
    // 0.8.0: due days sit under todoDue:<id>, apart from the items (todo:<id>); read both back together.
    const storedItems = () => control.evaluate(async () => {
      const all = await chrome.storage.sync.get(null)
      return Object.entries(all)
        .filter(([k]) => k.startsWith('todo:'))
        .flatMap(([k, v]) => (v.items ?? []).map((it) => ({ ...it, ...(all['todoDue:' + k.slice(5)]?.[it.id] ?? {}) })))
    })
    const itemsCarryDue = () => control.evaluate(async () => {
      const all = await chrome.storage.sync.get(null)
      return Object.entries(all).filter(([k]) => k.startsWith('todo:')).some(([, v]) => (v.items ?? []).some((it) => 'd' in it || 'r' in it))
    })

    await control.evaluate(() => chrome.storage.sync.set({ proTrial: { startedAt: Date.now() } }))
    const page = await openNtp()
    await page.bringToFront()
    await page.evaluate(() => document.querySelector('button[aria-label="Add space"]').click())
    await page.waitForSelector('[role=dialog] input', { timeout: 5000 })
    await page.type('[role=dialog] input', 'Due test')
    await page.keyboard.press('Enter')
    await until(page, () => document.querySelector('main h1')?.textContent === 'Due test')
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add empty Stack').click())
    await page.waitForSelector('[role=dialog] [data-option="todo"]', { timeout: 5000 })
    await page.click('[role=dialog] [data-option="todo"]')
    await page.type('[role=dialog] input', 'Chores')
    await page.keyboard.press('Enter')
    await until(page, () => !!document.querySelector('[data-todo-input]'))
    await page.evaluate(() => document.querySelector('[data-todo-input]').focus())
    await page.keyboard.type('Water plants')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Take vitamins')
    await page.keyboard.press('Enter')
    await until(page, () => document.querySelectorAll('[data-todo-item]').length === 2)
    const today = await day(page)
    const tomorrow = await day(page, 1)

    await clickIn(page, 'Water plants', '[data-todo-due-button]')
    await page.waitForSelector('[data-due-menu]', { timeout: 3000 }).catch(() => {})
    await page.evaluate(() => document.querySelector('[data-due-pick="today"]').click())
    const dated = await waitFor(async () => (await dueOf(page, 'Water plants'))?.day === today)
    const label = (await dueOf(page, 'Water plants'))?.label
    check('due: Today from the menu dates the item', dated && label === 'Today', String(label))
    check('due: the date is saved with the item', (await storedItems()).some((i) => i.text === 'Water plants' && i.d === today))
    check('due: the date sits in its own key, never on the items 0.7.0 rewrites', !(await itemsCarryDue()))

    await clickIn(page, 'Take vitamins', '[data-todo-due-button]')
    await page.waitForSelector('[data-due-menu]', { timeout: 3000 }).catch(() => {})
    await page.evaluate(() => document.querySelector('[data-due-repeat="d"]').click())
    await waitFor(async () => (await dueOf(page, 'Take vitamins'))?.repeat === 'd')
    await page.keyboard.press('Escape')
    check('due: a daily repeat starts today', (await storedItems()).some((i) => i.text === 'Take vitamins' && i.d === today && i.r === 'd') &&
      (await until(page, () => !document.querySelector('[data-due-menu]'))))

    const count = await until(page, () => document.querySelector('[data-today-count]')?.textContent === '2')
    check('due: the sidebar shows Today with 2 due', count, await page.evaluate(() => document.querySelector('[data-today-entry]')?.textContent ?? 'no entry'))
    await page.evaluate(() => document.querySelector('[data-today-entry]').click())
    const listed = await until(page, () => {
      const v = document.querySelector('[data-today-view]')
      return !!v && v.innerText.includes('Water plants') && v.innerText.includes('Take vitamins') && v.innerText.includes('Chores')
    })
    check('due: Today lists both, under their list', listed, await page.evaluate(() => document.querySelector('[data-today-view]')?.innerText.slice(0, 160) ?? 'no view'))

    await page.evaluate(() => [...document.querySelectorAll('[data-today-item]')].find((r) => r.textContent.includes('Take vitamins')).querySelector('[data-today-toggle]').click())
    const rolled = await until(page, () => ![...document.querySelectorAll('[data-today-item]')].some((r) => r.textContent.includes('Take vitamins')))
    const vit = (await storedItems()).find((i) => i.text === 'Take vitamins')
    const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
    check('due: ticking a daily item moves it to tomorrow and keeps it open', rolled && vit?.d === tomorrow && vit?.done === false && toast.includes('next due tomorrow'), `${JSON.stringify(vit)} ${toast}`)

    await page.evaluate(() => document.querySelector('[data-today-show]').click())
    check('due: Show in its stack goes back to the space', await until(page, () => document.querySelector('main h1')?.textContent === 'Due test' && !document.querySelector('[data-today-view]')))
    await page.close()

    // Pro off: the dates stay, the controls and Today go.
    await control.evaluate(() => chrome.storage.sync.remove('proTrial'))
    const free = await openNtp()
    await free.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Due test'))?.click())
    await until(free, () => document.querySelectorAll('[data-todo-item]').length === 2)
    const freeState = await free.evaluate(() => ({
      buttons: document.querySelectorAll('[data-todo-due-button]').length,
      due: [...document.querySelectorAll('[data-todo-due]')].map((e) => `${e.tagName}:${e.textContent}`),
      today: !!document.querySelector('[data-today-entry]'),
    }))
    check('due: without Pro the dates still show, the date controls and Today are gone',
      freeState.buttons === 0 && !freeState.today && freeState.due.includes('SPAN:Today') && freeState.due.some((d) => d.endsWith('Tomorrow')), JSON.stringify(freeState))
    await free.close()
  }

  // ---------- 0.7.1: clean up your board (Pro) ----------
  // Copies of one link are found and every extra copy is ticked; removing takes one click and Undo
  // puts it back in place. The reachability check needs no host permission: a dead domain comes
  // back unreachable and a data: link is never checked. Opening a card records the open.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 200) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(200)
      }
      return false
    }
    const made = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🧹 Cleanup test' })
      const one = await chrome.bookmarks.create({ parentId: space.id, title: 'One' })
      const two = await chrome.bookmarks.create({ parentId: space.id, title: 'Two' })
      await chrome.bookmarks.create({ parentId: one.id, title: 'Dup A', url: 'https://cleanup-dup.example.com/page' })
      const b = await chrome.bookmarks.create({ parentId: two.id, title: 'Dup B', url: 'https://CLEANUP-DUP.example.com/page/?utm_source=e2e' })
      await chrome.bookmarks.create({ parentId: two.id, title: 'Dead link', url: 'https://does-not-exist.invalid/' })
      await chrome.bookmarks.create({ parentId: two.id, title: 'Data link', url: 'data:text/plain,hi' })
      await chrome.storage.sync.set({ proTrial: { startedAt: Date.now() } })
      return { space: space.id, two: two.id, dupB: b.id }
    })
    const page = await openNtp()
    await page.bringToFront()
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(page, () => !!document.querySelector('[data-cleanup-open]'))
    await page.evaluate(() => document.querySelector('[data-cleanup-open]').click())
    await until(page, () => [...document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row]')].some((r) => r.textContent.includes('Dup B')))
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row]')]
        .filter((r) => /Dup [AB]/.test(r.textContent))
        .map((r) => ({ id: r.dataset.cleanupRow, checked: r.querySelector('input').checked, name: r.textContent.includes('Dup A') ? 'A' : 'B' })),
    )
    check('clean-up: two copies of one link are found, the second one ticked', rows.length === 2 && rows.find((r) => r.name === 'A')?.checked === false && rows.find((r) => r.name === 'B')?.checked === true, JSON.stringify(rows))

    // Leave only Dup B ticked, then remove it.
    await page.evaluate((keep) => {
      for (const r of document.querySelectorAll('[data-cleanup-row]')) {
        const box = r.querySelector('input')
        if (box.checked !== (r.dataset.cleanupRow === keep)) box.click()
      }
    }, made.dupB)
    await until(page, () => document.querySelector('[data-cleanup-remove]')?.textContent.trim() === 'Remove 1 link')
    await page.evaluate(() => document.querySelector('[data-cleanup-remove]').click())
    await until(page, () => document.querySelector('.toast')?.textContent.includes('Removed'))
    const gone = await control.evaluate(async (two) => (await chrome.bookmarks.getChildren(two)).map((c) => c.title), made.two)
    check('clean-up: removing takes the ticked copy only', !gone.includes('Dup B') && gone.includes('Dead link'), gone.join(', '))
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.trim().startsWith('Undo'))?.click())
    await sleep(1200)
    const back = await control.evaluate(async (two) => (await chrome.bookmarks.getChildren(two)).map((c) => c.title), made.two)
    check('clean-up: Undo puts the copy back where it was', back[0] === 'Dup B', back.join(', '))

    // Reachability: switch lists, check, and only the dead domain comes back.
    await page.evaluate(() => [...document.querySelectorAll('[data-cleanup] [role=radio]')].find((b) => b.textContent.startsWith("Can't be reached"))?.click())
    await until(page, () => !!document.querySelector('[data-cleanup-check]'))
    await page.evaluate(() => document.querySelector('[data-cleanup-check]').click())
    const checked = await until(page, () => !!document.querySelector('[data-cleanup-checked]'), null, 150000)
    const dead = await page.evaluate(() => [...document.querySelectorAll('[data-cleanup-section="dead"] [data-cleanup-row]')].map((r) => r.textContent))
    check(
      'clean-up: a dead domain is unreachable, data: links are skipped, no host permission needed',
      checked && dead.some((t) => t.includes('Dead link')) && !dead.some((t) => t.includes('Data link')),
      `${checked} ${dead.length} rows: ${dead.filter((t) => /Dead|Data/.test(t)).join(' | ').slice(0, 160)}`,
    )

    // Opening a card from the board records the open (the "Unused" list's own signal).
    await page.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Close"]')?.click())
    await control.evaluate(() => chrome.storage.local.remove('open:https://cleanup-dup.example.com/page'))
    const opener = await openNtp()
    await opener.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Cleanup test'))?.click())
    await until(opener, () => [...document.querySelectorAll('a[href]')].some((x) => x.textContent.includes('Dup A')))
    await opener.evaluate(() => {
      const a = [...document.querySelectorAll('a[href]')].find((x) => x.textContent.includes('Dup A'))
      if (a) a.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    })
    await sleep(500)
    const recorded = await control.evaluate(async () => (await chrome.storage.local.get('open:https://cleanup-dup.example.com/page'))['open:https://cleanup-dup.example.com/page'])
    check('clean-up: a middle-click on a card records the open', typeof recorded === 'number', String(recorded))

    // Review fixes 2, 3 and 8 (3 Nov): Undo restores exact positions, Remove acts on the open list
    // only, and Unused stays quiet until six months of counting exist.
    const orderStack = await control.evaluate(async (spaceId) => {
      const st = await chrome.bookmarks.create({ parentId: spaceId, title: 'Order' })
      // data: links are never checked, so these copies stay off the "Can't be reached" list.
      const x = 'data:text/plain,order-x'
      for (const [t, u] of [['X', x], ['Y', 'data:text/plain,order-y'], ['X copy', x], ['Z', 'data:text/plain,order-z'], ['X copy 2', x]]) {
        await chrome.bookmarks.create({ parentId: st.id, title: t, url: u })
      }
      return st.id
    }, made.space)
    const titles = (id) => control.evaluate(async (s) => (await chrome.bookmarks.getChildren(s)).map((c) => c.title), id)
    const label = () => page.evaluate(() => document.querySelector('[data-cleanup-remove]')?.textContent.trim())
    const tab = (name) => page.evaluate((n) => [...document.querySelectorAll('[data-cleanup] [role=radio]')].find((b) => b.textContent.startsWith(n))?.click(), name)
    await page.bringToFront()
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(page, () => !!document.querySelector('[data-cleanup-open]'))
    await page.evaluate(() => document.querySelector('[data-cleanup-open]').click())
    await until(page, () => [...document.querySelectorAll('[data-cleanup-row]')].some((r) => r.textContent.includes('X copy 2')))
    await tab('Unused')
    await until(page, () => !!document.querySelector('[data-cleanup-counting]'))
    const counting = await page.evaluate(() => ({ flag: document.querySelector('[data-cleanup-counting]').dataset.cleanupCounting, rows: document.querySelectorAll('[data-cleanup-section="unused"] [data-cleanup-row]').length }))
    check('clean-up: Unused waits for six months of counting', counting.flag === 'yes' && counting.rows === 0, JSON.stringify(counting))
    await tab("Can't be reached")
    await until(page, () => !!document.querySelector('[data-cleanup-check]'))
    await page.evaluate(() => document.querySelector('[data-cleanup-check]').click())
    await until(page, () => [...document.querySelectorAll('[data-cleanup-section="dead"] [data-cleanup-row]')].some((r) => r.textContent.includes('Dead link')), null, 150000)
    // Tick only Dead link on this list (Dup B is unreachable too, and pre-ticked as a copy).
    await page.evaluate(() => {
      for (const r of document.querySelectorAll('[data-cleanup-section="dead"] [data-cleanup-row]')) {
        const box = r.querySelector('input')
        if (box.checked !== r.textContent.includes('Dead link')) box.click()
      }
    })
    await sleep(300)
    const deadLabel = await label()
    await page.evaluate(() => document.querySelector('[data-cleanup-remove]').click())
    await until(page, () => document.querySelector('.toast')?.textContent.includes('Removed'))
    const afterDead = { two: await titles(made.two), order: await titles(orderStack) }
    check(
      "clean-up: Remove takes the open list's ticks only (the ticked copies elsewhere stay)",
      deadLabel === 'Remove 1 link' && !afterDead.two.includes('Dead link') && afterDead.two.includes('Dup B') && afterDead.order.length === 5,
      `${deadLabel} | ${JSON.stringify(afterDead)}`,
    )
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.trim().startsWith('Undo'))?.click())
    await sleep(1200)
    await tab('Duplicates')
    await until(page, () => !!document.querySelector('[data-cleanup-section="dupes"]'))
    // Tick only the two extra X copies (earlier tests leave other copies on the board, pre-ticked too).
    await page.evaluate(() => {
      for (const r of document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row]')) {
        const box = r.querySelector('input')
        const want = /X copy/.test(r.textContent) && r.textContent.includes('Cleanup test')
        if (box.checked !== want) box.click()
      }
    })
    await sleep(300)
    const dupLabel = await label()
    await page.evaluate(() => document.querySelector('[data-cleanup-remove]').click())
    await until(page, () => document.querySelector('.toast')?.textContent.includes('Removed 2'))
    const removedOrder = await titles(orderStack)
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.trim().startsWith('Undo'))?.click())
    await sleep(1500)
    const restoredOrder = await titles(orderStack)
    check(
      'clean-up: Undo puts several copies back in their exact places',
      dupLabel === 'Remove 2 links' && removedOrder.join(',') === 'X,Y,Z' && restoredOrder.join(',') === 'X,Y,X copy,Z,X copy 2',
      `${dupLabel} | ${removedOrder.join(',')} -> ${restoredOrder.join(',')}`,
    )
    await page.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Close"]')?.click())

    await opener.close()
    await page.close()
    await control.evaluate(async (m) => {
      await chrome.bookmarks.removeTree(m.space)
      await chrome.storage.sync.remove('proTrial')
    }, made)
  }

  // ---------- 0.7.1: AI tidy (Pro) ----------
  // The server is stubbed in the page (fetch override before the app loads), so no request leaves
  // the test and no AI runs. A key is pinned as granted and freshly checked, so Polar isn't asked.
  // Hidden while the server says it's off; then notice, preview, apply and undo on a test space.
  {
    const KEY = 'SB-E2E-0000-TIDY'
    // Pages already open (the control page runs the board too) see the key arrive through storage.
    // Their fetch refuses getstackboard.com and Polar, so they can't reach either for real.
    const deny = () => {
      const real = window.fetch.bind(window)
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url
        if (url.startsWith('https://getstackboard.com/api/') || url.startsWith('https://api.polar.sh/')) return Promise.reject(new TypeError('blocked by the e2e'))
        return real(input, init)
      }
    }
    for (const p of await browser.pages()) {
      if (p.url().startsWith(NTP.slice(0, NTP.lastIndexOf('/')))) await p.evaluate(deny).catch(() => {})
    }
    // `paid`: with the key; without it the board is free (0.9.5, the free tidy). The free tidy starts unused.
    const fresh = async (paid = true) => {
      const id = await control.evaluate(async (key) => {
        const now = Date.now()
        // The license first: a key that arrives without one makes open pages activate it.
        if (key) {
          await chrome.storage.local.set({ proLicense: { key, activationId: 'act-e2e', status: 'granted', checkedAt: now, okAt: now } })
          await chrome.storage.sync.set({ proKey: { key } })
        }
        await chrome.storage.local.remove(['tidyReady', 'tidyNotice2', 'freeTidy'])
        await chrome.storage.sync.remove('freeTidy')
        const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
        const old = (await chrome.bookmarks.getChildren(root.id)).find((k) => k.title.endsWith('Tidy test'))
        if (old) await chrome.bookmarks.removeTree(old.id)
        const space = await chrome.bookmarks.create({ parentId: root.id, title: '🧪 Tidy test' })
        const mixed = await chrome.bookmarks.create({ parentId: space.id, title: 'Mixed' })
        const more = await chrome.bookmarks.create({ parentId: space.id, title: 'More' })
        for (const [p, t, u] of [[mixed, 'Alpha one', 'https://alpha1.example/'], [mixed, 'Beta one', 'https://beta1.example/'], [mixed, 'Alpha two', 'https://alpha2.example/'], [more, 'Beta two', 'https://beta2.example/'], [more, 'Gamma one', 'https://gamma1.example/']]) {
          await chrome.bookmarks.create({ parentId: p.id, title: t, url: u })
        }
        localStorage.setItem('stackable:lastSpaceId', space.id)
        return space.id
      }, paid ? KEY : null)
      return id
    }
    const shapeOf = (spaceId) => control.evaluate(async (id) => {
      const [sub] = await chrome.bookmarks.getSubTree(id)
      return sub.children.map((st) => `${st.title}:${(st.children ?? []).map((b) => b.title).join('+')}`).join(' | ')
    }, spaceId)
    const idsOf = (spaceId) => control.evaluate(async (id) => {
      const [sub] = await chrome.bookmarks.getSubTree(id)
      return sub.children.flatMap((st) => (st.children ?? []).map((b) => b.id)).sort().join(',')
    }, spaceId)
    // The page's fetch answers for getstackboard.com/api/tidy (and Polar, just in case) and records the calls.
    // `answer` 'free-cap' (0.9.5): a run is refused because the day's free tidies are used up.
    const stub = (ready, answer) => {
      const real = window.fetch.bind(window)
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
      window.__tidyCalls = []
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url
        if (url.startsWith('https://getstackboard.com/api/tidy')) {
          const method = (init.method || 'GET').toUpperCase()
          window.__tidyCalls.push(method)
          if (method === 'GET') return json({ ok: true, ready, max: 600 })
          const body = JSON.parse(init.body)
          window.__tidyBody = body
          if (answer === 'free-cap') return json({ ok: false, reason: 'free-cap' }, 429)
          const groups = new Map()
          body.links.forEach((l, i) => {
            const k = new URL(l.url).hostname.split('.')[0].replace(/\d+$/, '')
            groups.set(k, [...(groups.get(k) ?? []), i])
          })
          const stacks = [...groups].map(([name, links]) => ({ name: name[0].toUpperCase() + name.slice(1), links }))
          return json({ ok: true, board: { spaces: [{ name: body.space, emoji: '🧪', stacks }], missing: 0 } })
        }
        if (url.startsWith('https://api.polar.sh/')) return json({ status: 'granted', benefit_id: 'f204b661-dc9b-4ce5-91f5-7cc6559d1617', expires_at: null })
        return real(input, init)
      }
    }
    const openStubbed = async (ready, answer = 'plan') => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`tidy ntp: ${e.message}`))
      await p.evaluateOnNewDocument(stub, ready, answer)
      await p.goto(NTP, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Tidy test', { timeout: 10000 })
      return p
    }
    const until = async (page, fn, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }

    // The server is asked only when Settings (or a space menu) opens, never on a plain new tab.
    const askViaSettings = async (p) => {
      await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
      const got = await until(p, () => window.__tidyCalls.includes('GET'))
      await p.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Close"]')?.click())
      await sleep(300)
      return got
    }

    // Switched off: the button never shows, and the answer is kept for a day.
    const spaceId = await fresh()
    const off = await openStubbed(false)
    await sleep(1500)
    const quiet = await off.evaluate(() => window.__tidyCalls.length === 0)
    check('tidy: a plain new tab asks the server nothing', quiet, await off.evaluate(() => JSON.stringify(window.__tidyCalls)))
    const asked = await askViaSettings(off)
    await sleep(800)
    const hidden = await off.evaluate(() => !document.querySelector('[data-tidy-button]'))
    const kept = await control.evaluate(async () => (await chrome.storage.local.get('tidyReady')).tidyReady?.ready)
    check('tidy: hidden while the server says it is off', asked && hidden && kept === false, JSON.stringify({ asked, hidden, kept }))
    await off.close()

    // Switched on: notice, then the preview, then apply.
    await control.evaluate(() => chrome.storage.local.remove('tidyReady'))
    const before = await shapeOf(spaceId)
    const beforeIds = await idsOf(spaceId)
    const page = await openStubbed(true)
    // 0.9.0: a new key with no answer yet gets the button on a plain new tab, still without asking.
    const early = await until(page, () => !!document.querySelector('[data-tidy-button]'))
    const unasked = await page.evaluate(() => window.__tidyCalls.length === 0)
    check('tidy: with a Pro key and no answer yet, a plain new tab shows the button and asks nothing', early && unasked, await page.evaluate(() => JSON.stringify(window.__tidyCalls)))
    await askViaSettings(page)
    const shown = await until(page, () => !!document.querySelector('[data-tidy-button]'))
    check('tidy: the button shows with a Pro key once the server is on', shown)
    const paidLabel = await page.evaluate(() => document.querySelector('[data-tidy-button]')?.textContent.trim() ?? null)
    await page.evaluate(() => document.querySelector('[data-tidy-button]').click())
    const notice = await until(page, () => !!document.querySelector('[data-tidy-notice]'))
    const noticeText = await page.evaluate(() => document.querySelector('[data-tidy-notice]')?.textContent ?? '')
    check('tidy: the first run says what is sent, links in folders too, before anything is sent', notice && noticeText.includes("Anthropic's AI") && noticeText.includes('including links in folders') && !(await page.evaluate(() => window.__tidyCalls.includes('POST'))), noticeText.slice(0, 80))
    await page.evaluate(() => document.querySelector('[data-tidy-continue]').click())
    const previewed = await until(page, () => document.querySelectorAll('[data-tidy-stack]').length === 3)
    const names = await page.evaluate(() => [...document.querySelectorAll('[data-tidy-stack] input')].map((i) => i.value))
    const sent = await page.evaluate(() => window.__tidyBody)
    check('tidy: the request carries one space, its links and the key', sent?.scope === 'space' && sent?.space === 'Tidy test' && sent?.links?.length === 5 && sent?.license?.key === KEY && sent?.license?.activationId === 'act-e2e', JSON.stringify(sent).slice(0, 160))
    check('tidy: the preview lists the planned stacks before anything moves', previewed && names.join(',') === 'Alpha,Beta,Gamma' && (await shapeOf(spaceId)) === before, names.join(','))
    const remembered = await control.evaluate(async () => (await chrome.storage.local.get('tidyNotice2')).tidyNotice2 === true)
    check('tidy: the notice is remembered', remembered)

    await page.evaluate(() => document.querySelector('[data-tidy-apply]').click())
    let after = ''
    for (let t = 0; t < 40 && after !== 'Alpha:Alpha one+Alpha two | Beta:Beta one+Beta two | Gamma:Gamma one'; t++) {
      await sleep(150)
      after = await shapeOf(spaceId)
    }
    check('tidy: apply makes the stacks and moves the links into them', after === 'Alpha:Alpha one+Alpha two | Beta:Beta one+Beta two | Gamma:Gamma one', after)
    check('tidy: links keep their ids', (await idsOf(spaceId)) === beforeIds)
    const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
    check('tidy: the toast offers Undo', toast.includes('Tidied') && toast.includes('Undo'), toast)
    // 0.9.5: a paid key sees no change: no "free once", no free flag, no free-tidy line, and the free tidy stays unused.
    const paidNote = await page.evaluate(() => !!document.querySelector('.toast [data-toast-note]'))
    const paidMark = await control.evaluate(async () => (await chrome.storage.sync.get('freeTidy')).freeTidy ?? (await chrome.storage.local.get('freeTidy')).freeTidy ?? null)
    check(
      'tidy: a paid key sees Tidy as before: the plain label, its key and no free flag, no free-tidy line, and its free tidy stays unused',
      paidLabel === 'Tidy' && !('free' in (sent ?? {})) && !paidNote && !toast.includes('free tidy') && paidMark === null,
      JSON.stringify({ paidLabel, free: sent?.free, paidNote, paidMark }),
    )

    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
    let back = ''
    for (let t = 0; t < 40 && back !== before; t++) {
      await sleep(150)
      back = await shapeOf(spaceId)
    }
    check('tidy: undo puts the space back exactly', back === before && (await idsOf(spaceId)) === beforeIds, `${back} / ${before}`)
    await page.close()

    await control.evaluate(async (id) => {
      await chrome.bookmarks.removeTree(id)
      // The license goes first, so no open page tries to free a computer for a key that never was.
      await chrome.storage.local.remove(['proLicense', 'tidyReady', 'tidyNotice2'])
      await chrome.storage.sync.remove('proKey')
      localStorage.removeItem('stackable:lastSpaceId')
    }, spaceId)

    // ---------- 0.9.5: one free tidy per Chrome profile ----------
    // A free or trial board (or a paused key) gets "Tidy (free once)" where a paid key has Tidy. It sends
    // the same space with free: true and no key. Once the server has sorted the space it counts as used
    // (sync freeTidy), its toast says so with See Pro, and the button is gone for good. An answer that
    // the day's free tidies are used up says so and leaves it unused.
    const freeMark = () => control.evaluate(async () => (await chrome.storage.sync.get('freeTidy')).freeTidy ?? (await chrome.storage.local.get('freeTidy')).freeTidy ?? null)
    const toastText = (p) => p.evaluate(() => document.querySelector('.toast')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
    const freeLabel = (p) => until(p, () => document.querySelector('[data-tidy-button]')?.textContent.trim() === 'Tidy (free once)')
    // Settings opened and closed again; what it asked the server meanwhile.
    const settingsCalls = async (p) => {
      await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
      await until(p, () => !!document.querySelector('[data-pro]'))
      await sleep(1200)
      const calls = await p.evaluate(() => window.__tidyCalls.slice())
      await p.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Close"]')?.click())
      await sleep(300)
      return calls
    }
    const tidied = 'Alpha:Alpha one+Alpha two | Beta:Beta one+Beta two | Gamma:Gamma one'

    // 1. A free board: the free entry, the run, the toast's line, See Pro, and then no entry.
    const freeId = await fresh(false)
    const freeBefore = await shapeOf(freeId)
    const fp = await openStubbed(true)
    const offered = await freeLabel(fp)
    check('free tidy: a free board shows Tidy (free once), and a plain new tab asks the server nothing', offered && (await fp.evaluate(() => window.__tidyCalls.length === 0)), JSON.stringify(await fp.evaluate(() => window.__tidyCalls)))
    check('free tidy: until it is used, Settings asks the server whether Tidy is on for a free board too', (await settingsCalls(fp)).join() === 'GET')
    await fp.evaluate(() => document.querySelector('[data-tidy-button]').click())
    const freeNotice = await until(fp, () => !!document.querySelector('[data-tidy-notice]'))
    await fp.evaluate(() => document.querySelector('[data-tidy-continue]')?.click())
    const freePreview = await until(fp, () => document.querySelectorAll('[data-tidy-stack]').length === 3)
    const freeSent = await fp.evaluate(() => window.__tidyBody)
    check(
      'free tidy: after the notice it sends the same space with free: true and no key',
      freeNotice && freePreview && freeSent?.free === true && !('license' in freeSent) && freeSent.scope === 'space' && freeSent.space === 'Tidy test' && freeSent.links?.length === 5,
      JSON.stringify(freeSent).slice(0, 160),
    )
    let usedAt = null
    for (let t = 0; t < 20 && !usedAt; t++) {
      usedAt = await freeMark()
      if (!usedAt) await sleep(150)
    }
    const atPreview = await fp.evaluate(() => ({ button: !!document.querySelector('[data-tidy-button]'), stacks: document.querySelectorAll('[data-tidy-stack]').length }))
    check(
      'free tidy: it counts as used once the server has sorted the space, and the preview stays up with nothing moved yet',
      typeof usedAt?.at === 'number' && !atPreview.button && atPreview.stacks === 3 && (await shapeOf(freeId)) === freeBefore,
      JSON.stringify({ usedAt, atPreview }),
    )
    await fp.evaluate(() => document.querySelector('[data-tidy-apply]').click())
    let freeAfter = ''
    for (let t = 0; t < 40 && freeAfter !== tidied; t++) {
      await sleep(150)
      freeAfter = await shapeOf(freeId)
    }
    const noted = await until(fp, () => !!document.querySelector('.toast [data-toast-note]'))
    const ft = await toastText(fp)
    check(
      'free tidy: Apply tidies the space, and its toast adds "That was your free tidy. Pro tidies any space, any time." with See Pro',
      freeAfter === tidied && noted && ft.includes('Tidied') && ft.includes('Undo') && ft.includes('That was your free tidy. Pro tidies any space, any time. See Pro'),
      JSON.stringify({ freeAfter, ft }),
    )
    await fp.screenshot({ path: path.join(SHOTS, '095-free-tidy.png') })
    check('free tidy: then the entry is gone from the space header', await fp.evaluate(() => !document.querySelector('[data-tidy-button]')))
    await fp.evaluate(() => document.querySelector('.toast [data-toast-note] button')?.click())
    check('free tidy: See Pro opens Settings at Stackboard Pro', await until(fp, () => !!document.querySelector('[role=dialog] [data-pro]')))
    await fp.close()
    const fp2 = await openStubbed(true)
    await sleep(1500)
    const later = { button: await fp2.evaluate(() => !!document.querySelector('[data-tidy-button]')), calls: await settingsCalls(fp2) }
    check('free tidy: a new tab has no Tidy either, and Settings no longer asks the server', !later.button && !later.calls.length, JSON.stringify(later))
    await fp2.close()

    // 2. The day's free tidies are used up: it says so, and the free tidy stays unused.
    await control.evaluate(async () => {
      await chrome.storage.sync.remove('freeTidy')
      await chrome.storage.local.remove('freeTidy')
    })
    const cp = await openStubbed(true, 'free-cap')
    await freeLabel(cp)
    await cp.evaluate(() => document.querySelector('[data-tidy-button]')?.click()) // the notice was accepted in step 1
    const capped = await until(cp, () => (document.querySelector('.toast')?.textContent ?? '').includes('Free tidies are used up for today. Try again tomorrow.'))
    await sleep(400)
    const cap = { asked: await cp.evaluate(() => window.__tidyBody?.free === true), mark: await freeMark(), label: await cp.evaluate(() => document.querySelector('[data-tidy-button]')?.textContent.trim() ?? null) }
    check(
      'free tidy: when the day\'s free tidies are used up it says "Free tidies are used up for today. Try again tomorrow." and the free tidy stays unused',
      capped && cap.asked && cap.mark === null && cap.label === 'Tidy (free once)',
      JSON.stringify(cap),
    )
    await cp.close()

    // 3. A trial board gets it once too. A preview closed without Apply moves nothing, still uses it, and says so.
    const trialId = await fresh(false)
    await control.evaluate(() => chrome.storage.sync.set({ proTrial: { startedAt: Date.now() - 2 * 86400000 } }))
    const trialBefore = await shapeOf(trialId)
    const tp = await openStubbed(true)
    const trialOffered = await freeLabel(tp)
    const onTrial = await tp.evaluate(() => !!document.querySelector('[data-tidy-free]'))
    await tp.evaluate(() => document.querySelector('[data-tidy-button]').click())
    await until(tp, () => !!document.querySelector('[data-tidy-notice]'))
    await tp.evaluate(() => document.querySelector('[data-tidy-continue]')?.click())
    const trialPreview = await until(tp, () => document.querySelectorAll('[data-tidy-stack]').length === 3)
    const trialSent = await tp.evaluate(() => window.__tidyBody)
    await tp.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Cancel')?.click())
    const cancelled = await until(tp, () => !!document.querySelector('.toast [data-toast-note]'))
    const trialAfter = { toast: await toastText(tp), mark: await freeMark(), button: await tp.evaluate(() => !!document.querySelector('[data-tidy-button]')), same: (await shapeOf(trialId)) === trialBefore }
    check(
      'free tidy: a trial board gets it once too; a preview closed without Apply moves nothing, still uses it, and the toast says so',
      trialOffered && onTrial && trialPreview && trialSent?.free === true && !('license' in trialSent) && cancelled && trialAfter.toast === 'That was your free tidy. Pro tidies any space, any time. See Pro' && typeof trialAfter.mark?.at === 'number' && !trialAfter.button && trialAfter.same,
      JSON.stringify({ trialOffered, onTrial, free: trialSent?.free, ...trialAfter }),
    )
    await tp.close()

    // The rest of the suite runs with the free tidy used, as it began.
    await control.evaluate(async (id) => {
      await chrome.bookmarks.removeTree(id).catch(() => {})
      await chrome.storage.sync.remove('proTrial')
      await chrome.storage.local.remove(['tidyReady', 'tidyNotice2', 'freeTidy'])
      await chrome.storage.sync.set({ freeTidy: { at: Date.now() } })
      localStorage.removeItem('stackable:lastSpaceId')
    }, trialId)
  }

  // ---------- 0.9.0: looks (time of day, moving wallpapers, stack colours, try-on) ----------
  // Pro looks gain time of day (light from 07:00, dark from 19:00, by the clock) and three slowly
  // moving wallpapers. A stack takes one of Chrome's tab-group colours from a marker bookmark in its
  // folder and an icon from its title. Without Pro every looks control is a try-on: the board shows
  // it while Settings (or the colour dialog) is open, nothing is saved, and the trial keeps it.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const was = await control.evaluate(async () => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey']),
      local: await chrome.storage.local.get(['looks', 'appearance', 'proLicense']),
      mirror: localStorage.getItem('stackable:appearance'),
      lastSpace: localStorage.getItem('stackable:lastSpaceId'),
    }))
    // A board page whose clock reads `hour` (null: the real one). The boot script and the app both
    // ask Date, and __boot keeps the scheme the boot script painted before any module ran.
    const openAt = async (hour = null) => {
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })
      page.on('pageerror', (e) => errors.push(`looks: ${e.message}`))
      await page.evaluateOnNewDocument((h) => {
        if (h !== null) Date.prototype.getHours = function () { return h }
        document.addEventListener('readystatechange', () => {
          if (document.readyState === 'interactive' && !window.__boot) window.__boot = document.documentElement.dataset.scheme
        })
      }, hour)
      await page.goto(NTP, { waitUntil: 'load' })
      await page.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      await page.bringToFront()
      await sleep(500)
      return page
    }
    const look = (page) =>
      page.evaluate(() => {
        const d = document.documentElement.dataset
        const before = getComputedStyle(document.body, '::before')
        return { scheme: d.scheme, mode: d.mode, font: d.font, bg: d.bg, wallpaper: d.wallpaper ?? null, anim: before.animationName, dur: before.animationDuration, boot: window.__boot ?? null }
      })
    const openSettings = async (page) => {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
      await page.waitForSelector('[data-pro-looks]', { timeout: 5000 })
    }
    const escape = (page) => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    const click = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); el?.click(); return !!el }, sel)
    const stored = () => control.evaluate(async () => ({ looks: (await chrome.storage.local.get('looks')).looks ?? null, mode: (await chrome.storage.local.get('appearance')).appearance?.mode, mirror: JSON.parse(localStorage.getItem('stackable:appearance') || 'null')?.look ?? null }))
    const MODE_TIME = '[role=radiogroup][aria-label="Mode"] [data-option="time"]'

    // A free board on Light, nothing saved for Pro. The free background stays as it is: a Pro
    // wallpaper shows in its place, and swapping a picture off and on makes open tabs reload it.
    await control.evaluate(async () => {
      await chrome.storage.sync.remove(['proTrial', 'proKey'])
      await chrome.storage.local.remove(['proLicense', 'looks'])
      const a = (await chrome.storage.local.get('appearance')).appearance ?? {}
      await chrome.storage.local.set({ appearance: { ...a, mode: 'light', palette: 'stackboard' } })
    })
    await sleep(300)

    // 1. Try-on without Pro: picks show, nothing is saved, closing Settings puts the free look back.
    const p1 = await openAt(22)
    await openSettings(p1)
    await click(p1, '[data-font-option="mono"]')
    await click(p1, MODE_TIME)
    await click(p1, '[data-wallpaper-option="drift"]')
    await sleep(300)
    const tried = await look(p1)
    const keep = await p1.evaluate(() => document.querySelector('[data-looks-keep]')?.textContent ?? '')
    // A picture background steps aside for a wallpaper being tried, as it does for a saved one.
    const noPicture = await p1.evaluate(() => !document.querySelector('[data-backdrop]'))
    check(
      'looks try-on: a free user sees the Pro picks on the board while Settings is open',
      tried.font === 'mono' && tried.mode === 'time' && tried.scheme === 'dark' && tried.wallpaper === 'drift' && tried.anim === 'wp-drift' && noPicture && keep.includes('Keep this look') && keep.includes('Start free trial'),
      JSON.stringify({ tried, keep, noPicture }),
    )
    const s1 = await stored()
    check('looks try-on: nothing is saved', s1.looks === null && s1.mode === 'light' && s1.mirror?.font !== 'mono' && !s1.mirror?.timeOfDay && !s1.mirror?.wallpaper, JSON.stringify(s1))
    await escape(p1)
    await until(p1, () => !document.querySelector('[data-pro-looks]'))
    await sleep(300)
    const back = await look(p1)
    check('looks try-on: closing Settings puts the free look back', back.font === 'default' && back.mode === 'light' && back.scheme === 'light' && back.wallpaper === null, JSON.stringify(back))

    // 2. Starting the trial from the try-on keeps the look.
    await openSettings(p1)
    await click(p1, '[data-font-option="serif"]')
    await until(p1, () => !!document.querySelector('[data-looks-keep] button'))
    await click(p1, '[data-looks-keep] button')
    const started = await until(p1, () => document.querySelector('[data-pro-looks]')?.dataset.proLooks === 'on')
    await escape(p1)
    await sleep(500)
    const kept = await look(p1)
    const s2 = await stored()
    check('looks try-on: starting the trial from it keeps the look', started && kept.font === 'serif' && s2.looks?.font === 'serif' && s2.mirror?.font === 'serif', JSON.stringify({ started, kept, s2 }))
    await p1.close()

    // 3. Time of day with Pro: saved, light by day and dark by night from the first frame.
    const p2 = await openAt(10)
    await openSettings(p2)
    await click(p2, MODE_TIME)
    await sleep(400)
    await escape(p2)
    await sleep(300)
    // Every open board tab rewrites the boot mirror when the look changes, and a busy background tab can
    // land last for a moment: give the mirror up to 5 s to settle before reading it or opening a tab.
    let s3 = await stored()
    for (let t = 0; t < 5000 && s3.mirror?.timeOfDay !== true; t += 250) {
      await sleep(250)
      s3 = await stored()
    }
    await p2.close()
    const day = await openAt(10)
    const atDay = await look(day)
    await day.close()
    const night = await openAt(22)
    const atNight = await look(night)
    check(
      'time of day: saved with Pro, the free mode underneath goes back to System',
      s3.looks?.timeOfDay === true && s3.mode === 'system' && s3.mirror?.timeOfDay === true,
      JSON.stringify(s3),
    )
    check(
      'time of day: light by day and dark by night, from the first frame',
      atDay.scheme === 'light' && atDay.boot === 'light' && atDay.mode === 'time' && atNight.scheme === 'dark' && atNight.boot === 'dark',
      JSON.stringify({ atDay, atNight }),
    )

    // 4. A moving wallpaper: a slow loop, held still under reduced motion.
    await openSettings(night)
    await click(night, '[data-wallpaper-option="tide"]')
    await sleep(300)
    await escape(night)
    await sleep(300)
    const moving = await look(night)
    await night.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await sleep(200)
    const still = await look(night)
    await night.emulateMediaFeatures([])
    check(
      'moving wallpapers: a slow loop behind the board, still under reduced motion',
      moving.wallpaper === 'tide' && moving.bg === 'wallpaper' && moving.anim === 'wp-tide' && moving.dur === '120s' && still.anim === 'none' && (await stored()).looks?.wallpaper === 'tide',
      JSON.stringify({ moving, still }),
    )
    await night.close()

    // 5. Stack colours and icons. Time of day and the wallpaper off again, so the board is plain.
    await control.evaluate(async () => {
      const l = (await chrome.storage.local.get('looks')).looks ?? {}
      delete l.timeOfDay
      await chrome.storage.local.set({ looks: { ...l, wallpaper: null, font: 'default' } })
    })
    const made = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🎨 Colour test' })
      const stack = await chrome.bookmarks.create({ parentId: space.id, title: 'Docs' })
      await chrome.bookmarks.create({ parentId: stack.id, title: 'Example', url: 'https://example.com/colour' })
      localStorage.setItem('stackable:lastSpaceId', space.id)
      return { space: space.id, stack: stack.id }
    })
    const p3 = await openAt()
    await until(p3, () => document.querySelector('main h1')?.textContent === 'Colour test')
    const openStyle = async (page) => {
      await page.evaluate((id) => document.querySelector(`#stack-${id} [aria-label="Stack options"]`).click(), made.stack)
      await until(page, () => !!document.querySelector('[data-stack-style]'))
      await click(page, '[data-stack-style]')
      await page.waitForSelector('[data-stack-style-dialog]', { timeout: 5000 })
    }
    const header = (page) =>
      page.evaluate((id) => {
        const chip = document.querySelector(`#stack-${id} h3 [data-stack-color]`)
        return {
          title: document.querySelector(`#stack-${id} h3`)?.textContent ?? null,
          color: chip?.dataset.stackColor ?? null,
          bg: chip ? getComputedStyle(chip).backgroundColor : null,
          scheme: document.documentElement.dataset.scheme,
          links: document.querySelectorAll(`#stack-${id} [data-card]`).length,
        }
      }, made.stack)
    const folder = () => control.evaluate(async (id) => ({ title: (await chrome.bookmarks.get(id))[0].title, kids: (await chrome.bookmarks.getChildren(id)).map((k) => k.url) }), made.stack)

    await openStyle(p3)
    await click(p3, '[data-stack-color-option="blue"]')
    await click(p3, '[data-stack-icon-option="📚"]')
    await p3.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Save').click())
    await until(p3, () => !document.querySelector('[data-stack-style-dialog]'))
    await until(p3, (id) => !!document.querySelector(`#stack-${id} h3 [data-stack-color="blue"]`), made.stack)
    const f1 = await folder()
    const h1 = await header(p3)
    const blue = h1.scheme === 'dark' ? 'rgb(138, 180, 248)' : 'rgb(26, 115, 232)'
    check(
      'stack colours: Colour and icon saves a marker bookmark and the icon in the title',
      f1.title === '📚 Docs' && f1.kids.includes('https://getstackboard.com/stack#c=blue') && f1.kids.length === 2,
      JSON.stringify(f1),
    )
    check('stack colours: the header shows the colour, and the marker is no link', h1.color === 'blue' && h1.bg === blue && h1.links === 1, JSON.stringify(h1))

    // Opening the stack as tabs makes a group in its colour.
    await p3.evaluate((id) => document.querySelector(`#stack-${id} button[aria-label^="Open all"]`).click(), made.stack)
    let group = null
    for (let t = 0; t < 30 && !group; t++) {
      await sleep(200)
      group = await control.evaluate(async () => (await chrome.tabGroups.query({ title: '📚 Docs' }))[0] ?? null)
    }
    check('stack colours: opening the stack as tabs makes a group in its colour', group?.color === 'blue', JSON.stringify(group))
    if (group) await control.evaluate(async (gid) => chrome.tabs.remove((await chrome.tabs.query({ groupId: gid })).map((t) => t.id)), group.id)
    await p3.bringToFront()

    // Without Pro the colour hides and the marker stays; the dialog becomes a try-on.
    await control.evaluate(() => chrome.storage.sync.remove(['proTrial', 'proKey']))
    await until(p3, (id) => !document.querySelector(`#stack-${id} h3 [data-stack-color]`), made.stack)
    const h2 = await header(p3)
    check('stack colours: without Pro the colour hides and the marker stays', h2.color === null && h2.title === '📚 Docs' && (await folder()).kids.includes('https://getstackboard.com/stack#c=blue'), JSON.stringify(h2))
    await openStyle(p3)
    await click(p3, '[data-stack-color-option="red"]')
    await sleep(300)
    const trying = await header(p3)
    const tryLine = await p3.evaluate(() => document.querySelector('[data-stack-color-try]')?.textContent ?? '')
    await p3.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Cancel').click())
    await until(p3, () => !document.querySelector('[data-stack-style-dialog]'))
    await sleep(300)
    const after = await header(p3)
    check(
      'stack colours: a free user tries a colour on the stack, and Cancel puts it back',
      trying.color === 'red' && tryLine.includes('Keep this colour') && after.color === null && (await folder()).kids.includes('https://getstackboard.com/stack#c=blue'),
      JSON.stringify({ trying, tryLine, after }),
    )
    await p3.close()

    // Put back what the blocks after this one expect.
    await control.evaluate(async (w) => {
      await chrome.storage.sync.remove(['proTrial', 'proKey'])
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      await chrome.storage.local.remove(['looks', 'appearance', 'proLicense'])
      if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
      if (w.mirror === null) localStorage.removeItem('stackable:appearance')
      else localStorage.setItem('stackable:appearance', w.mirror)
      if (w.lastSpace === null) localStorage.removeItem('stackable:lastSpaceId')
      else localStorage.setItem('stackable:lastSpaceId', w.lastSpace)
    }, was)
    await control.evaluate((id) => chrome.bookmarks.removeTree(id), made.space)
    await sleep(400)
  }

  // ---------- 0.8.0: Teams company space ----------
  // An IT admin's Chrome policy (here the unpacked-build override, which stands in for
  // chrome.storage.managed) puts read-only company spaces first, plus one announcement line.
  // ManagedBookmarks can't be set from a test; the unit tests cover that folder.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'))
    check('teams: the manifest ships a managed storage schema', mf.storage?.managed_schema === 'managed_schema.json' && fs.existsSync(path.join(EXT, 'managed_schema.json')), JSON.stringify(mf.storage))

    const policy = {
      companyName: 'Acme',
      spaces: [
        { name: 'Acme Company', emoji: '🏢', stacks: [{ name: 'Tools', links: [{ title: 'Acme Example', url: 'https://example.com/' }, { title: 'Bad', url: 'javascript:alert(1)' }] }] },
        { name: 'Acme Sales', emoji: '💼', stacks: [{ name: 'CRM', links: [{ title: 'CRM', url: 'https://example.org/crm' }] }] },
      ],
      announcement: { id: 'e2e-1', text: 'Benefits enrolment closes Friday', url: 'https://example.com/benefits' },
    }
    await control.evaluate((p) => localStorage.setItem('stackable:managedOverride', JSON.stringify(p)), policy)
    const page = await openNtp()
    await page.bringToFront()
    const side = await page.evaluate(() => {
      const group = document.querySelector('[data-company-group]')
      const own = [...document.querySelectorAll('aside span')].find((s) => s.textContent.trim() === 'Spaces')
      return {
        label: group?.textContent ?? '',
        rows: [...document.querySelectorAll('[data-company-space]')].map((r) => r.dataset.companySpace),
        first: !!group && !!own && !!(group.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING),
      }
    })
    check('teams: company spaces come first, in policy order, under the company name', side.first && side.label.includes('Acme') && side.rows.join('|') === 'Acme Company|Acme Sales', JSON.stringify(side))

    await page.evaluate(() => document.querySelector('[data-company-space="Acme Company"] button').click())
    await until(page, () => document.querySelector('main h1')?.textContent === 'Acme Company')
    const ro = await page.evaluate(() => ({
      hint: !!document.querySelector('[data-company-hint]'),
      addStack: [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Add empty Stack'),
      addBookmark: [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Add bookmark'),
      stackMenu: !!document.querySelector('main [aria-label="Stack options"]'),
      cardMenu: !!document.querySelector('main [aria-label="Bookmark options"]'),
      dragHeader: !!document.querySelector('main [aria-label="Drag stack header"]'),
      grab: !!document.querySelector('main .cursor-grab'),
      stacks: document.querySelectorAll('main [data-readonly-stack]').length,
      cards: [...document.querySelectorAll('main [data-readonly-card] a')].map((a) => a.getAttribute('href')),
    }))
    check('teams: a company space is read-only (no add, edit, delete or drag handles)', ro.hint && !ro.addStack && !ro.addBookmark && !ro.stackMenu && !ro.cardMenu && !ro.dragHeader && !ro.grab && ro.stacks === 1, JSON.stringify(ro))
    check('teams: only http(s) policy links show', JSON.stringify(ro.cards) === JSON.stringify(['https://example.com/']), JSON.stringify(ro.cards))

    // A real mouse drag on a company card lifts nothing.
    const box = await page.evaluate(() => {
      const r = document.querySelector('main [data-readonly-card]').getBoundingClientRect()
      return { x: r.x + 30, y: r.y + r.height / 2 }
    })
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await page.mouse.move(box.x + 40, box.y + 60, { steps: 6 })
    const lifted = await page.evaluate(() => !!document.querySelector('[data-drop-slot], [data-lifted]'))
    await page.mouse.up()
    check('teams: company cards can\'t be dragged', !lifted)

    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('3')
    const third = await until(page, () => !!document.querySelector('main h1') && !document.querySelector('[data-company-hint]'))
    await page.keyboard.press('2')
    const second = await until(page, () => document.querySelector('main h1')?.textContent === 'Acme Sales')
    check('teams: keys 1-9 count company spaces first', third && second)

    await page.evaluate(() => document.querySelector('input[aria-label="Search all spaces"]').focus())
    await page.keyboard.type('Acme Example')
    const found = await until(page, () => [...document.querySelectorAll('main [data-readonly-card] a')].some((a) => a.getAttribute('href') === 'https://example.com/'))
    check('teams: search finds company links', found)
    await page.keyboard.press('Escape')

    const bar = await page.evaluate(() => {
      const b = document.querySelector('[data-announcement]')
      return b ? { text: b.textContent, link: b.querySelector('a')?.getAttribute('href') } : null
    })
    check('teams: the announcement line shows with its link', !!bar && bar.text.includes('Benefits enrolment closes Friday') && bar.link === 'https://example.com/benefits', JSON.stringify(bar))
    await page.evaluate(() => document.querySelector('[data-announcement] button[aria-label="Dismiss announcement"]').click())
    const gone = await until(page, () => !document.querySelector('[data-announcement]'))
    await page.close()
    const again = await openNtp()
    await sleep(600)
    check('teams: a dismissed announcement stays dismissed on new tabs', gone && (await again.evaluate(() => !document.querySelector('[data-announcement]'))))
    await again.close()

    await control.evaluate((p) => localStorage.setItem('stackable:managedOverride', JSON.stringify({ ...p, announcement: { id: 'e2e-2', text: 'Office closed Monday', dismissible: false } })), policy)
    const pinned = await openNtp()
    const pin = await pinned
      .waitForSelector('[data-announcement="e2e-2"]', { timeout: 5000 })
      .then(() => pinned.evaluate(() => !document.querySelector('[data-announcement] button')), () => null)
    check('teams: a pinned announcement shows with no dismiss button', pin === true, String(pin))
    await pinned.close()

    const pop = await browser.newPage()
    await pop.goto(NTP.replace('newtab.html', 'popup.html'))
    await sleep(1500)
    const popText = await pop.evaluate(() => document.body.innerText)
    check('teams: the save popup never offers company spaces', !popText.includes('Acme Company') && !popText.includes('Acme Sales'))
    await pop.close()

    await control.evaluate(() => localStorage.removeItem('stackable:managedOverride'))
    const after = await openNtp()
    await sleep(400)
    check('teams: with no policy the company group and line go away', await after.evaluate(() => !document.querySelector('[data-company-group]') && !document.querySelector('[data-announcement]')))
    await after.close()
  }

  // ---------- 0.9.0: Today strip, spaces by time, command bar (Pro) ----------
  // With the trial on: the Today strip (switched on in Settings) shows the day's focus and the
  // to-dos due today, ticks them in their lists and sends "+N more" to Today; a time rule opens
  // a new tab on its space, never switching a tab already open; Ctrl+K opens the command bar,
  // finds a space and runs Open Settings. Without Pro the strip hides and Ctrl+K goes to search.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const LIST = 'stripe2etest0001'
    const was = await control.evaluate(async () => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey', 'todayStrip', 'todayFocus', 'spaceSchedule']),
      last: localStorage.getItem('stackable:lastSpaceId'),
    }))
    const day = await control.evaluate(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
    // Lists from earlier blocks keep their due days aside meanwhile, so the strip shows this list alone.
    const otherDue = await control.evaluate(async () => {
      const all = await chrome.storage.sync.get(null)
      const due = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('todoDue:')))
      await chrome.storage.sync.remove(Object.keys(due))
      return due
    })
    // Two spaces; one holds a to-do list with four items due today and one due later.
    const made = await control.evaluate(async ([list, today]) => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const strip = await chrome.bookmarks.create({ parentId: root.id, title: '\u{1F5D3}\u{FE0F} Strip test' })
      const rule = await chrome.bookmarks.create({ parentId: root.id, title: '\u{1F9ED} Rule test' })
      const stack = await chrome.bookmarks.create({ parentId: strip.id, title: 'Chores' })
      await chrome.bookmarks.create({ parentId: stack.id, title: 'Stackboard to-do list', url: `https://getstackboard.com/todo#${list}` })
      const it = (n, text) => ({ id: `i${n}`, text, done: false, at: Date.now() + n })
      await chrome.storage.sync.remove(['proKey', 'todayStrip', 'todayFocus', 'spaceSchedule'])
      await chrome.storage.sync.set({
        [`todo:${list}`]: { v: 1, items: [it(1, 'Pay rent'), it(2, 'Call mum'), it(3, 'Water plants'), it(4, 'Book dentist'), it(5, 'Later thing')] },
        [`todoDue:${list}`]: { i1: { d: today }, i2: { d: today }, i3: { d: today }, i4: { d: today }, i5: { d: '2099-01-01' } },
        proTrial: { startedAt: Date.now() },
      })
      return { strip: strip.id, rule: rule.id }
    }, [LIST, day])
    const goTo = (page, name) => page.evaluate((n) => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes(n))?.click(), name)
    const strip = (page) => page.evaluate(() => {
      const el = document.querySelector('[data-today-strip]')
      return el
        ? {
            focus: el.querySelector('[data-today-focus]')?.value ?? null,
            items: [...el.querySelectorAll('[data-today-strip-item]')].map((r) => r.textContent.trim()),
            more: el.querySelector('[data-today-more]')?.textContent ?? '',
          }
        : null
    })

    const page = await openNtp()
    await page.bringToFront()
    await goTo(page, 'Strip test')
    await until(page, () => document.querySelector('main h1')?.textContent === 'Strip test')
    await sleep(500)
    check('today strip: off until switched on', !(await strip(page)))
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    const toggled = await until(page, () => {
      const on = document.querySelector('[data-today-strip-setting] [data-option="on"]')
      on?.click()
      return !!on
    })
    const stored = await control.evaluate(async () => (await chrome.storage.sync.get('todayStrip')).todayStrip)
    check('today strip: Settings switches it on, synced', toggled && stored?.on === true, JSON.stringify(stored))
    const keys = await page.evaluate(() => document.querySelector('[data-keys]')?.textContent ?? '')
    check('command bar: Settings > Keys lists it as Pro', keys.includes('Command bar') && keys.includes('(Pro)'), keys.slice(0, 200))
    await page.keyboard.press('Escape')
    await until(page, () => !document.querySelector('[role=dialog]'))
    await until(page, () => document.querySelectorAll('[data-today-strip-item]').length === 3)
    const s1 = await strip(page)
    check('today strip: three due to-dos, the fourth as +1 more, the later one left out', !!s1 && s1.items.join('|') === 'Pay rent|Call mum|Water plants' && s1.more === '+1 more', JSON.stringify(s1))
    await page.screenshot({ path: path.join(SHOTS, '90-today-strip.png') })

    await page.click('[data-today-focus]')
    await page.keyboard.type('Ship the strip')
    await page.keyboard.press('Enter')
    let focus = null
    for (let t = 0; t < 4000 && !focus; t += 150) {
      focus = (await control.evaluate(async () => (await chrome.storage.sync.get('todayFocus')).todayFocus)) ?? null
      if (!focus) await sleep(150)
    }
    check("today strip: the focus line saves for today's date", focus?.day === day && focus?.text === 'Ship the strip', JSON.stringify(focus))
    const second = await openNtp()
    await goTo(second, 'Strip test')
    const kept = await until(second, () => document.querySelector('[data-today-focus]')?.value === 'Ship the strip')
    check('today strip: the focus shows on the next new tab', kept)
    await control.evaluate(() => chrome.storage.sync.set({ todayFocus: { day: '2000-01-01', text: 'Ship the strip' } }))
    check("today strip: yesterday's focus is an empty line today", await until(second, () => document.querySelector('[data-today-focus]')?.value === ''))
    await second.close()

    await page.bringToFront()
    await page.evaluate(() => document.querySelector('[data-today-more]').click())
    check('today strip: +1 more opens the Today list', await until(page, () => !!document.querySelector('[data-today-view]')))
    await goTo(page, 'Strip test')
    await until(page, () => !!document.querySelector('[data-today-strip-toggle]'))
    await page.evaluate(() => document.querySelector('[data-today-strip-toggle]').click())
    let ticked = false
    for (let t = 0; t < 5000 && !ticked; t += 150) {
      ticked = await control.evaluate(async (list) => !!(await chrome.storage.sync.get(`todo:${list}`))[`todo:${list}`]?.items.find((i) => i.id === 'i1')?.done, LIST)
      if (!ticked) await sleep(150)
    }
    const after = await until(page, () => [...document.querySelectorAll('[data-today-strip-item]')].map((r) => r.textContent.trim()).join('|') === 'Call mum|Water plants|Book dentist' && !document.querySelector('[data-today-more]'), undefined, 4000)
    check('today strip: ticking marks it done in its list and the next one moves up', ticked && after, JSON.stringify(await strip(page)))

    await control.evaluate(() => chrome.storage.sync.remove('proTrial'))
    check('today strip: hidden without Pro, even when switched on', await until(page, () => !document.querySelector('[data-today-strip]')))
    await page.close()

    // Spaces by time: an all-day rule (same start and end) for Rule test, last space Strip test.
    // Every page with Pro on keeps the localStorage copy the first frame reads; a page opened and
    // closed first (prime) makes sure it's written before the tab being checked loads.
    const prime = async () => {
      const p = await openNtp()
      await sleep(500)
      await p.close()
    }
    await control.evaluate(async ([strip, rules]) => {
      localStorage.setItem('stackable:lastSpaceId', strip)
      await chrome.storage.sync.set({ proTrial: { startedAt: Date.now() }, spaceSchedule: { v: 1, rules } })
    }, [made.strip, [{ space: 'Rule test', days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:00' }]])
    await prime()
    const ruled = await openNtp()
    const h1 = () => ruled.evaluate(() => document.querySelector('main h1')?.textContent)
    check('schedule: a new tab opens on the space its rule names', (await h1()) === 'Rule test', String(await h1()))
    await control.evaluate(() => chrome.storage.sync.set({ spaceSchedule: { v: 1, rules: [{ space: 'Strip test', days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:00' }] } }))
    await sleep(1200)
    check('schedule: a tab already open never switches', (await h1()) === 'Rule test', String(await h1()))
    await ruled.close()
    await control.evaluate(async (rule) => {
      localStorage.setItem('stackable:lastSpaceId', rule)
      await chrome.storage.sync.set({ spaceSchedule: { v: 1, rules: [{ space: 'Gone space', days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:00' }] } })
    }, made.rule)
    await prime()
    const gone = await openNtp()
    check('schedule: a rule whose space is gone leaves the last space', (await gone.evaluate(() => document.querySelector('main h1')?.textContent)) === 'Rule test')
    await gone.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    check('schedule: Settings says the space is gone', await until(gone, () => /no space called Gone space/.test(document.querySelector('[data-schedule-missing]')?.textContent ?? '')))
    await gone.keyboard.press('Escape')
    await gone.close()
    await control.evaluate(async (strip) => {
      localStorage.setItem('stackable:lastSpaceId', strip)
      await chrome.storage.sync.set({ spaceSchedule: { v: 1, rules: [{ space: 'Rule test', days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:00' }] } })
      await chrome.storage.sync.remove('proTrial')
    }, made.strip)
    await prime()
    const freeRule = await openNtp()
    check('schedule: without Pro the last space opens', (await freeRule.evaluate(() => document.querySelector('main h1')?.textContent)) === 'Strip test')
    await freeRule.close()

    // Command bar.
    await control.evaluate(async () => {
      await chrome.storage.sync.remove('spaceSchedule')
      await chrome.storage.sync.set({ proTrial: { startedAt: Date.now() } })
    })
    await sleep(400)
    const bar = await openNtp()
    await bar.bringToFront()
    const ctrlK = async (p) => {
      await p.keyboard.down('Control')
      await p.keyboard.press('KeyK')
      await p.keyboard.up('Control')
    }
    await ctrlK(bar)
    const opened = await until(bar, () => !!document.querySelector('[data-command-bar]') && document.activeElement?.hasAttribute('data-command-input'))
    check('command bar: Ctrl+K opens it with the cursor in it', opened)
    await bar.keyboard.type('rule test')
    await sleep(300)
    await bar.screenshot({ path: path.join(SHOTS, '91-command-bar.png') })
    await until(bar, () => document.querySelector('[data-command-item][aria-selected="true"]')?.textContent.includes('Rule test'))
    await bar.keyboard.press('Enter')
    check('command bar: Enter on a space goes there and closes the bar', await until(bar, () => document.querySelector('main h1')?.textContent === 'Rule test' && !document.querySelector('[data-command-bar]')))
    await ctrlK(bar)
    await until(bar, () => !!document.querySelector('[data-command-input]'))
    await bar.keyboard.type('settings')
    await until(bar, () => document.querySelector('[data-command-item][aria-selected="true"]')?.textContent.includes('Open Settings'))
    await bar.keyboard.press('Enter')
    check('command bar: Open Settings runs from the bar', await until(bar, () => !!document.querySelector('[data-keys]') && !document.querySelector('[data-command-bar]')))
    await bar.keyboard.press('Escape')
    await until(bar, () => !document.querySelector('[role=dialog]'))
    await ctrlK(bar)
    await until(bar, () => !!document.querySelector('[data-command-bar]'))
    await bar.keyboard.press('Escape')
    check('command bar: Esc closes it', await until(bar, () => !document.querySelector('[data-command-bar]')))
    await bar.close()

    await control.evaluate(() => chrome.storage.sync.remove('proTrial'))
    await sleep(400)
    const free = await openNtp()
    await free.bringToFront()
    await ctrlK(free)
    const toSearch = await until(free, () => document.activeElement?.getAttribute('aria-label') === 'Search all spaces')
    check('command bar: without Pro, Ctrl+K goes to the search box', toSearch && !(await free.evaluate(() => !!document.querySelector('[data-command-bar]'))))
    await free.close()

    // Put back what the blocks after this one expect.
    await control.evaluate(async ([w, list, ids, due]) => {
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'todayStrip', 'todayFocus', 'spaceSchedule', `todo:${list}`, `todoDue:${list}`])
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      if (Object.keys(due).length) await chrome.storage.sync.set(due)
      if (w.last === null) localStorage.removeItem('stackable:lastSpaceId')
      else localStorage.setItem('stackable:lastSpaceId', w.last)
      for (const id of ids) await chrome.bookmarks.removeTree(id)
    }, [was, LIST, [made.strip, made.rule], otherDue])
    await sleep(400)
  }

  // ---------- 0.8.0: share a stack as a link ----------
  // A stack's menu copies a link that carries the stack in its hash. The share page is served from
  // the site folder through request interception, so it runs on its real origin
  // (https://getstackboard.com) and the shipped externally_connectable applies as is: no test-only
  // manifest. Set STACKABLE_SITE to the site folder when dist isn't next to it.
  {
    const SITE = process.env.STACKABLE_SITE || path.resolve(process.env.STACKABLE_DIST ?? path.resolve(ROOT, '../dist'), '..', 'site')
    if (!fs.existsSync(path.join(SITE, 's', 'index.html'))) {
      console.log(`SKIP  share: no site/s page under ${SITE} (set STACKABLE_SITE)`)
    } else {
      const until = async (page, fn, arg, ms = 8000) => {
        for (let t = 0; t < ms; t += 150) {
          if (await page.evaluate(fn, arg).catch(() => false)) return true
          await sleep(150)
        }
        return false
      }
      const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
      const serve = async (page, extra = {}) => {
        await page.evaluateOnNewDocument((id) => { window.__STACKBOARD_EXT_ID = id }, extId)
        await page.setRequestInterception(true)
        page.on('request', (req) => {
          const u = new URL(req.url())
          if (extra[u.origin]) return req.respond({ status: 200, contentType: 'text/html', body: extra[u.origin] })
          if (u.origin !== 'https://getstackboard.com') return req.continue()
          const rel = u.pathname === '/s' || u.pathname === '/s/' ? 's/index.html' : decodeURIComponent(u.pathname.slice(1))
          const full = path.resolve(SITE, rel)
          if (!full.startsWith(path.resolve(SITE)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return req.respond({ status: 404, body: 'not found' })
          req.respond({ status: 200, contentType: TYPES[path.extname(full)] ?? 'application/octet-stream', body: fs.readFileSync(full) })
        })
      }

      const made = await control.evaluate(async () => {
        const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
        const space = await chrome.bookmarks.create({ parentId: root.id, title: '🔗 Share test' })
        const st = await chrome.bookmarks.create({ parentId: space.id, title: 'Reading list' })
        for (const [t, u] of [['Example', 'https://example.com/?share=1'], ['Example org', 'https://example.org/?share=2'], ['Example net', 'https://example.net/?share=3'], ['Settings', 'chrome://settings/']]) {
          await chrome.bookmarks.create({ parentId: st.id, title: t, url: u })
        }
        const target = await chrome.bookmarks.create({ parentId: root.id, title: '📚 Share target' })
        localStorage.setItem('stackable:lastSpaceId', space.id)
        return { space: space.id, stack: st.id, target: target.id }
      })

      // 1. Copy the link from the stack's menu (clipboard stubbed: headless has no real one).
      const board = await openNtp()
      await board.bringToFront()
      await board.evaluate(() => {
        window.__copied = null
        navigator.clipboard.writeText = async (text) => { window.__copied = text }
      })
      await until(board, (id) => !!document.querySelector(`#stack-${id}`), made.stack)
      await board.evaluate((id) => document.querySelector(`#stack-${id} button[aria-label="Stack options"]`).click(), made.stack)
      const hasItem = await until(board, () => !!document.querySelector('[data-share-stack]'))
      await board.evaluate(() => document.querySelector('[data-share-stack]')?.click())
      await until(board, () => !!window.__copied)
      const copied = await board.evaluate(() => window.__copied)
      const toast = await board.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
      check('share: the stack menu copies a getstackboard.com/s link with the stack in the hash', hasItem && typeof copied === 'string' && copied.startsWith('https://getstackboard.com/s#') && copied.length < 8000, String(copied).slice(0, 60))
      check('share: the toast says it was copied and who can see it', toast.includes('Link copied') && toast.includes('3 links') && toast.includes('Anyone with the link'), toast)
      const menuLeft = await board.evaluate(() => document.querySelectorAll('[data-share-stack]').length)
      check('share: the menu closes after sharing', menuLeft === 0)

      // 2. The page shows the stack, finds the extension, and never renders a script link.
      const page = await browser.newPage()
      await page.setViewport({ width: 1200, height: 900 })
      page.on('pageerror', (e) => errors.push(`share page: ${e.message}`))
      await serve(page)
      await page.goto(copied, { waitUntil: 'load' })
      await until(page, () => document.getElementById('links')?.children.length > 0)
      const shown = await page.evaluate(() => ({
        title: document.getElementById('title').textContent,
        links: [...document.querySelectorAll('#links a')].map((a) => a.href),
        imgs: [...document.querySelectorAll('#links img')].length,
      }))
      check('share: the page shows the title and the three web links', shown.title === 'Reading list' && shown.links.length === 3 && shown.links[0] === 'https://example.com/?share=1' && shown.imgs === 0, JSON.stringify(shown))
      const addShown = await until(page, () => !!document.getElementById('add') && getComputedStyle(document.getElementById('add')).display !== 'none')
      check('share: the page finds Stackboard and offers Add', addShown && (await page.evaluate(() => getComputedStyle(document.getElementById('get')).display === 'none')))

      // 3. Add opens a Stackboard tab that asks first; nothing is written before Add.
      const known = new Set(browser.targets())
      const asking = browser.waitForTarget((t) => !known.has(t) && t.url().includes('/newtab.html#share='), { timeout: 10000 }).then((t) => t.page()).catch(() => null)
      await page.evaluate(() => document.getElementById('add').click())
      const confirmTab = await asking
      const before = await control.evaluate((id) => chrome.bookmarks.getChildren(id).then((k) => k.length), made.target)
      const card = confirmTab ? await until(confirmTab, () => !!document.querySelector('[data-share-add]')) : false
      const cardText = confirmTab ? await confirmTab.evaluate(() => document.querySelector('[data-share-add]')?.innerText ?? '') : ''
      check('share: Add opens a Stackboard tab asking which space, with nothing written yet', card && cardText.includes('Reading list') && cardText.includes('3 links') && before === 0, cardText.slice(0, 120))
      // Review batch 2, finding 1: Add answers only after a short moment.
      const armedLate = confirmTab ? await confirmTab.evaluate(() => !!document.querySelector('[data-share-confirm]')?.disabled) : false
      check('share: Add waits a moment before it answers', armedLate)
      const fullList = confirmTab ? await confirmTab.evaluate(() => document.querySelectorAll('[data-share-links] li').length) : 0
      check('share: the card lists every link before Add', fullList === 3, String(fullList))
      if (confirmTab) {
        await confirmTab.select('[data-share-space]', made.target)
        await until(confirmTab, () => !document.querySelector('[data-share-confirm]')?.disabled)
        await confirmTab.evaluate(() => document.querySelector('[data-share-confirm]').click())
        await until(confirmTab, () => !document.querySelector('[data-share-add]') && (document.querySelector('.toast')?.textContent ?? '').includes('Added'))
      }
      const landed = await control.evaluate(async (id) => {
        const [sub] = await chrome.bookmarks.getSubTree(id)
        return (sub.children ?? []).map((st) => ({ title: st.title, urls: (st.children ?? []).map((b) => b.url) }))
      }, made.target)
      check('share: after Add the stack lands in the chosen space', landed.length === 1 && landed[0].title === 'Reading list' && landed[0].urls.join() === 'https://example.com/?share=1,https://example.org/?share=2,https://example.net/?share=3', JSON.stringify(landed))
      const hashGone = confirmTab ? await confirmTab.evaluate(() => location.hash === '') : false
      check('share: the confirmation clears its address and its parked stack', hashGone && (await control.evaluate(async () => Object.keys(await chrome.storage.session.get(null)).filter((k) => k.startsWith('shareAdd:')).length)) === 0)
      await confirmTab?.close()

      // 4. Open all goes through Stackboard: one tab per link, grouped, next to the page.
      await sleep(2100) // the worker takes one add or open every two seconds
      const tabsBefore = await control.evaluate(() => chrome.tabs.query({}).then((t) => t.length))
      await page.bringToFront()
      await page.evaluate(() => document.getElementById('open').click())
      await until(page, () => (document.getElementById('status')?.textContent ?? '').includes('Opened'))
      const opened = await control.evaluate(async () => (await chrome.tabs.query({})).filter((t) => /\?share=\d/.test(t.pendingUrl || t.url || '')).map((t) => ({ id: t.id, g: t.groupId })))
      const tabsAfter = await control.evaluate(() => chrome.tabs.query({}).then((t) => t.length))
      check('share: Open all opens each link once, in one tab group', tabsAfter - tabsBefore === 3 && opened.length === 3 && opened.every((t) => t.g >= 0 && t.g === opened[0].g), `${tabsAfter - tabsBefore} ${JSON.stringify(opened)}`)
      await control.evaluate((ids) => chrome.tabs.remove(ids), opened.map((t) => t.id))

      // Review batch 2, finding 11: at most five parked stacks wait at once, the newest kept.
      await control.evaluate(async () => {
        const now = Date.now()
        const parked = {}
        for (let i = 0; i < 6; i++) parked[`shareAdd:capped00000${i}`] = { stack: { title: `Old ${i}`, links: [{ title: 'A', url: 'https://example.com/a' }] }, at: now - (6 - i) * 60000 }
        await chrome.storage.session.set(parked)
      })
      await sleep(2100)
      const knownCap = new Set(browser.targets())
      const capTab = browser.waitForTarget((t) => !knownCap.has(t) && t.url().includes('/newtab.html#share='), { timeout: 10000 }).then((t) => t.page()).catch(() => null)
      await page.bringToFront()
      await page.evaluate(() => document.getElementById('add').click())
      await (await capTab)?.close()
      const parkedKeys = await bounded('share: read the parked stacks', control, () => control.evaluate(async () => Object.keys(await chrome.storage.session.get(null)).filter((k) => k.startsWith('shareAdd:')).sort()))
      check('share: at most five parked stacks, the newest kept', parkedKeys.length === 5 && !parkedKeys.includes('shareAdd:capped000000') && !parkedKeys.includes('shareAdd:capped000001') && parkedKeys.includes('shareAdd:capped000005'), parkedKeys.join(' '))
      await bounded('share: clear the parked stacks', control, () => control.evaluate(async (keys) => chrome.storage.session.remove(keys), parkedKeys))
      await sleep(2100)

      // 5. A doctored link: script and data links never reach the page.
      await control.bringToFront()
      const evil = await bounded('share: build a doctored link', control, () => control.evaluate(async () => {
        const json = JSON.stringify({ v: 1, t: 'Mixed', l: [['x', 'javascript:alert(1)'], ['ok', 'https://example.com/ok'], ['d', 'data:text/html,hi']] })
        const s = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))
        const bytes = new Uint8Array(await new Response(s).arrayBuffer())
        let bin = ''
        for (const b of bytes) bin += String.fromCharCode(b)
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      }))
      await page.goto('about:blank')
      await page.goto('https://getstackboard.com/s#' + evil, { waitUntil: 'load' })
      await until(page, () => document.getElementById('title')?.textContent === 'Mixed')
      const evilLinks = await bounded('share: read the doctored page', page, () => page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => /^(javascript|data):/i.test(h)).length))
      const evilCount = await bounded('share: count the doctored links', page, () => page.evaluate(() => document.querySelectorAll('#links li').length))
      check('share: a doctored link shows only its web links', evilLinks === 0 && evilCount === 1, `${evilLinks} ${evilCount}`)
      await page.goto('about:blank')
      await page.goto('https://getstackboard.com/s#not-a-stack', { waitUntil: 'load' })
      await until(page, () => (document.getElementById('title')?.textContent ?? '').includes("doesn't hold a stack"))
      check('share: a broken link says so', (await page.evaluate(() => document.getElementById('title').textContent)).includes("doesn't hold a stack"))
      await page.close()

      // 6. Other sites can't reach Stackboard, and an unknown confirmation id writes nothing.
      const other = await browser.newPage()
      await serve(other, { 'https://other.example': '<!doctype html><title>other</title><p>hi</p>' })
      await other.goto('https://other.example/', { waitUntil: 'load' })
      const reach = await other.evaluate(() => typeof window.chrome?.runtime?.sendMessage)
      check('share: pages on other sites get no channel to Stackboard', reach === 'undefined', reach)
      await other.close()
      const stale = await openNtp()
      await stale.goto(NTP + '#share=zzzzzzzzzzzz', { waitUntil: 'load' }).catch(() => {})
      await stale.reload({ waitUntil: 'load' }).catch(() => {})
      await until(stale, () => !!document.querySelector('main h1'))
      await sleep(1200)
      const staleCard = await stale.evaluate(() => !!document.querySelector('[data-share-add]'))
      const staleToast = await stale.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
      check('share: an unknown or expired share shows no card and says so', !staleCard && staleToast.includes('expired'), staleToast)
      await stale.close()

      // 7. The new manifest key adds no install warning (the API that answers needs no permission).
      const warn = await control.evaluate(async () => {
        if (!chrome.management?.getPermissionWarningsByManifest) return null
        const m = chrome.runtime.getManifest()
        const without = { ...m }
        delete without.externally_connectable
        const a = await chrome.management.getPermissionWarningsByManifest(JSON.stringify(m))
        const b = await chrome.management.getPermissionWarningsByManifest(JSON.stringify(without))
        return { a, b, key: m.externally_connectable }
      })
      if (warn) check('share: externally_connectable adds no permission warning', JSON.stringify(warn.a) === JSON.stringify(warn.b) && warn.key?.matches?.[0] === 'https://getstackboard.com/*', JSON.stringify(warn))
      else console.log('SKIP  share: chrome.management.getPermissionWarningsByManifest not available')

      await board.close()
      await control.evaluate(async (m) => {
        await chrome.bookmarks.removeTree(m.space)
        await chrome.bookmarks.removeTree(m.target)
        localStorage.removeItem('stackable:lastSpaceId')
      }, made)
    }
  }

  // ---------- 0.9.0: suggested stack, AI pick, folder backup, free clean-up scan ----------
  // The save popup offers one stack first, the one already holding links from the page's site, and
  // Enter saves there. With a Pro key and "Let AI pick the stack" switched on in Settings, the
  // (stubbed) server's pick wins, and a slow answer leaves the local match. Each daily snapshot also
  // goes to a picked folder (an OPFS folder stands in for Google Drive), newest 30 of our files kept,
  // nothing else touched. Without Pro, clean-up is a free scan with the trial in its footer.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const KEY = 'SB-FILE-0000-0000-0000'
    const was = await control.evaluate(async () => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey', 'proSub', 'aiFile']),
      local: await chrome.storage.local.get(['proLicense', 'proCheckout', 'backupLast', 'aiFileReady']),
    }))
    const made = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🧪 File test' })
      const recipes = await chrome.bookmarks.create({ parentId: space.id, title: 'Recipes' })
      const docs = await chrome.bookmarks.create({ parentId: space.id, title: 'Docs' })
      await chrome.bookmarks.create({ parentId: recipes.id, title: 'Soup', url: 'https://www.filetest-recipes.example/soup' })
      await chrome.bookmarks.create({ parentId: docs.id, title: 'Plan', url: 'https://filetest-docs.example/plan' })
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'aiFile'])
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'aiFileReady'])
      return { space: space.id, recipes: recipes.id, docs: docs.id }
    })
    const linksIn = (id) => control.evaluate(async (s) => (await chrome.bookmarks.getChildren(s)).filter((c) => c.url).map((c) => `${c.title}|${c.url}`), id)

    // The popup, with a web page as the current tab and the AI pick endpoint stubbed (delay in ms).
    const openPopup = async (tab, delay = 0) => {
      const pop = await browser.newPage()
      pop.on('pageerror', (e) => errors.push(`file popup: ${e.message}`))
      await pop.evaluateOnNewDocument((tab, delay) => {
        const real = chrome.tabs.query.bind(chrome.tabs)
        const fake = [{ id: 990001, windowId: -1, index: 0, url: tab.url, title: tab.title, active: true, highlighted: true }]
        Object.defineProperty(chrome.tabs, 'query', { configurable: true, writable: true, value: async (q) => (q && (q.active || q.highlighted) ? fake : real(q)) })
        window.__fileCalls = []
        const realFetch = window.fetch.bind(window)
        window.fetch = async (input, init = {}) => {
          const url = typeof input === 'string' ? input : input.url
          if (url !== 'https://getstackboard.com/api/file') return realFetch(input, init)
          const body = JSON.parse(init.body || '{}')
          window.__fileCalls.push(body)
          // Like the real fetch, a timed-out signal rejects at once.
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, delay)
            init.signal?.addEventListener('abort', () => {
              clearTimeout(t)
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          })
          return new Response(JSON.stringify({ ok: true, stack: body.stacks.indexOf('File test › Docs') }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
      }, tab, delay)
      await pop.goto(NTP.replace('newtab.html', 'popup.html'), { waitUntil: 'load' })
      await pop.bringToFront()
      return pop
    }
    const suggested = (pop) =>
      pop.evaluate(() => {
        const b = document.querySelector('[data-suggested-stack]')
        return b ? { id: b.dataset.suggestedStack, reason: b.dataset.suggestedReason, text: b.textContent.trim(), asking: (document.querySelector('[data-suggested]')?.textContent ?? '').includes('Asking AI') } : null
      })

    const page1 = { url: 'https://www.filetest-recipes.example/stew', title: 'Beef stew | Filetest' }
    const p1 = await openPopup(page1)
    await until(p1, () => !!document.querySelector('[data-suggested-stack]'))
    const s1 = await suggested(p1)
    check('save popup: the stack holding links from the same site comes first', s1?.id === made.recipes && s1.reason === 'site' && s1.text === 'File test › Recipes', JSON.stringify(s1))
    check('save popup: with AI off nothing is sent', (await p1.evaluate(() => window.__fileCalls.length)) === 0)
    await p1.focus('input[type=text]')
    await p1.keyboard.press('Enter')
    let saved1 = []
    for (let t = 0; t < 5000 && !saved1.some((l) => l.includes('filetest-recipes.example/stew')); t += 200) {
      saved1 = await linksIn(made.recipes)
      await sleep(200)
    }
    check('save popup: Enter saves to the suggested stack', saved1.includes('Beef stew | Filetest|https://www.filetest-recipes.example/stew'), JSON.stringify(saved1))
    await p1.close().catch(() => {})

    // A Pro key (license API stubbed in every board tab), then the switch in Settings.
    const stub = () => {
      window.__fetchBeforeStub = window.__fetchBeforeStub || window.fetch
      const real = window.__fetchBeforeStub.bind(window)
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url
        if (url.startsWith('https://api.polar.sh/v1/customer-portal/license-keys/')) {
          const op = url.split('/').pop()
          if (op === 'activate') return json({ id: 'act-file' })
          if (op === 'validate') return json({ benefit_id: 'f204b661-dc9b-4ce5-91f5-7cc6559d1617', status: 'granted', expires_at: null, created_at: '2026-11-03T08:41:50Z' })
          if (op === 'deactivate') return new Response(null, { status: 204 })
        }
        if (url === 'https://getstackboard.com/api/file' && (init.method || 'GET') === 'GET') return json({ ok: true, ready: true, max: 300 })
        return real(input, init)
      }
    }
    const boards = (await browser.pages()).filter((pg) => pg.url().startsWith(`chrome-extension://${extId}/`) || pg.url().startsWith('chrome://newtab'))
    for (const pg of boards) await pg.evaluate(stub).catch(() => {})
    const ntp = await browser.newPage()
    await ntp.setViewport({ width: 1400, height: 900 })
    ntp.on('pageerror', (e) => errors.push(`file settings: ${e.message}`))
    await ntp.evaluateOnNewDocument(stub)
    await control.evaluate((key) => chrome.storage.sync.set({ proKey: { key } }), KEY)
    await ntp.goto(NTP, { waitUntil: 'load' })
    await ntp.bringToFront()
    await ntp.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
    await ntp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    const toggle = await until(ntp, () => document.querySelector('[data-pro]')?.dataset.pro === 'pro' && !!document.querySelector('[data-ai-file-toggle]'), null, 12000)
    const offAtFirst = toggle && (await ntp.evaluate(() => !document.querySelector('[data-ai-file-toggle]').checked))
    await ntp.evaluate(() => document.querySelector('[data-ai-file-toggle]')?.click())
    const notice = await until(ntp, () => (document.querySelector('[data-ai-file-notice]')?.textContent ?? '').includes("Anthropic's AI"))
    const stillOff = !(await control.evaluate(async () => (await chrome.storage.sync.get('aiFile')).aiFile?.on))
    await ntp.evaluate(() => document.querySelector('[data-ai-file-on]')?.click())
    let aiOn = false
    for (let t = 0; t < 4000 && !aiOn; t += 200) {
      aiOn = (await control.evaluate(async () => (await chrome.storage.sync.get('aiFile')).aiFile?.on)) === true
      if (!aiOn) await sleep(200)
    }
    check('AI pick: off by default, and the notice comes before anything is switched on', toggle && offAtFirst && notice && stillOff, JSON.stringify({ toggle, offAtFirst, notice, stillOff }))
    check('AI pick: Turn on saves the choice for the Chrome profile', aiOn)
    await ntp.close()

    // The popup reads this computer's activation straight from storage. Set it here, so another open
    // test tab re-checking the fake key with the real Polar can't leave it marked unknown first.
    await control.evaluate((key) => chrome.storage.local.set({ proLicense: { key, activationId: 'act-file', status: 'granted', checkedAt: Date.now(), okAt: Date.now() } }), KEY)
    // Watch both keys the popup reads while it opens, for the failure detail (a flake on 11 Nov saw no request).
    await control.evaluate(() => {
      const t0 = Date.now()
      window.__pickLog = []
      window.__pickWatch = (ch, area) => {
        if (ch.proLicense) window.__pickLog.push(`${Date.now() - t0}ms ${area} proLicense=${ch.proLicense.newValue?.status ?? 'removed'}`)
        if (ch.aiFile) window.__pickLog.push(`${Date.now() - t0}ms ${area} aiFile.on=${ch.aiFile.newValue?.on}`)
      }
      chrome.storage.onChanged.addListener(window.__pickWatch)
    })
    const p2 = await openPopup({ url: 'https://www.filetest-recipes.example/report', title: 'Quarterly report' })
    await until(p2, () => document.querySelector('[data-suggested-stack]')?.dataset.suggestedReason === 'ai')
    const s2 = await suggested(p2)
    const calls = await p2.evaluate(() => window.__fileCalls)
    const sent = calls[0] ?? {}
    const lic = await control.evaluate(async () => { const l = (await chrome.storage.local.get('proLicense')).proLicense; return l ? `${l.status}/${l.activationId}` : null })
    const watched = await control.evaluate(() => {
      chrome.storage.onChanged.removeListener(window.__pickWatch)
      return window.__pickLog
    })
    check('AI pick: the AI answer replaces the local match', s2?.id === made.docs && s2.reason === 'ai' && s2.text === 'File test › Docs', JSON.stringify({ s2, lic, watched }))
    check(
      'AI pick: the request carries the page, the stack paths and the key, nothing else',
      calls.length === 1 && sent.page?.url === 'https://www.filetest-recipes.example/report' && sent.page?.title === 'Quarterly report' &&
        sent.stacks?.includes('File test › Recipes') && sent.license?.key === KEY && sent.license?.activationId === 'act-file' &&
        JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(['license', 'page', 'stacks']),
      JSON.stringify(sent).slice(0, 300),
    )
    await p2.evaluate(() => document.querySelector('[data-suggested-stack]').click())
    let saved2 = []
    for (let t = 0; t < 5000 && !saved2.length; t += 200) {
      saved2 = (await linksIn(made.docs)).filter((l) => l.includes('/report'))
      await sleep(200)
    }
    check('AI pick: a click saves to the picked stack', saved2.length === 1, JSON.stringify(saved2))
    await p2.close().catch(() => {})

    // The popup waits up to 4 s for a pick (aiFile.ts PICK_TIMEOUT_MS); this answer takes 6 s.
    const p3 = await openPopup({ url: 'https://www.filetest-recipes.example/slow', title: 'Slow answer' }, 6000)
    await sleep(4800)
    const s3 = await suggested(p3)
    check('AI pick: a slow answer leaves the local match', s3?.reason === 'site' && s3.id === made.recipes && !s3.asking, JSON.stringify(s3))
    await p3.close().catch(() => {})

    // Back to no key: every board tab takes Pro off (deactivate stubbed), then the real fetch returns.
    await control.evaluate(() => chrome.storage.sync.remove(['proKey', 'proSub', 'aiFile']))
    await sleep(1500)
    await control.evaluate(() => chrome.storage.local.remove(['proLicense', 'aiFileReady']))

    // ---- Back up to a folder, with the trial on ----
    const today = await control.evaluate(() => {
      const d = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    })
    await control.evaluate(async () => {
      await chrome.storage.sync.set({ proTrial: { startedAt: Date.now() } })
      await chrome.storage.local.remove('backupLast')
      const root = await navigator.storage.getDirectory()
      const dir = await root.getDirectoryHandle('e2e-backup', { create: true })
      const write = async (name, text) => {
        const f = await dir.getFileHandle(name, { create: true })
        const w = await f.createWritable()
        await w.write(text)
        await w.close()
      }
      for (let d = 1; d <= 31; d++) await write(`stackboard-2026-01-${String(d).padStart(2, '0')}.json`, '{}')
      await write('notes.txt', 'keep')
      await write('stackboard-notes.json', 'keep')
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('stackboard-backup', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('folder')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const tx = req.result.transaction('folder', 'readwrite')
          tx.objectStore('folder').put(dir, 'handle')
          tx.oncomplete = () => {
            req.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    })
    const folder = () =>
      control.evaluate(async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('e2e-backup')
        const names = []
        for await (const n of dir.keys()) names.push(n)
        return names.sort()
      })
    const readToday = (day) =>
      control.evaluate(async (day) => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('e2e-backup')
        const f = await (await dir.getFileHandle(`stackboard-${day}.json`)).getFile()
        const b = JSON.parse(await f.text())
        return { version: b.version, spaces: Array.isArray(b.spaces) ? b.spaces.length : -1, at: b.exportedAt, hasFileTest: (b.spaces || []).some((s) => s.name === 'File test') }
      }, day)
    const bk = await openNtp()
    await bk.bringToFront()
    let names = []
    for (let t = 0; t < 15000 && !names.includes(`stackboard-${today}.json`); t += 300) {
      names = await folder()
      await sleep(300)
    }
    // The prune runs right after today's file is closed and ends by stamping backupLast (removed above),
    // so wait for the stamp and list the folder again: the loop can catch it between the write and the prune.
    for (let t = 0; t < 5000; t += 200) {
      if (await control.evaluate(async () => !!(await chrome.storage.local.get('backupLast')).backupLast)) break
      await sleep(200)
    }
    names = await folder()
    const ours = names.filter((n) => /^stackboard-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    const first = names.includes(`stackboard-${today}.json`) ? await readToday(today) : null
    check('folder backup: the daily snapshot also lands in the folder as an importable file', first?.version === 1 && first.spaces > 0 && first.hasFileTest, JSON.stringify(first))
    check(
      'folder backup: the newest 30 of our files stay, and nothing else in the folder is touched',
      ours.length === 30 && !names.includes('stackboard-2026-01-01.json') && !names.includes('stackboard-2026-01-02.json') && names.includes('stackboard-2026-01-03.json') && names.includes('notes.txt') && names.includes('stackboard-notes.json'),
      `${ours.length} ours: ${names.slice(0, 4).join(',')}…`,
    )
    await bk.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(bk, () => !!document.querySelector('[data-backup-name]'))
    const panel = await bk.evaluate(() => ({ name: document.querySelector('[data-backup-name]')?.textContent, last: document.querySelector('[data-backup-last]')?.textContent }))
    check('folder backup: Settings names the folder and the last backup', panel.name === 'e2e-backup' && (panel.last ?? '').includes('today'), JSON.stringify(panel))
    await sleep(1100)
    await bk.evaluate(() => document.querySelector('[data-backup-now]')?.click())
    const toasted = await until(bk, () => (document.querySelector('.toast')?.textContent ?? '').includes('Backed up to'))
    const again = await readToday(today)
    check('folder backup: Back up now writes today\'s file again', toasted && again.at !== first?.at, JSON.stringify({ toasted, before: first?.at, after: again.at }))
    await bk.evaluate(() => document.querySelector('[data-backup-stop]')?.click())
    const stopped = await until(bk, () => !!document.querySelector('[data-backup-choose]'))
    check('folder backup: Stop forgets the folder and keeps its files', stopped && (await folder()).includes(`stackboard-${today}.json`))
    await bk.close()
    await control.evaluate(async () => {
      await (await navigator.storage.getDirectory()).removeEntry('e2e-backup', { recursive: true })
      await chrome.storage.local.remove('backupLast')
      await chrome.storage.sync.remove('proTrial')
    })

    // ---- Free scan, paid fix ----
    const scan = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🧹 Scan test' })
      const one = await chrome.bookmarks.create({ parentId: space.id, title: 'One' })
      const two = await chrome.bookmarks.create({ parentId: space.id, title: 'Two' })
      await chrome.bookmarks.create({ parentId: one.id, title: 'Scan A', url: 'https://scan-dup.example.com/p' })
      await chrome.bookmarks.create({ parentId: two.id, title: 'Scan B', url: 'https://scan-dup.example.com/p' })
      return { space: space.id }
    })
    const fs1 = await openNtp()
    await fs1.bringToFront()
    await fs1.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(fs1, () => !!document.querySelector('[data-cleanup-scan]'))
    const entry = await fs1.evaluate(() => ({ scan: !!document.querySelector('[data-cleanup-scan]'), pro: !!document.querySelector('[data-cleanup-open]') }))
    check('free scan: Settings offers the scan without Pro', entry.scan && !entry.pro, JSON.stringify(entry))
    await fs1.evaluate(() => document.querySelector('[data-cleanup-scan]').click())
    await until(fs1, () => [...document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row]')].some((r) => r.textContent.includes('Scan B')))
    const free = await fs1.evaluate(() => ({
      rows: [...document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row]')].filter((r) => /Scan [AB]/.test(r.textContent)).length,
      boxes: document.querySelectorAll('[data-cleanup-row] input').length,
      trial: !!document.querySelector('[data-cleanup-trial]'),
      remove: !!document.querySelector('[data-cleanup-remove]'),
      note: document.querySelector('[data-cleanup-free]')?.textContent ?? '',
    }))
    check('free scan: the duplicates show with nothing to tick, and the footer offers the trial', free.rows === 2 && free.boxes === 0 && free.trial && !free.remove && free.note.includes('14 days'), JSON.stringify(free))
    await fs1.evaluate(() => [...document.querySelectorAll('[data-cleanup] [role=radio]')].find((b) => b.textContent.startsWith("Can't be reached"))?.click())
    await until(fs1, () => !!document.querySelector('[data-cleanup-dead-pro]'))
    check('free scan: checking for dead links stays Pro', await fs1.evaluate(() => !!document.querySelector('[data-cleanup-dead-pro]') && !document.querySelector('[data-cleanup-check]')))
    await fs1.evaluate(() => document.querySelector('[data-cleanup-trial]').click())
    await until(fs1, () => !!document.querySelector('[data-cleanup-remove]'))
    await fs1.evaluate(() => [...document.querySelectorAll('[data-cleanup] [role=radio]')].find((b) => b.textContent.startsWith('Duplicates'))?.click())
    await until(fs1, () => document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row] input').length > 0)
    const ticked = await fs1.evaluate(() =>
      [...document.querySelectorAll('[data-cleanup-section="dupes"] [data-cleanup-row]')]
        .filter((r) => /Scan [AB]/.test(r.textContent))
        .map((r) => `${r.textContent.includes('Scan A') ? 'A' : 'B'}:${r.querySelector('input')?.checked}`)
        .sort()
        .join(','),
    )
    check('free scan: starting the trial there turns on Remove, the extra copy ticked', ticked === 'A:false,B:true', ticked)
    await fs1.close()

    for (const pg of boards) await pg.evaluate(() => { if (window.__fetchBeforeStub) window.fetch = window.__fetchBeforeStub }).catch(() => {})
    await control.evaluate(
      async (m, w) => {
        await chrome.bookmarks.removeTree(m.space)
        await chrome.bookmarks.removeTree(m.scan)
        await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'aiFile'])
        await chrome.storage.local.remove(['proLicense', 'proCheckout', 'backupLast', 'aiFileReady'])
        if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
        if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
        await new Promise((r) => {
          const req = indexedDB.deleteDatabase('stackboard-backup')
          req.onsuccess = req.onerror = req.onblocked = () => r()
        })
      },
      { space: made.space, scan: scan.space },
      was,
    )
    await sleep(400)
  }

  // ---------- 0.8.0: Teams pack 2 ----------
  // Go links (asked through the service worker, since a test can't type in the address bar), a
  // start-here space for new people, the company's brand, and settings the company locks.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'))
    check('teams2: go is the address-bar keyword, with the expected permissions', mf.omnibox?.keyword === 'go' && JSON.stringify(mf.permissions) === JSON.stringify(PERMISSIONS) && !mf.host_permissions, JSON.stringify(mf.omnibox))

    const policy = {
      companyName: 'Acme',
      goLinks: { pto: 'https://example.com/pto', 'hr/benefits': 'https://example.org/benefits' },
      spaces: [
        { name: 'Acme Tools', emoji: '🧰', stacks: [{ name: 'Daily', links: [{ title: 'Payroll portal', url: 'https://example.com/payroll' }] }] },
        { name: 'Welcome aboard', emoji: '👋', onboarding: true, stacks: [{ name: 'First week', links: [{ title: 'Laptop setup', url: 'https://example.com/setup' }] }] },
      ],
      brand: { name: 'Acme Corp', accent: '#0f766e' },
      lock: { appearance: true, starterPacks: true, importExport: true },
    }
    // Pages read the override from localStorage; the service worker has none, so it reads chrome.storage.local.
    await control.evaluate(async (j) => {
      localStorage.setItem('stackable:managedOverride', j)
      await chrome.storage.local.set({ 'stackable:managedOverride': j })
    }, JSON.stringify(policy))

    const sug = await askWorker(control, { type: 'go-suggest', text: 'pto', fresh: true })
    check('teams2: go pto suggests the company name first, marked', Array.isArray(sug) && sug[0]?.content === 'https://example.com/pto' && sug[0].description.includes('<match>pto</match>'), JSON.stringify(sug).slice(0, 240))
    const sug2 = await askWorker(control, { type: 'go-suggest', text: 'payroll' })
    check('teams2: go also finds company links by title', Array.isArray(sug2) && sug2[0]?.content === 'https://example.com/payroll', JSON.stringify(sug2).slice(0, 240))

    const opened = await askWorker(control, { type: 'go-open', text: 'hr/benefits' })
    await sleep(400)
    const goTabs = await control.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => (t.pendingUrl || t.url || '').startsWith(u)).map((t) => t.id), 'https://example.org/benefits')
    check('teams2: go hr/benefits opens its address in a new tab', opened?.url === 'https://example.org/benefits' && goTabs.length === 1, `${JSON.stringify(opened)} ${goTabs.length}`)
    if (goTabs.length) await control.evaluate((ids) => chrome.tabs.remove(ids), goTabs)

    // Review batch 2, finding 2: with no match the words go to the default search engine.
    const known = new Set(browser.targets())
    const miss = await askWorker(control, { type: 'go-open', text: 'zzqx quarterly' })
    const missTab = await browser.waitForTarget((t) => !known.has(t) && t.type() === 'page' && /zzqx/.test(decodeURIComponent(t.url())), { timeout: 8000 }).catch(() => null)
    check('teams2: with no match, go searches the web with the default engine', miss?.searched === 'zzqx quarterly' && !!missTab, `${JSON.stringify(miss)} ${missTab?.url() ?? 'no tab'}`)
    if (missTab) await (await missTab.page())?.close()
    const searchWarn = await control.evaluate(async () => {
      if (!chrome.management?.getPermissionWarningsByManifest) return null
      const m = chrome.runtime.getManifest()
      const without = { ...m, permissions: m.permissions.filter((p) => p !== 'search') }
      const a = await chrome.management.getPermissionWarningsByManifest(JSON.stringify(m))
      const b = await chrome.management.getPermissionWarningsByManifest(JSON.stringify(without))
      return { a, b, has: m.permissions.includes('search') }
    })
    if (searchWarn) check('teams2: the search permission adds no install warning', searchWarn.has && JSON.stringify(searchWarn.a) === JSON.stringify(searchWarn.b), JSON.stringify(searchWarn))
    else console.log('SKIP  teams2: chrome.management.getPermissionWarningsByManifest not available')

    // T7: the first time this device shows company spaces, it opens on the start-here space.
    await control.evaluate(() => localStorage.removeItem('stackable:companySeen'))
    const page = await openNtp()
    await page.bringToFront()
    const ob = await page.evaluate(() => ({
      h1: document.querySelector('main h1')?.textContent,
      rows: [...document.querySelectorAll('[data-company-space]')].map((r) => r.dataset.companySpace),
      badge: !!document.querySelector('[data-company-space="Welcome aboard"] [data-start-here]'),
    }))
    check('teams2: new people open on the start-here space, first and badged', ob.h1 === 'Welcome aboard' && ob.rows[0] === 'Welcome aboard' && ob.badge, JSON.stringify(ob))

    // T8: the company's colour and name, for everyone (no Pro in this part of the suite).
    const brand = await page.evaluate(() => ({
      accent: document.documentElement.getAttribute('data-accent'),
      hex: getComputedStyle(document.documentElement).getPropertyValue('--sb-custom-accent').trim(),
      header: document.querySelector('aside [data-brand]')?.textContent?.trim(),
    }))
    check('teams2: the company accent and name show without Pro', brand.accent === 'custom' && brand.hex === '#0f766e' && brand.header === 'Acme Corp', JSON.stringify(brand))

    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(page, () => !!document.querySelector('[data-keys]'))
    const st = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[role=dialog] button')].map((b) => b.textContent.trim())
      return {
        appearance: !!document.querySelector('[data-appearance]'),
        managed: [...document.querySelectorAll('[data-managed-setting]')].map((s) => s.dataset.managedSetting),
        packs: buttons.includes('Starter packs'),
        exportJson: buttons.includes('Export JSON'),
        copyIn: buttons.includes('Copy from Chrome bookmarks'),
        note: document.querySelector('[role=dialog]')?.innerText.includes('Your company manages this setting.'),
        goRow: !!document.querySelector('[data-keys]')?.textContent.includes('Go links'),
      }
    })
    check('teams2: locked settings are hidden, each with a note', !st.appearance && !st.packs && !st.exportJson && !st.copyIn && st.note && st.managed.join('|') === 'Appearance|Add to your board|Backup', JSON.stringify(st))
    // 0.8.0: the appearance lock covers the look; the layout stays the person's own choice.
    const savedBefore = await page.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance ?? null)
    const mirrorBefore = await page.evaluate(() => localStorage.getItem('stackable:appearance'))
    const layoutBefore = savedBefore?.layout ?? null
    const pick = layoutBefore === 'rows' ? 'Packed' : 'Rows'
    const switched = await page.evaluate(async (label) => {
      const opt = [...document.querySelectorAll('[data-layout-setting] [role=radio]')].find((b) => b.textContent.trim() === label)
      if (!opt) return 'no switch'
      opt.click()
      await new Promise((r) => setTimeout(r, 400))
      return (await chrome.storage.local.get('appearance')).appearance?.layout ?? null
    }, pick)
    check('teams2: under the appearance lock the Layout switch still works', switched === pick.toLowerCase(), `${layoutBefore} -> ${switched}`)
    // Put the saved appearance back exactly as it was, for the blocks after this one.
    await page.evaluate(async (before, mirror) => {
      if (before) await chrome.storage.local.set({ appearance: before })
      else await chrome.storage.local.remove('appearance')
      await new Promise((r) => setTimeout(r, 200))
      if (mirror === null) localStorage.removeItem('stackable:appearance')
      else localStorage.setItem('stackable:appearance', mirror)
    }, savedBefore, mirrorBefore)
    check('teams2: Settings > Keys explains go links', st.goRow)
    // Review batch 2, finding 4: the import/export lock also hides Export and Share as a link.
    await page.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Close"]')?.click())
    const lockSpace = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const sp = await chrome.bookmarks.create({ parentId: root.id, title: '🔒 Lock test' })
      const st = await chrome.bookmarks.create({ parentId: sp.id, title: 'Links' })
      await chrome.bookmarks.create({ parentId: st.id, title: 'One', url: 'https://example.com/lock-1' })
      return sp.id
    })
    const locked = await openNtp()
    await locked.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Lock test'))?.click())
    await until(locked, () => document.querySelector('main h1')?.textContent === 'Lock test')
    const exportShown = await locked.evaluate(() => !!document.querySelector('[data-export-button]'))
    await locked.evaluate(() => document.querySelector('main [aria-label^="Stack options"], main button[aria-haspopup="menu"]')?.click())
    await sleep(300)
    const shareShown = await locked.evaluate(() => !!document.querySelector('[data-share-stack]'))
    check('teams2: the import/export lock hides Export and Share as a link', !exportShown && !shareShown, JSON.stringify({ exportShown, shareShown }))
    await control.evaluate(async () => {
      await chrome.storage.session.set({ 'shareAdd:locktest00001': { stack: { title: 'Shared', links: [{ title: 'A', url: 'https://example.com/a' }] }, at: Date.now() } })
    })
    await locked.goto(NTP + '#share=locktest00001', { waitUntil: 'load' }).catch(() => {})
    await locked.reload({ waitUntil: 'load' }).catch(() => {})
    await until(locked, () => !!document.querySelector('[data-share-add]'))
    const lockCard = await locked.evaluate(() => ({ note: document.querySelector('[data-share-note]')?.textContent ?? '', add: !!document.querySelector('[data-share-confirm]') }))
    check('teams2: under the lock a shared stack can\'t be added, and the card says why', lockCard.note.includes('Your company manages this') && !lockCard.add, JSON.stringify(lockCard))
    await locked.close()
    await control.evaluate(async (id) => {
      await chrome.bookmarks.removeTree(id)
      await chrome.storage.session.remove('shareAdd:locktest00001')
    }, lockSpace)
    await page.close()

    // After 30 days the start-here space follows the other company spaces, badge gone.
    await control.evaluate(() => localStorage.setItem('stackable:companySeen', String(Date.now() - 31 * 86400000)))
    const later = await openNtp()
    const ob2 = await later.evaluate(() => ({
      rows: [...document.querySelectorAll('[data-company-space]')].map((r) => r.dataset.companySpace),
      badge: !!document.querySelector('[data-start-here]'),
    }))
    check('teams2: after 30 days the start-here space moves down and loses its badge', ob2.rows.join('|') === 'Acme Tools|Welcome aboard' && !ob2.badge, JSON.stringify(ob2))
    await later.close()

    await control.evaluate(async () => {
      localStorage.removeItem('stackable:managedOverride')
      localStorage.removeItem('stackable:companySeen')
      await chrome.storage.local.remove('stackable:managedOverride')
    })
    const plain = await openNtp()
    const cleared = await until(plain, () => document.documentElement.getAttribute('data-accent') === null && !document.querySelector('aside [data-brand]'))
    check('teams2: with the policy gone, the company colour and name go too', cleared)
    await plain.close()
  }

  // ---------- 0.9.0: the trial-end recap and the auto-archive line ----------
  // The last two days of a trial, and the first tabs after it ends, bring one corner card with what
  // Pro did on this computer (storage.local proStats) and Keep Pro. Free users get one line about
  // auto-archive after "Stash and close" lands or a bankruptcy certificate closes, three times at
  // most. The tab that opens decides, and the corner holds one card at a time.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const D = 24 * 60 * 60 * 1000
    const LS = ['stackable:trialEnding', 'stackable:trialEnded', 'stackable:proMoments', 'stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:rating', 'stackable:snapshotDay']
    const was = await control.evaluate(async (ls) => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo', 'proArchive', 'todayStrip']),
      local: await chrome.storage.local.get(['proStats', 'proCheckout', 'proLicense', 'whatsNew080']),
      ls: Object.fromEntries(ls.map((k) => [k, localStorage.getItem(k)])),
    }), LS)
    // A quiet board: no key, no what's-new note pending, the rating ask already answered. 0.9.4:
    // auto-archive (12 hours) and the Today strip are off unless `archive` or `strip` says so.
    const setup = (s) => control.evaluate(async (s) => {
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo', 'proArchive', 'todayStrip'])
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'proStats'])
      localStorage.setItem('stackable:whatsNew070', '-1')
      localStorage.setItem('stackable:whatsNew080', '-1')
      localStorage.setItem('stackable:rating', 'dismissed')
      for (const [k, v] of Object.entries(s.ls ?? {})) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
      if (s.trialStartedAt) await chrome.storage.sync.set({ proTrial: { startedAt: s.trialStartedAt } })
      if (s.stats) await chrome.storage.local.set({ proStats: s.stats })
      if (s.archive) await chrome.storage.sync.set({ proArchive: { afterMs: 12 * 3600000 } })
      if (s.strip) await chrome.storage.sync.set({ todayStrip: { on: true } })
    }, s)
    const card = (page) => page.evaluate(() => {
      const c = document.querySelector('[data-trial-end]')
      return c ? { kind: c.dataset.trialEnd, text: c.innerText.replace(/\s+/g, ' ').trim() } : null
    })
    const none = async (page, sel) => {
      await sleep(1500)
      return page.evaluate((s) => !document.querySelector(s), sel)
    }
    // 0.9.4: the line after the numbers, what stops; and the trial's last day as the page writes it.
    const stops = async (page) => ((await until(page, () => !!document.querySelector('[data-trial-end-stops]'))) ? page.evaluate(() => document.querySelector('[data-trial-end-stops]').textContent.trim()) : null)
    const lastDay = (page, start) => page.evaluate((end) => new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), start + 14 * D)

    const start1 = Date.now() - 12.5 * D
    await setup({ trialStartedAt: start1, stats: { archived: 214, snapshots: 12, todosDone: 9 }, archive: true, ls: { 'stackable:trialEnding': null, 'stackable:trialEnded': null } })
    const t1 = await openNtp()
    const c1 = (await until(t1, () => !!document.querySelector('[data-trial-end]'))) ? await card(t1) : null
    check(
      'trial recap: the last two days bring one card with what Pro did and Keep Pro',
      !!c1 && c1.kind === 'ending' && /Your Pro trial ends (today|tomorrow|in 2 days)/.test(c1.text) && c1.text.includes('Pro archived 214 tabs, kept 12 snapshots and checked off 9 to-dos.') && c1.text.includes('Keep Pro for $'),
      JSON.stringify(c1),
    )
    const stops1 = await stops(t1)
    const day1 = await lastDay(t1, start1)
    const order1 = await t1.evaluate(() => {
      const after = (a, b) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      return after(document.querySelector('[data-trial-end-stats]'), document.querySelector('[data-trial-end-stops]')) && after(document.querySelector('[data-trial-end-stops]'), document.querySelector('[data-trial-keep]'))
    })
    check(
      'trial recap: after the numbers, one line says what stops on the last day, naming auto-archive while it is on',
      stops1 === `When it ends on ${day1}, auto-archive and daily snapshots stop. Everything you made stays.` && order1,
      JSON.stringify({ stops1, day1, order1 }),
    )
    await t1.screenshot({ path: path.join(SHOTS, '094-recap-stops.png') })
    await t1.close()
    const t2 = await openNtp()
    const second = await until(t2, () => !!document.querySelector('[data-trial-end]'))
    await t2.close()
    const t3 = await openNtp()
    const third = await none(t3, '[data-trial-end]')
    await t3.close()
    check('trial recap: on two new tabs at most', second && third)

    const start4 = Date.now() - 13 * D
    await setup({ trialStartedAt: start4, ls: { 'stackable:trialEnding': '0' } })
    const t4 = await openNtp()
    await until(t4, () => !!document.querySelector('[data-trial-end]'))
    check('trial recap: no stats line while Pro has nothing to show', await t4.evaluate(() => !!document.querySelector('[data-trial-end]') && !document.querySelector('[data-trial-end-stats]')))
    const stops4 = await stops(t4)
    const day4 = await lastDay(t4, start4)
    check('trial recap: with auto-archive off, the line leaves it out and names daily snapshots', stops4 === `When it ends on ${day4}, daily snapshots stop. Everything you made stays.`, JSON.stringify({ stops4, day4 }))
    await t4.evaluate(() => [...document.querySelectorAll('[data-trial-end] button')].find((b) => b.textContent.trim() === 'Not now')?.click())
    const retired = await control.evaluate(() => localStorage.getItem('stackable:trialEnding'))
    await t4.close()
    const t5 = await openNtp()
    check('trial recap: Not now retires it', retired === '-1' && (await none(t5, '[data-trial-end]')), String(retired))
    await t5.close()

    // Keep Pro opens the checkout (caught before it opens) and remembers it, like Get Pro in Settings.
    await setup({ trialStartedAt: Date.now() - 13 * D, ls: { 'stackable:trialEnding': '0' } })
    const kp = await browser.newPage()
    await kp.setViewport({ width: 1400, height: 900 })
    kp.on('pageerror', (e) => errors.push(`trial recap: ${e.message}`))
    await kp.evaluateOnNewDocument(() => {
      window.__opened = []
      try {
        const create = chrome.tabs.create.bind(chrome.tabs)
        chrome.tabs.create = (o, ...rest) => (/polar\.sh/.test(o?.url ?? '') ? (window.__opened.push(o.url), Promise.resolve({ id: -1 })) : create(o, ...rest))
      } catch {
        // read-only binding: the real checkout tab opens and is closed below
      }
    })
    await kp.goto(NTP, { waitUntil: 'load' })
    await kp.bringToFront()
    await until(kp, () => !!document.querySelector('[data-trial-keep]'))
    await kp.evaluate(() => document.querySelector('[data-trial-keep]')?.click())
    await sleep(800)
    const opened = await kp.evaluate(() => window.__opened.slice())
    const real = browser.targets().filter((t) => /polar\.sh/.test(t.url()))
    for (const t of real) await (await t.page().catch(() => null))?.close().catch(() => {})
    const kept = await control.evaluate(async () => ({ shows: localStorage.getItem('stackable:trialEnding'), checkout: (await chrome.storage.local.get('proCheckout')).proCheckout }))
    check(
      'trial recap: Keep Pro opens the checkout and retires the card',
      (opened.some((u) => u.startsWith('https://buy.polar.sh/')) || real.length > 0) && kept.shows === '-1' && typeof kept.checkout?.at === 'number',
      JSON.stringify({ opened, real: real.length, kept }),
    )
    await kp.close()

    // 0.9.4: the ended card names what has stopped, the Today strip included while it's on, in place
    // of its "Pro features are paused" line.
    await setup({ trialStartedAt: Date.now() - 15 * D, stats: { snapshots: 14, cleaned: 23 }, archive: true, strip: true, ls: { 'stackable:trialEnded': null } })
    const e1 = await openNtp()
    const ce = (await until(e1, () => !!document.querySelector('[data-trial-end]'))) ? await card(e1) : null
    const stopsE = await stops(e1)
    check(
      'trial recap: the first tabs after the trial ends say so, with what Pro did and what has stopped',
      !!ce && ce.kind === 'ended' && ce.text.includes('Your Pro trial has ended') && ce.text.includes('Pro kept 14 snapshots and cleaned up 23 links.') && stopsE === 'Auto-archive, daily snapshots and the Today strip have stopped. Everything you made stays.' && !ce.text.includes('Pro features are paused'),
      JSON.stringify({ ce, stopsE }),
    )
    await e1.close()
    await setup({ trialStartedAt: Date.now() - 30 * D, ls: { 'stackable:trialEnded': null } })
    const e2 = await openNtp()
    check('trial recap: a trial that ended weeks ago stays quiet', await none(e2, '[data-trial-end]'))
    await e2.close()

    // An early user with the Pro note still pending and a trial in its last days: one card only.
    await setup({ trialStartedAt: Date.now() - 13 * D, ls: { 'stackable:trialEnding': null, 'stackable:whatsNew070': '0' } })
    await control.evaluate(() => chrome.storage.sync.set({ proEarly: { from: 'e2e', at: Date.now() }, proEarlyTodo: { keep: true, at: Date.now() } }))
    const both = await openNtp()
    await until(both, () => !!document.querySelector('[data-trial-end], [data-whats-new], [data-whats-new-080]'))
    await sleep(1500)
    const cards = await both.evaluate(() => document.querySelectorAll('[data-trial-end], [data-whats-new], [data-whats-new-080]').length)
    check("corner: the trial recap and a what's-new note never share a tab", cards === 1, String(cards))
    await both.close()

    // The auto-archive line, played through the note "Stash and close" leaves for its new tab.
    const spaceId = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      return (await chrome.bookmarks.getChildren(root.id)).find((c) => !c.url)?.id
    })
    const landing = async (bankruptcy) => {
      const at = Date.now()
      await control.evaluate((note) => chrome.storage.local.set({ stackboardOpenSpace: note }), { spaceId, saved: 3, at, ...(bankruptcy ? { bankruptcy: { tabs: 5, windows: 2, saved: 5, at } } : {}) })
      return openNtp()
    }
    const line = (page) => page.evaluate(() => document.querySelector('[data-moment-line]')?.innerText.replace(/\s+/g, ' ').trim() ?? null)
    await setup({ ls: { 'stackable:proMoments': null } })
    const m1 = await landing(false)
    const shown1 = await until(m1, () => !!document.querySelector('[data-moment-line]'))
    const text1 = await line(m1)
    check('auto-archive line: a free user hears it after Stash and close lands', shown1 && text1 === 'Auto-archive can do this while you work: idle tabs save themselves. Try Pro free for 14 days.', String(text1))
    await m1.evaluate(() => document.querySelector('[data-moment-pro]')?.click())
    check('auto-archive line: its link opens Settings at Stackboard Pro', await until(m1, () => !!document.querySelector('[data-pro]') && !document.querySelector('[data-moment-line]')))
    await m1.close()

    await setup({ trialStartedAt: Date.now() - 20 * D, ls: { 'stackable:proMoments': '1', 'stackable:trialEnded': '-1' } })
    const m2 = await landing(true)
    await until(m2, () => !!document.querySelector('[data-certificate]'))
    await sleep(3000)
    const during = await line(m2)
    await m2.evaluate(() => document.querySelector('[data-certificate] button[aria-label="Close"]')?.click())
    const shown2 = await until(m2, () => !!document.querySelector('[data-moment-line]'))
    const text2 = await line(m2)
    check("auto-archive line: waits for the certificate to close, and says it's part of Pro once the trial is used", during === null && shown2 && text2 === "Auto-archive does this while you work. It's part of Pro.", JSON.stringify({ during, text2 }))
    await m2.close()
    const m3 = await landing(false)
    const third3 = await until(m3, () => !!document.querySelector('[data-moment-line]'))
    await m3.close()
    const m4 = await landing(false)
    await sleep(3500)
    const fourth = await line(m4)
    await m4.close()
    const moments = await control.evaluate(() => localStorage.getItem('stackable:proMoments'))
    check('auto-archive line: three times at most', third3 && fourth === null && moments === '3', JSON.stringify({ third3, fourth, moments }))

    await setup({ trialStartedAt: Date.now() - 2 * D, ls: { 'stackable:proMoments': null } })
    const m5 = await landing(false)
    await sleep(3500)
    check('auto-archive line: never during the trial', (await line(m5)) === null)
    await m5.close()

    // What Pro did is counted where it happens: today's snapshot, taken on the trial, adds one.
    // Board tabs left open by earlier blocks all react when the trial starts, and one that Chrome froze in
    // the background mid-transaction holds the snapshot store for good (seen 4 Nov with 19 tabs open):
    // close them first so this check sees its own tab.
    for (const pg of await browser.pages()) {
      if (pg === control) continue
      if (pg.url().startsWith(`chrome-extension://${extId}/`) || pg.url().startsWith('chrome://newtab')) await pg.close().catch(() => {})
    }
    await setup({ trialStartedAt: Date.now() - 2 * D, ls: { 'stackable:snapshotDay': null } })
    await control.evaluate(async () => {
      const d = new Date()
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await new Promise((res, rej) => {
        const r = indexedDB.open('stackboard-snapshots', 1)
        r.onupgradeneeded = () => r.result.createObjectStore('days')
        r.onsuccess = () => {
          const db = r.result
          const tx = db.transaction('days', 'readwrite')
          tx.objectStore('days').delete(day)
          tx.oncomplete = () => (db.close(), res())
          tx.onerror = () => rej(tx.error)
        }
        r.onerror = () => rej(r.error)
      })
    })
    const s1 = await openNtp()
    await s1.bringToFront()
    let stats = null
    for (let t = 0; t < 12000 && !stats?.snapshots; t += 300) {
      stats = await control.evaluate(async () => (await chrome.storage.local.get('proStats')).proStats ?? null)
      if (!stats?.snapshots) await sleep(300)
    }
    // On a miss, say why: was today's snapshot taken (and when), is the day marker set, how many board tabs are open.
    const why = stats?.snapshots === 1 ? null : await control.evaluate(async () => {
      const d = new Date()
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const rec = await new Promise((res) => {
        const r = indexedDB.open('stackboard-snapshots', 1)
        r.onsuccess = () => { const q = r.result.transaction('days').objectStore('days').get(day); q.onsuccess = () => (res(q.result ? { at: q.result.at, links: q.result.counts?.links } : null), r.result.close()); q.onerror = () => res('read failed') }
        r.onerror = () => res('open failed')
      })
      return { rec, now: Date.now(), marker: localStorage.getItem('stackable:snapshotDay'), trial: (await chrome.storage.sync.get('proTrial')).proTrial ?? null }
    }).catch((e) => String(e))
    const tabs = (await browser.pages()).filter((pg) => pg.url().startsWith(`chrome-extension://${extId}/`) || pg.url().startsWith('chrome://newtab')).length
    check("pro stats: today's snapshot is counted on this computer", stats?.snapshots === 1, JSON.stringify({ stats, why, tabs }))
    await s1.close()

    await control.evaluate(async (w) => {
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo', 'proArchive', 'todayStrip'])
      await chrome.storage.local.remove(['proStats', 'proCheckout', 'proLicense', 'whatsNew080', 'stackboardOpenSpace'])
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
      for (const [k, v] of Object.entries(w.ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
    }, was)
    await sleep(400)
  }

  // ---------- 0.9.2: the reverse-trial card, and the recap for a trial that started by itself ----------
  // A new install's trial (sync proTrial.auto) gets one corner card once they've settled in: from the
  // board's third new tab and 20 hours after install, while 3 or more days are left. It says until when
  // Pro is free, and See what's in Pro opens Settings at Stackboard Pro; two new tabs at most, retired
  // when answered. Install time, the tab count and the show count are played through storage. At the
  // trial's end the usual recap comes, with Pro for life beside Keep Pro.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const D = 24 * 60 * 60 * 1000
    const H = 60 * 60 * 1000
    const LS = ['stackable:opens', 'stackable:firstSeen', 'stackable:reverseTrial', 'stackable:trialEnding', 'stackable:trialEnded', 'stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090', 'stackable:rating', 'stackable:managedOverride']
    const was = await control.evaluate(async (ls) => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo', 'proArchive', 'todayStrip']),
      local: await chrome.storage.local.get(['proCheckout', 'proLicense', 'whatsNew080', 'whatsNew090']),
      ls: Object.fromEntries(ls.map((k) => [k, localStorage.getItem(k)])),
    }), LS)
    // A quiet board on a trial that started on install at `installedAt` (auto unless `auto: false`): no
    // key, no note pending, the rating ask answered, and `opens` new tabs so far.
    const setup = (s) => control.evaluate(async (s) => {
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo'])
      for (const k of ['stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090']) localStorage.setItem(k, '-1')
      localStorage.setItem('stackable:rating', 'dismissed')
      localStorage.setItem('stackable:opens', String(s.opens))
      localStorage.setItem('stackable:firstSeen', String(s.installedAt))
      for (const [k, v] of Object.entries(s.ls ?? {})) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
      await chrome.storage.sync.set({ proTrial: s.auto === false ? { startedAt: s.installedAt } : { startedAt: s.installedAt, auto: true } })
    }, s)
    const fresh = { 'stackable:reverseTrial': null }
    const card = (page) => page.evaluate(() => {
      const c = document.querySelector('[data-reverse-trial]')
      return c ? { title: c.querySelector('h3')?.textContent.trim() ?? '', text: c.innerText.replace(/\s+/g, ' ').trim() } : null
    })
    const shown = (page) => until(page, () => !!document.querySelector('[data-reverse-trial]'))
    // The card decides 1.5 s after the board and Pro are ready; openNtp has waited 0.6 s of that.
    const none = async (page) => {
      await sleep(3000)
      return page.evaluate(() => !document.querySelector('[data-reverse-trial]'))
    }
    // A new tab that catches the checkout tab before it opens, as in the Pro card block.
    const catching = async () => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`reverse trial: ${e.message}`))
      await p.evaluateOnNewDocument(() => {
        window.__opened = []
        try {
          const create = chrome.tabs.create.bind(chrome.tabs)
          chrome.tabs.create = (o, ...rest) => (/polar\.sh/.test(o?.url ?? '') ? (window.__opened.push(o.url), Promise.resolve({ id: -1 })) : create(o, ...rest))
        } catch {
          // read-only binding: the real checkout tab opens and is closed below
        }
      })
      await p.goto(NTP, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      return p
    }
    const lastCheckout = async (p) => {
      const opened = await p.evaluate(() => window.__opened.splice(0))
      const tabs = browser.targets().filter((t) => /polar\.sh/.test(t.url())).map((t) => t.url())
      for (const t of browser.targets()) if (/polar\.sh/.test(t.url())) await (await t.page().catch(() => null))?.close().catch(() => {})
      await p.bringToFront()
      return [...opened, ...tabs].map((u) => new URL(u)).filter((u) => /(^|\.)polar\.sh$/.test(u.hostname)).pop() ?? null
    }

    // 1. Two days in, on the tenth new tab: the card and its words, then See what's in Pro.
    const at1 = Date.now() - 2 * D
    await setup({ installedAt: at1, opens: 9, ls: fresh })
    const r1 = await openNtp()
    const c1 = (await shown(r1)) ? await card(r1) : null
    const title1 = await r1.evaluate((end) => `Pro is on, free until ${new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, at1 + 14 * D)
    check(
      "reverse card: Pro is on, free until the trial's last day, with what to try and See what's in Pro",
      !!c1 && c1.title === title1 && c1.text.includes('Try Ctrl+K to jump anywhere, a to-do list, or a colour on a stack. Everything you make stays when the trial ends.') && c1.text.includes("See what's in Pro"),
      JSON.stringify({ c1, title1 }),
    )
    await r1.screenshot({ path: path.join(SHOTS, '092-reverse-card.png') })
    await r1.evaluate(() => document.querySelector('[data-reverse-trial-look]')?.click())
    const looked = await until(r1, () => !!document.querySelector('[data-pro]') && !document.querySelector('[data-reverse-trial]'))
    await sleep(300)
    const st1 = await r1.evaluate(() => {
      const pro = document.querySelector('[data-pro]')
      return {
        pro: pro?.dataset.pro ?? null,
        kind: document.querySelector('[data-pro-trial-line]')?.dataset.proTrialLine ?? null,
        line: document.querySelector('[data-pro-trial-line]')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        lifetime: document.querySelector('[data-pro-lifetime]')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        byItself: /by itself/i.test(pro?.innerText ?? ''),
        shows: localStorage.getItem('stackable:reverseTrial'),
      }
    })
    check("reverse card: See what's in Pro opens Settings at Stackboard Pro and retires the card", looked && st1.pro === 'trial' && st1.shows === '-1', JSON.stringify(st1))
    check(
      'reverse card: Settings names the trial that started on install, its days left and Pro for life, and never says it never starts by itself',
      st1.kind === 'auto' && st1.line === 'Your free Pro trial started when you added Stackboard: 12 days left. When it ends, Pro features pause and everything you made stays.' && st1.lifetime === 'Prefer to pay once? Get Pro for life for $19.' && !st1.byItself,
      JSON.stringify(st1),
    )
    await r1.close()
    const r2 = await openNtp()
    check('reverse card: once answered it stays away', await none(r2))
    await r2.close()

    // 2. Left alone it shows on two new tabs, then no more; its close button retires it as well.
    await setup({ installedAt: Date.now() - 2 * D, opens: 9, ls: fresh })
    const twice = []
    for (let i = 0; i < 3; i++) {
      const p = await openNtp()
      twice.push(i < 2 ? await shown(p) : await none(p))
      await p.close()
    }
    check('reverse card: on two new tabs at most', twice.every(Boolean), JSON.stringify(twice))
    await setup({ installedAt: Date.now() - 2 * D, opens: 9, ls: fresh })
    const r3 = await openNtp()
    await shown(r3)
    await r3.evaluate(() => document.querySelector('[data-reverse-trial] button[aria-label="Dismiss"]')?.click())
    const closed = await r3.evaluate(() => ({ gone: !document.querySelector('[data-reverse-trial]'), shows: localStorage.getItem('stackable:reverseTrial') }))
    check('reverse card: its close button retires it too', closed.gone && closed.shows === '-1', JSON.stringify(closed))
    await r3.close()

    // 3. Not on the board's first or second new tab; from the third.
    await setup({ installedAt: Date.now() - 2 * D, opens: 0, ls: fresh })
    const third = []
    for (let i = 0; i < 3; i++) {
      const p = await openNtp()
      third.push(i < 2 ? await none(p) : await shown(p))
      await p.close()
    }
    const opens = await control.evaluate(() => localStorage.getItem('stackable:opens'))
    check('reverse card: not on the first or second new tab, then on the third', third.every(Boolean) && opens === '3', JSON.stringify({ third, opens }))

    // 4. Not in the first 20 hours, not for a trial started with a click, not under the pro lock.
    await setup({ installedAt: Date.now() - 10 * H, opens: 9, ls: fresh })
    const r4 = await openNtp()
    const soon = await none(r4)
    await r4.close()
    check('reverse card: not in the first 20 hours after install', soon)
    await setup({ installedAt: Date.now() - 2 * D, opens: 9, auto: false, ls: fresh })
    const r5 = await openNtp()
    const clicked = await none(r5)
    await r5.close()
    check('reverse card: not for a trial started with a click', clicked)
    await control.evaluate(() => localStorage.setItem('stackable:managedOverride', JSON.stringify({ lock: { pro: true } })))
    await setup({ installedAt: Date.now() - 2 * D, opens: 9, ls: fresh })
    const r6 = await openNtp()
    const lockedQuiet = await none(r6)
    const lockedText = await r6.evaluate(() => document.body.innerText)
    await r6.close()
    await control.evaluate(() => localStorage.removeItem('stackable:managedOverride'))
    check('reverse card: never under the company pro lock (school mode)', lockedQuiet && !/Pro is on|free until/i.test(lockedText), lockedText.replace(/\s+/g, ' ').slice(0, 120))

    // 5. Its last two days bring the recap instead, with Pro for life beside Keep Pro; that link opens
    //    the lifetime checkout labelled auto-trial and retires the recap.
    await setup({ installedAt: Date.now() - 12.5 * D, opens: 9, ls: { ...fresh, 'stackable:trialEnding': null, 'stackable:trialEnded': null } })
    const k1 = await catching()
    const recap = await until(k1, () => document.querySelector('[data-trial-end]')?.dataset.trialEnd === 'ending')
    await sleep(2000)
    const rc = await k1.evaluate(() => ({ text: document.querySelector('[data-trial-end]')?.innerText.replace(/\s+/g, ' ').trim() ?? '', reverse: !!document.querySelector('[data-reverse-trial]') }))
    await k1.screenshot({ path: path.join(SHOTS, '092-recap-lifetime.png') })
    check(
      'reverse trial: its last two days bring the recap with Pro for life beside Keep Pro, and no reverse card',
      recap && /Your Pro trial ends (today|tomorrow|in 2 days)/.test(rc.text) && /Keep Pro for \$\d\.\d\d a year ?or \$19 once ?Not now/.test(rc.text) && !rc.reverse,
      JSON.stringify(rc),
    )
    await k1.evaluate(() => document.querySelector('[data-trial-lifetime]')?.click())
    await sleep(800)
    const once = await lastCheckout(k1)
    const kept = await control.evaluate(async () => ({ shows: localStorage.getItem('stackable:trialEnding'), checkout: (await chrome.storage.local.get('proCheckout')).proCheckout ?? null }))
    check(
      'reverse trial: or $19 once opens the lifetime checkout, labelled trial-end-lifetime and auto-trial, and retires the recap',
      !!once && once.origin + once.pathname === LIFETIME_CHECKOUT && once.searchParams.get('utm_medium') === 'trial-end-lifetime' && once.searchParams.get('utm_content') === 'auto-trial' && kept.shows === '-1' && kept.checkout?.lifetime === true,
      JSON.stringify({ once: once?.href, kept }),
    )
    await k1.close()

    // 6. After it ends: the recap says so, and Settings sells Pro with Pro for life, its checkout
    //    labelled auto-trial-ended.
    await setup({ installedAt: Date.now() - 15 * D, opens: 9, ls: { ...fresh, 'stackable:trialEnded': null } })
    const k2 = await catching()
    const ended = await until(k2, () => document.querySelector('[data-trial-end]')?.dataset.trialEnd === 'ended')
    const endedText = await k2.evaluate(() => document.querySelector('[data-trial-end]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
    check('reverse trial: once it ends the recap says so, with Pro for life', ended && endedText.includes('Your Pro trial has ended') && endedText.includes('or $19 once'), endedText)
    await k2.evaluate(() => [...document.querySelectorAll('[data-trial-end] button')].find((b) => b.textContent.trim() === 'Not now')?.click())
    await k2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    await until(k2, () => document.querySelector('[data-pro]')?.dataset.pro === 'free')
    const st2 = await k2.evaluate(() => ({
      text: document.querySelector('[data-pro]')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      lifetime: document.querySelector('[data-pro-lifetime]')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      // 0.9.3: the priced Get Pro, leading now (no outline), and the refund line above Pro for life.
      getPro: (() => {
        const b = [...document.querySelectorAll('[data-pro] button')].find((b) => /^Get Pro for \$/.test(b.textContent.trim()))
        return b ? { text: b.textContent.trim(), leads: !b.className.includes('border') } : null
      })(),
      refund: document.querySelector('[data-pro-refund]')?.innerText.trim() ?? null,
      above: !!document.querySelector('[data-pro-refund] + [data-pro-lifetime]'),
    }))
    check(
      'refund line: after the trial, Settings leads with the priced Get Pro and shows the refund line above Pro for life',
      /^Get Pro for \$\d+\.\d\d a year$/.test(st2.getPro?.text ?? '') && !!st2.getPro?.leads && st2.refund === 'Checkout is by Polar: card, Apple Pay or Google Pay. Changed your mind? Full refund within 14 days.' && st2.above,
      JSON.stringify({ getPro: st2.getPro, refund: st2.refund, above: st2.above }),
    )
    await k2.evaluate(() => [...document.querySelectorAll('[data-pro-lifetime] button')].find((b) => b.textContent.trim() === 'Get Pro for life')?.click())
    await sleep(800)
    const ended2 = await lastCheckout(k2)
    check(
      'reverse trial: after it, Settings says the trial ended and offers Pro for life, labelled auto-trial-ended, and never says it never starts by itself',
      st2.text.includes('Your trial has ended, so Pro features are paused.') && st2.lifetime === 'Prefer to pay once? Get Pro for life for $19.' && !/by itself/i.test(st2.text) && !!ended2 && ended2.origin + ended2.pathname === LIFETIME_CHECKOUT && ended2.searchParams.get('utm_medium') === 'settings-lifetime' && ended2.searchParams.get('utm_content') === 'auto-trial-ended',
      JSON.stringify({ st2, ended2: ended2?.href }),
    )
    await k2.close()

    // 7. A key whose plan has ended (Renew Pro) gets the same line under its buttons.
    await control.evaluate(async () => {
      await chrome.storage.sync.remove('proTrial')
      await chrome.storage.local.set({ proLicense: { key: 'SB-E2E0-0000-0000-E2ED', activationId: 'act-ended', status: 'revoked', checkedAt: Date.now() } })
      await chrome.storage.sync.set({ proKey: { key: 'SB-E2E0-0000-0000-E2ED' } })
    })
    await sleep(400)
    const k3 = await openNtp()
    await k3.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    const renew = await until(k3, () => document.querySelector('[data-pro-reason]')?.dataset.proReason === 'ended')
    const st3 = await k3.evaluate(() => ({
      buttons: [...document.querySelectorAll('[data-pro] button')].map((b) => b.textContent.trim()),
      lifetime: document.querySelector('[data-pro-lifetime]')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      refund: document.querySelector('[data-pro-refund]')?.innerText.trim() ?? null,
      above: !!document.querySelector('[data-pro-refund] + [data-pro-lifetime]'),
    }))
    check('lifetime: a key whose plan has ended offers Renew Pro, with Pro for life under it', renew && st3.buttons.includes('Renew Pro') && st3.lifetime === 'Prefer to pay once? Get Pro for life for $19.', JSON.stringify(st3))
    check('refund line: a key whose plan has ended shows it under Renew Pro, above Pro for life', renew && st3.refund === 'Checkout is by Polar: card, Apple Pay or Google Pay. Changed your mind? Full refund within 14 days.' && st3.above, JSON.stringify(st3))
    await k3.close()

    // 8. (0.9.4) Beside See what's in Pro, two small buttons switch on auto-archive (12 hours) and the
    //    Today strip through their settings, then say so; a tap answers the card. A feature that's on
    //    already gets no button, and Settings during the trial offers what's still off, under the trial line.
    await setup({ installedAt: Date.now() - 2 * D, opens: 9, ls: fresh })
    await control.evaluate(() => chrome.storage.sync.remove(['proArchive', 'todayStrip']))
    await sleep(400)
    const switches = (page, sel) =>
      page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-trial-switch]`)].map((b) => `${b.dataset.trialSwitch}${b.hasAttribute('data-on') ? ' on' : ''}: ${b.textContent.trim()}`), sel)
    const synced = async (key) => {
      for (let t = 0; t < 4000; t += 150) {
        const v = await control.evaluate(async (k) => (await chrome.storage.sync.get(k))[k] ?? null, key)
        if (v) return v
        await sleep(150)
      }
      return null
    }
    const w1 = await openNtp()
    const offered = (await shown(w1)) ? await switches(w1, '[data-reverse-trial]') : null
    check(
      "reverse card: two small buttons beside See what's in Pro, Turn on auto-archive and Show the Today strip",
      offered?.join('|') === 'archive: Turn on auto-archive|strip: Show the Today strip' && (await w1.evaluate(() => !!document.querySelector('[data-reverse-trial] [data-reverse-trial-look]'))),
      JSON.stringify(offered),
    )
    const tappedAt = Date.now()
    await w1.evaluate(() => document.querySelector('[data-reverse-trial] [data-trial-switch="archive"]')?.click())
    const arc = await synced('proArchive')
    const arcSays = await until(w1, () => document.querySelector('[data-reverse-trial] [data-trial-switch="archive"][data-on]')?.textContent.trim() === 'Auto-archive is on: idle tabs save themselves after 12 hours')
    // As when it's switched on in Settings, the service worker starts its record of tab switches.
    let rec = null
    for (let t = 0; t < 3000 && !rec; t += 150) {
      rec = await control.evaluate(async () => (await chrome.storage.session.get('tabSeen')).tabSeen ?? null)
      if (!rec) await sleep(150)
    }
    check(
      'reverse card: Turn on auto-archive sets 12 hours and then says so, and the worker starts its tab record',
      arc?.afterMs === 12 * H && arcSays && !!rec && rec.since >= tappedAt - 1000,
      JSON.stringify({ arc, arcSays, rec: rec && { since: rec.since - tappedAt } }),
    )
    await w1.evaluate(() => document.querySelector('[data-reverse-trial] [data-trial-switch="strip"]')?.click())
    const strip = await synced('todayStrip')
    const stripSays = await until(w1, () => document.querySelector('[data-reverse-trial] [data-trial-switch="strip"][data-on]')?.textContent.trim() === 'Today strip is on' && !!document.querySelector('[data-today-strip]'))
    check('reverse card: Show the Today strip switches it on, the strip shows above the board, and the button says so', strip?.on === true && stripSays, JSON.stringify({ strip, stripSays }))
    const kept1 = await w1.evaluate(() => ({
      card: !!document.querySelector('[data-reverse-trial]'),
      done: [...document.querySelectorAll('[data-reverse-trial] [data-trial-switch][data-on]')].map((b) => b.disabled),
      shows: localStorage.getItem('stackable:reverseTrial'),
    }))
    check('reverse card: it stays up saying both are on, and a tap answers it', kept1.card && kept1.done.length === 2 && kept1.done.every(Boolean) && kept1.shows === '-1', JSON.stringify(kept1))
    await w1.screenshot({ path: path.join(SHOTS, '094-reverse-switches.png') })
    await w1.close()

    // Auto-archive stays on and the strip goes off: a fresh card offers the strip alone, and so does
    // Settings, where a tap switches it on too; with both on, Settings has no row.
    await setup({ installedAt: Date.now() - 2 * D, opens: 9, ls: fresh })
    await control.evaluate(() => chrome.storage.sync.remove('todayStrip'))
    await sleep(400)
    const w2 = await openNtp()
    const one = (await shown(w2)) ? await switches(w2, '[data-reverse-trial]') : null
    check('reverse card: a feature that is on already gets no button', one?.join('|') === 'strip: Show the Today strip', JSON.stringify(one))
    await w2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    await until(w2, () => document.querySelector('[data-pro]')?.dataset.pro === 'trial' && !!document.querySelector('[data-pro-trial-switches]'))
    const row1 = await w2.evaluate(() => {
      const r = document.querySelector('[data-pro-trial-switches]')
      return {
        label: r?.querySelector('span')?.textContent.trim() ?? null,
        buttons: [...(r?.querySelectorAll('[data-trial-switch]') ?? [])].map((b) => `${b.dataset.trialSwitch}: ${b.textContent.trim()}`),
        under: !!r && r.previousElementSibling === document.querySelector('[data-pro-trial-line]'),
        kind: document.querySelector('[data-pro-trial-line]')?.dataset.proTrialLine ?? null,
      }
    })
    check(
      'trial switches: Settings during the trial offers only what is still off, under the trial line',
      row1.label === 'Make the most of your trial:' && row1.buttons.join('|') === 'strip: Show the Today strip' && row1.under && row1.kind === 'auto',
      JSON.stringify(row1),
    )
    await w2.evaluate(() => document.querySelector('[data-pro-trial-switches]')?.scrollIntoView({ block: 'center' }))
    await sleep(300)
    await w2.screenshot({ path: path.join(SHOTS, '094-settings-switches.png') })
    await w2.evaluate(() => document.querySelector('[data-pro-trial-switches] [data-trial-switch="strip"]')?.click())
    const rowSays = await until(
      w2,
      () => document.querySelector('[data-pro-trial-switches] [data-trial-switch="strip"][data-on]')?.textContent.trim() === 'Today strip is on' && document.querySelector('[data-today-strip-setting] [data-option="on"]')?.getAttribute('aria-checked') === 'true',
    )
    const strip2 = await synced('todayStrip')
    check('trial switches: a tap in Settings switches the strip on and says so, and the setting below agrees', rowSays && strip2?.on === true, JSON.stringify({ rowSays, strip2 }))
    await w2.keyboard.press('Escape')
    await until(w2, () => !document.querySelector('[role=dialog]'))
    await w2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    await until(w2, () => document.querySelector('[data-pro]')?.dataset.pro === 'trial')
    await sleep(300)
    const row2 = await w2.evaluate(() => ({ line: !!document.querySelector('[data-pro-trial-line]'), row: !!document.querySelector('[data-pro-trial-switches]') }))
    check('trial switches: with both on, Settings shows no row', row2.line && !row2.row, JSON.stringify(row2))
    await w2.close()

    await control.evaluate(async (w) => {
      // The license first, so no open page tries to free a computer for a key that never was.
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo', 'proArchive', 'todayStrip'])
      if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      for (const [k, v] of Object.entries(w.ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
    }, was)
    await sleep(400)
  }

  // ---------- 0.9.3: "What stopped you?" after a checkout with no purchase ----------
  // A computer that opened the checkout 10 minutes to 7 days ago, with Pro still off, gets one corner
  // card: five one-tap answers, and Something else opens a line to type. A store build sends a picked
  // answer to getstackboard.com/api/why; this unpacked build keeps it in localStorage
  // (stackable:whyLast) instead, which is what these checks read. Once per checkout, answered or
  // closed, and three checkouts at most. The checkout's time is played through storage.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const M = 60 * 1000
    const D = 24 * 60 * M
    const LS = ['stackable:whyNotAt', 'stackable:whyNotAsked', 'stackable:whyLast', 'stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090', 'stackable:rating', 'stackable:managedOverride']
    const was = await control.evaluate(async (ls) => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo']),
      local: await chrome.storage.local.get(['proCheckout', 'proLicense', 'whatsNew080', 'whatsNew090']),
      ls: Object.fromEntries(ls.map((k) => [k, localStorage.getItem(k)])),
    }), LS)
    const version = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version
    // A quiet free board (no key, no trial, no note pending, the rating ask answered) that opened the
    // checkout `ago` ms ago, the Pro for life one when `lifetime`, with no answer kept from before.
    const setup = (s) => control.evaluate(async (s) => {
      // The license first, so no open page tries to free a computer for a key that never was.
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo'])
      for (const k of ['stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090']) localStorage.setItem(k, '-1')
      localStorage.setItem('stackable:rating', 'dismissed')
      localStorage.removeItem('stackable:whyLast')
      for (const [k, v] of Object.entries(s.ls ?? {})) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
      const at = Date.now() - s.ago
      await chrome.storage.local.set({ proCheckout: s.lifetime ? { at, lifetime: true } : { at } })
      return at
    }, s)
    const fresh = { 'stackable:whyNotAt': null, 'stackable:whyNotAsked': null }
    const card = (page) => page.evaluate(() => {
      const c = document.querySelector('[data-why-not]')
      return c
        ? {
            title: c.querySelector('h3')?.textContent.trim() ?? '',
            line: c.querySelector('h3 + p')?.textContent.trim() ?? '',
            answers: [...c.querySelectorAll('[data-why-reason]')].map((b) => `${b.dataset.whyReason}: ${b.textContent.trim()}`),
          }
        : null
    })
    const shown = (page) => until(page, () => !!document.querySelector('[data-why-not]'))
    // The card decides 2 s after the board and Pro are ready; openNtp has waited 0.6 s of that.
    const none = async (page) => {
      await sleep(3500)
      return page.evaluate(() => !document.querySelector('[data-why-not]'))
    }
    const sent = () => control.evaluate(() => JSON.parse(localStorage.getItem('stackable:whyLast') ?? 'null'))
    const pick = (page, reason) => page.evaluate((r) => document.querySelector(`[data-why-not] [data-why-reason="${r}"]`)?.click(), reason)
    const thanked = (page) => until(page, () => (document.querySelector('[data-why-not]')?.innerText ?? '').includes('Thanks, that helps.'))

    // 1. A free board 15 minutes after the checkout: the card and its words, then Just looking in one
    //    tap (0.9.4: The price brings an offer now, step 6).
    const at1 = await setup({ ago: 15 * M, ls: fresh })
    const w1 = await openNtp()
    const c1 = (await shown(w1)) ? await card(w1) : null
    check(
      "why not: 15 minutes after a checkout, a free board asks Didn't get Pro? with five one-tap answers",
      !!c1 && c1.title === "Didn't get Pro?" && c1.line === "What stopped you? One tap, and it's optional." && c1.answers.join('|') === 'looking: Just looking|try-first: Want to try it first|price: The price|payment: Payment method|other: Something else',
      JSON.stringify(c1),
    )
    await w1.screenshot({ path: path.join(SHOTS, '093-why-not.png') })
    const marked1 = await control.evaluate(() => ({ at: localStorage.getItem('stackable:whyNotAt'), asked: localStorage.getItem('stackable:whyNotAsked'), sent: localStorage.getItem('stackable:whyLast') }))
    check('why not: asking marks that checkout on this computer and counts it, and sends nothing yet', marked1.at === String(at1) && marked1.asked === '1' && marked1.sent === null, JSON.stringify({ marked1, at1 }))
    await pick(w1, 'looking')
    const thanks1 = await thanked(w1)
    const t1 = Date.now()
    const got1 = await sent()
    check(
      'why not: Just looking thanks them and keeps what a store build would send: the reason, no note, the plan, the yearly checkout and the version, nothing else',
      thanks1 && JSON.stringify(got1) === JSON.stringify({ reason: 'looking', note: '', plan: 'free', product: 'yearly', v: version }),
      JSON.stringify({ thanks1, got1, version }),
    )
    const offer1 = await w1.evaluate(() => !!document.querySelector('[data-why-offer], [data-why-offer-buy]') || /founding offer|\$9\.99/.test(document.querySelector('[data-why-not]')?.innerText ?? ''))
    check('why not: Just looking brings no offer', !offer1)
    const gone1 = await until(w1, () => !document.querySelector('[data-why-not]'), null, 8000)
    const after1 = Date.now() - t1
    check('why not: after an answer the thanks closes itself in about 4 seconds', gone1 && after1 > 2500 && after1 < 7000, String(after1))
    await w1.close()
    const w2 = await openNtp()
    check('why not: once answered, that checkout never brings it back', await none(w2))
    await w2.close()

    // 2. A Pro for life checkout two days ago, and Something else with a line typed: the line goes along.
    await setup({ ago: 2 * D, lifetime: true, ls: fresh })
    const w3 = await openNtp()
    await w3.bringToFront()
    await shown(w3)
    await pick(w3, 'other')
    const field = await until(w3, () => !!document.activeElement && document.activeElement === document.querySelector('[data-why-not] input'))
    const f3 = await w3.evaluate(() => {
      const i = document.querySelector('[data-why-not] input')
      return {
        placeholder: i?.placeholder ?? null,
        max: i?.maxLength ?? null,
        send: [...document.querySelectorAll('[data-why-not] button')].some((b) => b.textContent.trim() === 'Send'),
        sent: localStorage.getItem('stackable:whyLast'),
      }
    })
    check('why not: Something else opens a line to type (300 characters at most) with Send, and sends nothing yet', field && f3.placeholder === 'Anything to add? (optional)' && f3.max === 300 && f3.send && f3.sent === null, JSON.stringify({ field, f3 }))
    await w3.keyboard.type('Need an invoice for work')
    await w3.evaluate(() => [...document.querySelectorAll('[data-why-not] button')].find((b) => b.textContent.trim() === 'Send')?.click())
    const thanks3 = await thanked(w3)
    const got3 = await sent()
    check(
      'why not: Send keeps the typed line with the answer, and a Pro for life checkout records lifetime',
      thanks3 && JSON.stringify(got3) === JSON.stringify({ reason: 'other', note: 'Need an invoice for work', plan: 'free', product: 'lifetime', v: version }),
      JSON.stringify(got3),
    )
    await w3.close()

    // 3. Want to try it first, on a board that never had the trial: Start the free trial starts it.
    await setup({ ago: 20 * M, ls: fresh })
    const w4 = await openNtp()
    await shown(w4)
    await pick(w4, 'try-first')
    const offer4 = await until(w4, () => !!document.querySelector('[data-why-trial]'))
    await sleep(4500) // longer than a plain answer's thanks stays
    const s4 = await w4.evaluate(() => ({ text: document.querySelector('[data-why-not]')?.innerText.replace(/\s+/g, ' ').trim() ?? null, button: document.querySelector('[data-why-trial]')?.textContent.trim() ?? null }))
    const got4 = await sent()
    check(
      'why not: Want to try it first thanks them and offers Start the free trial, and waits for them',
      offer4 && s4.button === 'Start the free trial' && !!s4.text?.includes('Thanks, that helps.') && got4?.reason === 'try-first' && got4.plan === 'free' && got4.product === 'yearly',
      JSON.stringify({ s4, got4 }),
    )
    await w4.evaluate(() => document.querySelector('[data-why-trial]')?.click())
    let trial4 = null
    for (let t = 0; t < 6000 && !trial4; t += 200) {
      trial4 = await control.evaluate(async () => (await chrome.storage.sync.get('proTrial')).proTrial ?? null)
      if (!trial4) await sleep(200)
    }
    const want4 = trial4 ? await w4.evaluate((end) => `Pro is on, free until ${new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`, trial4.startedAt + 14 * D) : null
    const on4 = !!want4 && (await until(w4, (w) => document.querySelector('[data-why-trial-on]')?.textContent.trim() === w, want4))
    check(
      'why not: Start the free trial starts the 14-day trial (a click, so no auto mark) and says until when',
      typeof trial4?.startedAt === 'number' && Math.abs(Date.now() - trial4.startedAt) < 60000 && !('auto' in trial4) && on4,
      JSON.stringify({ trial4, want4, on4 }),
    )
    await w4.close()

    // 4. Its close button: nothing sent, and that checkout never brings it back.
    await setup({ ago: 30 * M, ls: fresh })
    const w5 = await openNtp()
    await shown(w5)
    await w5.evaluate(() => document.querySelector('[data-why-not] button[aria-label="Dismiss"]')?.click())
    const closed5 = await w5.evaluate(() => !document.querySelector('[data-why-not]'))
    const got5 = await sent()
    await w5.close()
    const w6 = await openNtp()
    const back6 = await none(w6)
    await w6.close()
    check('why not: its close button sends nothing, and that checkout never brings it back', closed5 && got5 === null && back6, JSON.stringify({ closed5, got5, back6 }))

    // 5. Never with Pro on, under the company's pro lock, for a checkout 5 minutes old, or after three.
    await setup({ ago: 15 * M, ls: fresh })
    await control.evaluate(async () => {
      const now = Date.now()
      // The license first: a key that arrives without one makes open pages activate it.
      await chrome.storage.local.set({ proLicense: { key: 'SB-E2E0-0000-0000-0093', activationId: 'act-why', status: 'granted', checkedAt: now, okAt: now } })
      await chrome.storage.sync.set({ proKey: { key: 'SB-E2E0-0000-0000-0093' } })
    })
    await sleep(400)
    const w7 = await openNtp()
    const paid7 = await until(w7, () => !!document.querySelector('[data-pro-crown]'))
    const quiet7 = await none(w7)
    await w7.close()
    check('why not: never with Pro on', paid7 && quiet7, JSON.stringify({ paid7, quiet7 }))

    await control.evaluate(() => localStorage.setItem('stackable:managedOverride', JSON.stringify({ lock: { pro: true } })))
    await setup({ ago: 15 * M, ls: fresh })
    const w8 = await openNtp()
    const locked8 = await none(w8)
    const text8 = await w8.evaluate(() => document.body.innerText)
    await w8.close()
    await control.evaluate(() => localStorage.removeItem('stackable:managedOverride'))
    check("why not: never under the company's pro lock (school mode)", locked8 && !/Didn't get Pro|What stopped you/i.test(text8), text8.replace(/\s+/g, ' ').slice(0, 120))

    await setup({ ago: 5 * M, ls: fresh })
    const w9 = await openNtp()
    const soon9 = await none(w9)
    await w9.close()
    check('why not: not for a checkout opened 5 minutes ago', soon9)

    await setup({ ago: 15 * M, ls: { 'stackable:whyNotAt': '1', 'stackable:whyNotAsked': '3' } })
    const w10 = await openNtp()
    const max10 = await none(w10)
    await w10.close()
    check('why not: three checkouts at most on this computer', max10)

    // 6. (0.9.4) The price, while the founding price lasts: after the thanks, the founding offer on Pro
    //    for life, and the card waits for them. Its button opens the offer's own checkout (caught before
    //    it opens, as in the Pro card block), labelled why-price-offer, as a Pro for life checkout, so
    //    Back to checkout in the finishing steps opens the offer again. Settings itself keeps $19.
    const catching = async () => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`why not offer: ${e.message}`))
      await p.evaluateOnNewDocument(() => {
        window.__opened = []
        try {
          const create = chrome.tabs.create.bind(chrome.tabs)
          chrome.tabs.create = (o, ...rest) => (/polar\.sh/.test(o?.url ?? '') ? (window.__opened.push(o.url), Promise.resolve({ id: -1 })) : create(o, ...rest))
        } catch {
          // read-only binding: the real checkout tab opens and is closed below
        }
      })
      await p.goto(NTP, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      return p
    }
    const lastCheckout = async (p) => {
      const opened = await p.evaluate(() => window.__opened.splice(0))
      const tabs = browser.targets().filter((t) => /polar\.sh/.test(t.url())).map((t) => t.url())
      for (const t of browser.targets()) if (/polar\.sh/.test(t.url())) await (await t.page().catch(() => null))?.close().catch(() => {})
      await p.bringToFront()
      return [...opened, ...tabs].map((u) => new URL(u)).filter((u) => /(^|\.)polar\.sh$/.test(u.hostname)).pop() ?? null
    }
    await setup({ ago: 15 * M, ls: fresh })
    const w11 = await catching()
    await shown(w11)
    await pick(w11, 'price')
    const thanks11 = await thanked(w11)
    const got11 = await sent()
    const offered11 = await until(w11, () => !!document.querySelector('[data-why-offer-buy]'))
    await sleep(4500) // longer than a plain answer's thanks stays
    const s11 = await w11.evaluate(() => ({
      card: !!document.querySelector('[data-why-not]'),
      line: document.querySelector('[data-why-offer]')?.textContent.trim() ?? null,
      button: document.querySelector('[data-why-offer-buy]')?.textContent.trim() ?? null,
    }))
    check(
      'why not: The price thanks them, keeps the answer, offers Pro for life for $9.99 until 31 Dec, and waits for them',
      thanks11 && JSON.stringify(got11) === JSON.stringify({ reason: 'price', note: '', plan: 'free', product: 'yearly', v: version }) && offered11 && s11.card && s11.line === "Here's a founding offer: Pro for life for $9.99 (usually $19), until 31 Dec." && s11.button === 'Get Pro for life for $9.99',
      JSON.stringify({ thanks11, got11, s11 }),
    )
    await w11.screenshot({ path: path.join(SHOTS, '094-why-price-offer.png') })
    await w11.evaluate(() => document.querySelector('[data-why-offer-buy]')?.click())
    await sleep(800)
    const offer11 = await lastCheckout(w11)
    const mark11 = await control.evaluate(async () => (await chrome.storage.local.get('proCheckout')).proCheckout ?? null)
    const closed11 = await w11.evaluate(() => !document.querySelector('[data-why-not]'))
    check(
      'why not: Get Pro for life for $9.99 opens the offer checkout labelled why-price-offer, as a Pro for life checkout, and the card closes',
      !!offer11 && offer11.origin + offer11.pathname === LIFETIME_OFFER_CHECKOUT && offer11.searchParams.get('utm_medium') === 'why-price-offer' && offer11.searchParams.get('utm_source') === 'extension-dev' && offer11.searchParams.get('utm_content') === 'free' && offer11.searchParams.get('utm_campaign') === `v${version}` && mark11?.lifetime === true && mark11?.offer === true && closed11,
      JSON.stringify({ offer11: offer11?.href, mark11, closed11 }),
    )
    await w11.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    await until(w11, () => !!document.querySelector('[data-pro-pending]'))
    await w11.evaluate(() => [...document.querySelectorAll('[data-pro-pending] button')].find((b) => b.textContent.trim() === 'Back to checkout')?.click())
    await sleep(800)
    const back11 = await lastCheckout(w11)
    check('why not: Back to checkout in the finishing steps opens the offer again', !!back11 && back11.origin + back11.pathname === LIFETIME_OFFER_CHECKOUT && back11.searchParams.get('utm_medium') === 'settings-pending', String(back11?.href))
    // With no checkout pending, Settings sells Pro for life at $19, through the public link.
    await control.evaluate(() => chrome.storage.local.remove('proCheckout'))
    await until(w11, () => !document.querySelector('[data-pro-pending]') && !!document.querySelector('[data-pro-lifetime]'))
    const life11 = await w11.evaluate(() => document.querySelector('[data-pro-lifetime]')?.innerText.replace(/\s+/g, ' ').trim() ?? null)
    await w11.evaluate(() => [...document.querySelectorAll('[data-pro-lifetime] button')].find((b) => b.textContent.trim() === 'Get Pro for life')?.click())
    await sleep(800)
    const public11 = await lastCheckout(w11)
    const text11 = await w11.evaluate(() => document.body.innerText)
    check(
      'why not: the offer stays in the card: Settings still sells Pro for life for $19, through the public link',
      life11 === 'Prefer to pay once? Get Pro for life for $19.' && !!public11 && public11.origin + public11.pathname === LIFETIME_CHECKOUT && !/\$9\.99|founding offer/.test(text11),
      JSON.stringify({ life11, public11: public11?.href }),
    )
    await w11.close()

    await control.evaluate(async (w) => {
      // The license first, as above.
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo'])
      if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      for (const [k, v] of Object.entries(w.ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
    }, was)
    await sleep(400)
  }

  // ---------- 0.9.5: the December founding-price note ----------
  // $2.99 a year is the founding price for new buyers until 31 Dec, 23:59 Singapore time. From 1 Dec a
  // free or trial board that isn't an early user's gets one corner card, and one more in the last four
  // days. Each page here has its own clock (Date.now, moved before the app loads); the dates and the
  // other rules are unit-tested.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const LS = ['stackable:foundingNote', 'stackable:opens', 'stackable:firstSeen', 'stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090', 'stackable:rating', 'stackable:managedOverride']
    const was = await control.evaluate(async (ls) => ({
      sync: await chrome.storage.sync.get(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo']),
      local: await chrome.storage.local.get(['proCheckout', 'proLicense', 'whatsNew080', 'whatsNew090']),
      ls: Object.fromEntries(ls.map((k) => [k, localStorage.getItem(k)])),
    }), LS)
    // A quiet free board that has settled in (ten new tabs over five days), nothing else due in the
    // corner, and the note never shown; `early` makes it an early user's.
    const setup = (s) => control.evaluate(async (s) => {
      // The license first, so no open page tries to free a computer for a key that never was.
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo'])
      for (const k of ['stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090']) localStorage.setItem(k, '-1')
      localStorage.setItem('stackable:rating', 'dismissed')
      localStorage.setItem('stackable:opens', '10')
      localStorage.setItem('stackable:firstSeen', String(Date.now() - 5 * 86400000))
      localStorage.removeItem('stackable:managedOverride')
      localStorage.removeItem('stackable:foundingNote')
      if (s.early) await chrome.storage.sync.set({ proEarly: { from: 'e2e', at: Date.now() } })
    }, s)
    // A new tab whose clock reads `at`.
    const openAt = async (at) => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`founding note: ${e.message}`))
      await p.evaluateOnNewDocument((at) => {
        const real = Date.now.bind(Date)
        const shift = at - real()
        Date.now = () => real() + shift
      }, at)
      await p.goto(NTP, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      return p
    }
    const note = (p) => p.evaluate(() => {
      const c = document.querySelector('[data-founding-note]')
      return c ? { window: c.dataset.foundingNote, title: c.querySelector('h3')?.textContent.trim() ?? '', text: c.innerText.replace(/\s+/g, ' ').trim() } : null
    })
    const shown = (p) => until(p, () => !!document.querySelector('[data-founding-note]'))
    // The card decides 2.5 s after the board and Pro are ready.
    const none = async (p) => {
      await sleep(4000)
      return p.evaluate(() => !document.querySelector('[data-founding-note]'))
    }
    const sgt = (iso) => Date.parse(`${iso}+08:00`)

    // 1. Before 1 Dec, nothing.
    await setup({})
    const n0 = await openAt(sgt('2026-11-30T20:00:00'))
    check('founding note: nothing before 1 Dec', await none(n0))
    await n0.close()

    // 2. In December a free board that isn't an early user's gets the card; See Pro opens Settings at Stackboard Pro.
    const n1 = await openAt(sgt('2026-12-02T12:00:00'))
    const c1 = (await shown(n1)) ? await note(n1) : null
    check(
      'founding note: in December a free board gets "$2.99 a year ends on 31 Dec", its line and See Pro',
      !!c1 && c1.window === 'december' && c1.title === '$2.99 a year ends on 31 Dec' && c1.text.includes('After that Pro is $4.99 a year. If you join before then, it stays $2.99 while you keep Pro.') && c1.text.includes('See Pro'),
      JSON.stringify(c1),
    )
    await n1.screenshot({ path: path.join(SHOTS, '095-founding-note.png') })
    await n1.evaluate(() => document.querySelector('[data-founding-see-pro]')?.click())
    check('founding note: See Pro opens Settings at Stackboard Pro', await until(n1, () => !!document.querySelector('[role=dialog] [data-pro]') && !document.querySelector('[data-founding-note]')))
    await n1.close()

    // 3. One new tab in that window, one more in the last four days, then no more.
    const n2 = await openAt(sgt('2026-12-05T12:00:00'))
    const again = await none(n2)
    await n2.close()
    const n3 = await openAt(sgt('2026-12-29T12:00:00'))
    const c3 = (await shown(n3)) ? await note(n3) : null
    await n3.close()
    const n4 = await openAt(sgt('2026-12-30T12:00:00'))
    const third = await none(n4)
    await n4.close()
    check('founding note: one new tab from 1 Dec, one more in the last four days, then no more', again && c3?.window === 'last-days' && third, JSON.stringify({ again, c3, third }))

    // 4. Never for an early user, who keeps $2.99 whenever they buy.
    await setup({ early: true })
    const n5 = await openAt(sgt('2026-12-02T12:00:00'))
    const quiet = await none(n5)
    const said = await n5.evaluate(() => document.body.innerText)
    await n5.close()
    check('founding note: never for an early user', quiet && !said.includes('ends on 31 Dec'), said.replace(/\s+/g, ' ').slice(0, 120))

    await control.evaluate(async (w) => {
      // The license first, as above.
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo'])
      if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      for (const [k, v] of Object.entries(w.ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
    }, was)
    await sleep(400)
  }

  // ---------- 0.8.0: nested folders ----------
  // A folder inside a stack folder shows in the stack card as a folded section; deeper folders
  // nest inside it. Open folders are remembered on this device. Search, open-all, share (as one
  // flat list), delete and undo, drags and the clean-up all reach inside.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const made = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const mk = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, url })
      const space = await mk(root.id, '🪆 Nested test')
      const projects = await mk(space.id, 'Projects')
      await mk(projects.id, 'Top link', 'https://example.com/?nest=top')
      await mk(projects.id, 'Second link', 'https://example.com/?nest=second')
      const clients = await mk(projects.id, 'Clients')
      for (let i = 0; i < 6; i++) await mk(clients.id, `Client ${i}`, `https://example.com/?nest=client${i}`)
      const globex = await mk(clients.id, 'Globex')
      for (let i = 0; i < 8; i++) await mk(globex.id, `Globex doc ${i}`, `https://example.com/?nest=globex${i}`)
      await mk(globex.id, 'Zebra roadmap', 'https://example.com/?nest=zebra')
      const other = await mk(space.id, 'Other')
      await mk(other.id, 'Other link', 'https://example.com/?nest=other')
      return { space: space.id, projects: projects.id, clients: clients.id, globex: globex.id, other: other.id }
    })
    const page = await openNtp()
    await page.bringToFront()
    await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Nested test'))?.click())
    await until(page, () => document.querySelector('main h1')?.textContent === 'Nested test' && !!document.querySelector('[data-folder]'))
    const folderState = (p) =>
      p.evaluate(() => {
        const f = (n) => [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === n)
        const links = (q) => document.querySelectorAll(`a[href*="nest=${q}"]`).length
        return {
          clients: f('Clients') ? { open: f('Clients').querySelector('button[aria-expanded]').getAttribute('aria-expanded'), depth: f('Clients').dataset.depth, count: f('Clients').querySelector('[data-folder-count]').textContent } : null,
          globex: f('Globex') ? { open: f('Globex').querySelector('button[aria-expanded]').getAttribute('aria-expanded'), depth: f('Globex').dataset.depth } : null,
          top: links('top'),
          client: links('client'),
          globexLinks: links('globex') + links('zebra'),
        }
      })
    const folded = await folderState(page)
    check('nested: a folder in a stack shows as a folded section with its link count', folded.clients?.open === 'false' && folded.clients.depth === '1' && folded.clients.count === '15' && folded.top === 1 && folded.client === 0 && !folded.globex, JSON.stringify(folded))

    const unfold = (p, name) => p.evaluate((n) => [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === n)?.querySelector('button[aria-expanded]')?.click(), name)
    await unfold(page, 'Clients')
    await until(page, () => document.querySelectorAll('a[href*="nest=client"]').length === 6)
    const oneLevel = await folderState(page)
    await unfold(page, 'Globex')
    await until(page, () => document.querySelectorAll('a[href*="nest=globex"]').length === 8)
    const twoLevels = await folderState(page)
    check(
      'nested: unfolding shows the links, one level at a time',
      oneLevel.client === 6 && oneLevel.globex?.open === 'false' && oneLevel.globexLinks === 0 && twoLevels.globex?.open === 'true' && twoLevels.globex.depth === '2' && twoLevels.globexLinks === 9,
      JSON.stringify({ oneLevel, twoLevels }),
    )
    await sleep(300)
    await page.screenshot({ path: path.join(SHOTS, '40-nested-open.png') })

    await page.reload()
    await until(page, () => !!document.querySelector('[data-folder]'))
    await sleep(300)
    const reloaded = await folderState(page)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('stackable:openFolders') ?? '[]'))
    check('nested: open folders stay open after a reload', reloaded.clients?.open === 'true' && reloaded.globex?.open === 'true' && reloaded.globexLinks === 9 && stored.includes(made.clients) && stored.includes(made.globex), JSON.stringify({ reloaded, stored }))

    // Search reaches into folders and says where a hit sits.
    await page.mouse.click(120, 860)
    await page.keyboard.press('/')
    await page.keyboard.type('zebra')
    await until(page, () => [...document.querySelectorAll('main section a')].some((a) => a.textContent.includes('Zebra roadmap')))
    const where = await page.evaluate(() => [...document.querySelectorAll('[data-search-where]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()))
    check('nested: search finds a link two folders down and shows where it is', where.length === 1 && /Nested test\s*Projects\s*Clients\s*Globex/.test(where[0]), JSON.stringify(where))
    await page.keyboard.press('Escape')
    await until(page, () => document.querySelector('main h1')?.textContent === 'Nested test')

    // The stack's open-all counts its folders' links: 2 + 6 + 9 = 17, so it asks first.
    const openAll = await page.evaluate(async () => {
      const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Projects')
      const b = col.querySelector('button[aria-label^="Open all"]')
      const label = b.getAttribute('aria-label')
      b.click()
      await new Promise((r) => setTimeout(r, 150))
      return { label, armed: b.textContent }
    })
    check('nested: the stack\'s open-all counts links in its folders, and asks before 17 tabs', openAll.label === 'Open all 17 bookmarks as tabs' && openAll.armed === 'Open 17?', JSON.stringify(openAll))
    await sleep(3300) // let it disarm

    // Sharing stays one flat list: the folders' links ride along, and the toast says so.
    await page.evaluate(() => {
      window.__copied = null
      navigator.clipboard.writeText = async (text) => { window.__copied = text } // headless has no real clipboard
      const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Projects')
      col.querySelector('button[aria-label="Stack options"]').click()
    })
    await until(page, () => !!document.querySelector('[data-share-stack]'))
    await page.evaluate(() => document.querySelector('[data-share-stack]').click())
    await until(page, () => !!window.__copied && (document.querySelector('.toast')?.textContent ?? '').includes('Link copied'))
    const shareToast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
    check('nested: sharing a stack with folders sends all 17 links as one flat list, and says so', shareToast.includes('17 links') && shareToast.includes('Its folders are shared as one flat list'), shareToast)

    // Drag a link out of a folder into another stack, with the real mouse.
    const centre = (p, text) =>
      p.evaluate((t) => {
        const a = [...document.querySelectorAll('a[href^="http"]')].find((x) => x.textContent.includes(t))
        const r = a.parentElement.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, text)
    const drag = async (p, from, to) => {
      await p.mouse.move(from.x, from.y)
      await p.mouse.down()
      for (let i = 1; i <= 14; i++) await p.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14)
      await sleep(250)
      await p.mouse.up()
      await sleep(900)
    }
    const parentOf = (title) => control.evaluate(async (t) => (await chrome.bookmarks.search({ title: t }))[0]?.parentId, title)
    await drag(page, await centre(page, 'Client 0'), await centre(page, 'Other link'))
    check('nested: a link drags from a folder into another stack', (await parentOf('Client 0')) === made.other, String(await parentOf('Client 0')))

    // And into a folder: let go over its header and it goes in last.
    const globexHead = await page.evaluate(() => {
      const r = [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === 'Globex').querySelector('[data-folder-head]').getBoundingClientRect()
      return { x: r.x + r.width / 3, y: r.y + r.height / 2 }
    })
    await drag(page, await centre(page, 'Other link'), globexHead)
    const globexKids = await control.evaluate(async (id) => (await chrome.bookmarks.getChildren(id)).map((c) => c.title), made.globex)
    check('nested: a link let go on a folder header goes into that folder, last', globexKids.at(-1) === 'Other link', globexKids.join(' | '))

    // Reorder inside a folder: the first link down past the third.
    const doc0 = await centre(page, 'Globex doc 0')
    const doc2 = await centre(page, 'Globex doc 2')
    await drag(page, doc0, { x: doc2.x, y: doc2.y + 8 })
    const reordered = await control.evaluate(async (id) => (await chrome.bookmarks.getChildren(id)).map((c) => c.title), made.globex)
    check('nested: links reorder inside a folder', reordered.slice(0, 3).join(' | ') === 'Globex doc 1 | Globex doc 2 | Globex doc 0', reordered.join(' | '))

    // Delete the whole stack, then Undo: the folders and every link come back.
    const shape = () =>
      control.evaluate(async (spaceId) => {
        const [sub] = await chrome.bookmarks.getSubTree(spaceId)
        const walk = (n) => (n.url ? n.title : { [n.title]: (n.children ?? []).map(walk) })
        return JSON.stringify(sub.children.map(walk))
      }, made.space)
    const before = await shape()
    await page.evaluate(() => {
      const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Projects')
      col.querySelector('button[aria-label="Stack options"]').click()
    })
    await sleep(150)
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click())
    await until(page, () => document.querySelector('.toast')?.textContent.includes('Projects'))
    const delToast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
    const gone = await control.evaluate(async (id) => (await chrome.bookmarks.get(id).catch(() => [])).length, made.projects)
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
    await until(page, () => document.querySelector('.toast')?.textContent.startsWith('Restored'))
    await sleep(500)
    const after = await shape()
    check('nested: the stack delete toast counts its folders and their links', delToast.includes('2 folders') && delToast.includes('17 links') && gone === 0, `${delToast} (${gone} left)`)
    check('nested: undoing the stack delete brings back every folder and link in place', after === before, `${after.slice(0, 160)} vs ${before.slice(0, 160)}`)
    // Clients and Globex were open before the delete: they come back open under their new ids.
    const openAgain = (names) =>
      page.evaluate((ns) => ns.every((n) => [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === n)?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') === 'true'), names)
    const back = await until(page, (ns) => ns.every((n) => [...document.querySelectorAll('[data-folder]')].some((x) => x.dataset.folder === n)), ['Clients', 'Globex'])
    check('nested: the restored folders show again, open as they were', back && (await openAgain(['Clients', 'Globex'])), String(back))

    // A folder deletes at once with an Undo, like a stack.
    await until(page, () => [...document.querySelectorAll('[data-folder]')].some((x) => x.dataset.folder === 'Globex'))
    await page.evaluate(() => [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === 'Globex').querySelector('button[aria-label="Folder options"]').click())
    await sleep(150)
    await page.evaluate(() => [...document.querySelectorAll('[data-folder] button')].find((b) => b.textContent.trim() === 'Delete').click())
    await until(page, () => document.querySelector('.toast')?.textContent.includes('Globex'))
    const folderToast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '')
    const globexGone = await control.evaluate(async () => (await chrome.bookmarks.search({ title: 'Globex' })).filter((n) => !n.url).length)
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo')).click())
    await until(page, () => document.querySelector('.toast')?.textContent.startsWith('Restored'))
    await sleep(400)
    check('nested: a folder deletes at once, and Undo brings it back whole and open', folderToast.includes('10 links') && globexGone === 0 && (await shape()) === before && (await openAgain(['Globex'])), `${folderToast} (${globexGone} left)`)

    // New folder from the stack menu; a double-click on its name renames it.
    await page.evaluate(() => {
      const col = [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Other')
      col.querySelector('button[aria-label="Stack options"]').click()
    })
    await sleep(150)
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New folder').click())
    await until(page, () => document.querySelector('[role=dialog]')?.textContent.includes('New folder'))
    await page.keyboard.type('Fresh')
    await page.keyboard.press('Enter')
    await until(page, () => [...document.querySelectorAll('[data-folder]')].some((x) => x.dataset.folder === 'Fresh'))
    const fresh = await control.evaluate(async (id) => (await chrome.bookmarks.getChildren(id)).filter((c) => !c.url).map((c) => c.title), made.other)
    const freshOpen = await page.evaluate(() => [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === 'Fresh')?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded'))
    check('nested: New folder in the stack menu makes a folder, opened', fresh.join() === 'Fresh' && freshOpen === 'true', `${fresh.join()} ${freshOpen}`)
    const freshName = await page.evaluate(() => {
      const r = [...document.querySelectorAll('[data-folder]')].find((x) => x.dataset.folder === 'Fresh').querySelector('button[aria-expanded] span').getBoundingClientRect()
      return { x: r.x + 8, y: r.y + r.height / 2 }
    })
    await page.mouse.click(freshName.x, freshName.y, { count: 2 })
    await until(page, () => document.querySelector('[role=dialog]')?.textContent.includes('Rename folder'))
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyA')
    await page.keyboard.up('Control')
    await page.keyboard.type('Renamed')
    await page.keyboard.press('Enter')
    await until(page, () => [...document.querySelectorAll('[data-folder]')].some((x) => x.dataset.folder === 'Renamed'))
    const renamed = await control.evaluate(async (id) => (await chrome.bookmarks.getChildren(id)).filter((c) => !c.url).map((c) => c.title), made.other)
    check('nested: a double-click on a folder name renames it', renamed.join() === 'Renamed', renamed.join())

    // Clean-up sees links in folders: a copy two folders down is the one ticked, says where it is,
    // and Remove then Undo puts it back in its folder at its place.
    const copy = await control.evaluate(async () => {
      const [globex] = (await chrome.bookmarks.search({ title: 'Globex' })).filter((n) => !n.url)
      const c = await chrome.bookmarks.create({ parentId: globex.id, index: 2, title: 'Nested copy', url: 'https://example.com/?nest=second' })
      await chrome.storage.sync.set({ proTrial: { startedAt: Date.now() } })
      return { id: c.id, folder: globex.id }
    })
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings').click())
    await until(page, () => !!document.querySelector('[data-cleanup-open]'), null, 8000)
    await page.evaluate(() => document.querySelector('[data-cleanup-open]').click())
    await until(page, (id) => !!document.querySelector(`[data-cleanup-section="dupes"] [data-cleanup-row="${id}"]`), copy.id, 8000)
    const copyRow = await page.evaluate((id) => {
      const r = document.querySelector(`[data-cleanup-section="dupes"] [data-cleanup-row="${id}"]`)
      return r ? { checked: r.querySelector('input').checked, text: r.textContent } : null
    }, copy.id)
    check('nested: clean-up finds a copy inside a folder, ticks it and shows its folders', !!copyRow?.checked && copyRow.text.includes('Projects › Clients › Globex'), JSON.stringify(copyRow))
    await page.evaluate((keep) => {
      for (const r of document.querySelectorAll('[data-cleanup-row]')) {
        const box = r.querySelector('input')
        if (box.checked !== (r.dataset.cleanupRow === keep)) box.click()
      }
    }, copy.id)
    await until(page, () => document.querySelector('[data-cleanup-remove]')?.textContent.trim() === 'Remove 1 link')
    await page.evaluate(() => document.querySelector('[data-cleanup-remove]').click())
    await until(page, () => document.querySelector('.toast')?.textContent.includes('Removed'))
    const copyGone = await control.evaluate(async (f) => (await chrome.bookmarks.getChildren(f)).map((c) => c.title), copy.folder)
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.trim().startsWith('Undo'))?.click())
    await until(page, () => document.querySelector('.toast')?.textContent.startsWith('Restored'), null, 8000)
    await sleep(400)
    const copyBack = await control.evaluate(async (f) => (await chrome.bookmarks.getChildren(f)).map((c) => c.title), copy.folder)
    check('nested: clean-up removes a link in a folder, and Undo puts it back in place', !copyGone.includes('Nested copy') && copyBack[2] === 'Nested copy', `${copyGone.join(' | ')} / ${copyBack.join(' | ')}`)
    await page.evaluate(() => document.querySelector('[role=dialog] button[aria-label="Close"]')?.click())
    await control.evaluate(() => chrome.storage.sync.remove('proTrial'))

    await page.close()
    await control.evaluate((id) => chrome.bookmarks.removeTree(id), made.space)
  }

  // ---------- 0.8.0: packed stacks (U1) ----------
  // Settings > Appearance > Layout. Packed, the default, tucks each stack under the one above it and
  // keeps the column it has in Rows (stack i in column i mod N); Rows is the plain grid.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const onPack = () => document.querySelector('main h1')?.textContent === 'Pack test'
    // Where each stack sits, and whether the grid carries any packing.
    const geo = (page) =>
      page.evaluate(() => {
        const grid = document.querySelector('[data-stack-grid]')
        const stacks = [...grid.querySelectorAll(':scope > [id^="stack-"]')].map((el) => {
          const r = el.getBoundingClientRect()
          return { title: el.querySelector('h3').textContent, left: Math.round(r.left), top: r.top, bottom: r.bottom }
        })
        const styled = !!grid.getAttribute('style') || [...grid.children].some((el) => (el.getAttribute('style') ?? '').includes('grid'))
        return { packed: grid.getAttribute('data-packed'), gap: parseFloat(getComputedStyle(grid).getPropertyValue('--stack-gap')), stacks, styled }
      })
    const gapOk = (px, gap) => px >= gap - 1 && px <= gap + 5 // 4px rows round the gap up a little
    const pickLayout = async (page, value) => {
      await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim().startsWith('Settings')).click())
      await until(page, () => !!document.querySelector('[aria-label="Layout"]'))
      const shown = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Layout"] [role=radio]')].map((b) => `${b.textContent}:${b.getAttribute('aria-checked')}`).join(' '))
      await page.evaluate((v) => document.querySelector(`[aria-label="Layout"] [data-option="${v}"]`).click(), value)
      await sleep(300)
      await page.keyboard.press('Escape')
      await sleep(250)
      return shown
    }

    // Packed is picked here, since settings saved before 0.8.0 keep Rows (the block after this one);
    // the settings come back as they were at the end. The background stays as the blocks above
    // left it (a picture by now), so the gaps are read from the page. The what's-new card would sit
    // on the board, so it stays away.
    const savedLook = await control.evaluate(async () => {
      const { appearance } = await chrome.storage.local.get('appearance')
      await chrome.storage.local.set({ appearance: { ...(appearance ?? {}), layout: 'packed', density: 'comfortable' } })
      localStorage.setItem('stackable:whatsNew070', '-1')
      return appearance ?? null
    })
    const [spaceId, dropSpaceId] = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🧱 Pack test' })
      const drop = await chrome.bookmarks.create({ parentId: root.id, title: '📦 Pack drop' })
      const st = await chrome.bookmarks.create({ parentId: space.id, title: 'Short' })
      for (let i = 0; i < 2; i++) await chrome.bookmarks.create({ parentId: st.id, title: `Short ${i}`, url: `https://example.com/short/${i}` })
      localStorage.setItem('stackable:lastSpaceId', space.id)
      return [space.id, drop.id]
    })
    const page = await openNtp(onPack)
    await page.bringToFront()
    const cols = Number(await page.evaluate(() => document.querySelector('[data-stack-grid]')?.getAttribute('data-packed')))
    const stored = await control.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance)
    check('layout: Packed saved opens packed', cols >= 3 && stored?.layout === 'packed', `${cols} columns`)

    // First row: Short and N-1 tall stacks. Second row: N small ones, "Tucked" first, so in Rows
    // it is stack N, right below Short.
    const titles = await control.evaluate(async (id, n) => {
      const mk = async (title, count) => {
        const st = await chrome.bookmarks.create({ parentId: id, title })
        for (let i = 0; i < count; i++) await chrome.bookmarks.create({ parentId: st.id, title: `${title} ${i}`, url: `https://example.com/${title.replace(' ', '-')}/${i}` })
      }
      for (let i = 1; i < n; i++) await mk(`Tall ${i}`, 8 + i)
      await mk('Tucked', 3)
      for (let i = 1; i < n; i++) await mk(`Low ${i}`, 2)
      return (await chrome.bookmarks.getChildren(id)).map((c) => c.title)
    }, spaceId, cols)
    await until(page, (n) => document.querySelectorAll('[data-stack-grid] > [id^="stack-"]').length === n, titles.length)
    await sleep(400)
    const g1 = await geo(page)
    const short = g1.stacks[0]
    const tucked = g1.stacks[cols]
    const rowOneEnd = Math.max(...g1.stacks.slice(0, cols).map((s) => s.bottom))
    check(
      'packed: the stack below a short one in Rows tucks up under it, one gap down',
      tucked.title === 'Tucked' && tucked.left === short.left && gapOk(tucked.top - short.bottom, g1.gap) && tucked.top < rowOneEnd - 100,
      `${(tucked.top - short.bottom).toFixed(1)}px under Short, gap ${g1.gap}, the first row ends ${Math.round(rowOneEnd - short.bottom)}px lower`,
    )
    check('packed: every stack keeps its Rows column (i mod N)', g1.stacks.every((s, i) => s.left === g1.stacks[i % cols].left), g1.stacks.map((s) => s.left).join(' '))

    // Growing a stack in the first row moves the stacks under it down, and none sideways.
    await control.evaluate(async () => {
      const [st] = (await chrome.bookmarks.search({ title: 'Short' })).filter((n) => !n.url)
      for (let i = 2; i < 16; i++) await chrome.bookmarks.create({ parentId: st.id, title: `Short ${i}`, url: `https://example.com/short/${i}` })
    })
    await until(page, () => [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Short')?.querySelectorAll('a[href]').length === 16)
    await sleep(300)
    const g2 = await geo(page)
    check(
      'packed: growing a first-row stack leaves every stack in its column',
      g2.stacks.every((s, i) => s.title === g1.stacks[i].title && s.left === g1.stacks[i].left) && g2.stacks[0].bottom > rowOneEnd,
      g2.stacks.map((s) => `${s.title}@${s.left}`).join(' '),
    )
    check(
      'packed: the stack under it moves down with it, still one gap below',
      gapOk(g2.stacks[cols].top - g2.stacks[0].bottom, g2.gap) && g2.stacks[cols].top > tucked.top + 300,
      `${(g2.stacks[cols].top - g2.stacks[0].bottom).toFixed(1)}px under, moved ${Math.round(g2.stacks[cols].top - tucked.top)}px`,
    )
    await control.evaluate(async () => {
      const [st] = (await chrome.bookmarks.search({ title: 'Short' })).filter((n) => !n.url)
      for (const b of (await chrome.bookmarks.getChildren(st.id)).slice(2)) await chrome.bookmarks.remove(b.id)
    })
    await until(page, () => [...document.querySelectorAll('[id^="stack-"]')].find((c) => c.querySelector('h3')?.textContent === 'Short')?.querySelectorAll('a[href]').length === 2)
    await sleep(300)
    const g3 = await geo(page)
    check('packed: removing links pulls the stack under it back up', Math.abs(g3.stacks[cols].top - tucked.top) < 1, `${(g3.stacks[cols].top - tucked.top).toFixed(1)}px off`)

    // A folder inside a first-row stack (nested folders, 0.8.0) opens in place: the stack grows, and
    // only the stacks under it in its column move down, by that much (give or take a 4px row).
    // Folding it puts every stack back.
    await control.evaluate(async () => {
      const [st] = (await chrome.bookmarks.search({ title: 'Tall 1' })).filter((n) => !n.url)
      const folder = await chrome.bookmarks.create({ parentId: st.id, title: 'Archive' })
      for (let i = 0; i < 6; i++) await chrome.bookmarks.create({ parentId: folder.id, title: `Archive ${i}`, url: `https://example.com/archive/${i}` })
    })
    await until(page, () => document.querySelector('[data-folder="Archive"] [data-folder-count]')?.textContent === '6')
    await sleep(300)
    const shut = await geo(page)
    const toggle = () => page.evaluate(() => document.querySelector('[data-folder="Archive"] button[aria-expanded]').click())
    await toggle()
    await until(page, () => document.querySelectorAll('a[href^="https://example.com/archive/"]').length === 6)
    await sleep(300)
    const opened = await geo(page)
    await toggle()
    await until(page, () => document.querySelectorAll('a[href^="https://example.com/archive/"]').length === 0)
    await sleep(300)
    const closed = await geo(page)
    const grew = opened.stacks[1].bottom - shut.stacks[1].bottom
    const moves = opened.stacks.map((s, i) => s.top - shut.stacks[i].top)
    check(
      'packed: unfolding a folder in a first-row stack moves only the stacks below it, and folding it pulls them back',
      grew > 100 &&
        moves.every((d, i) => (i % cols === 1 && i >= cols ? Math.abs(d - grew) <= 4 : Math.abs(d) < 1)) &&
        opened.stacks.every((s, i) => s.left === shut.stacks[i].left) &&
        closed.stacks.every((s, i) => Math.abs(s.top - shut.stacks[i].top) < 1 && s.left === shut.stacks[i].left),
      `grew ${Math.round(grew)}px; moved ${moves.map(Math.round).join(' ')}; back ${closed.stacks.map((s, i) => Math.round(s.top - shut.stacks[i].top)).join(' ')}`,
    )

    // Compact density has a smaller gap, and the board packs to it.
    const setDensity = (density) => control.evaluate(async (d) => {
      const { appearance } = await chrome.storage.local.get('appearance')
      await chrome.storage.local.set({ appearance: { ...appearance, density: d } })
    }, density)
    await setDensity('compact')
    await until(page, () => document.documentElement.dataset.density === 'compact')
    await sleep(300)
    const gc = await geo(page)
    check('packed: compact density packs to its own smaller gap', gc.gap < g1.gap && gapOk(gc.stacks[cols].top - gc.stacks[0].bottom, gc.gap), `${(gc.stacks[cols].top - gc.stacks[0].bottom).toFixed(1)}px under, gap ${gc.gap}`)
    await setDensity('comfortable')
    await until(page, () => document.documentElement.dataset.density === 'comfortable')

    // The placement lands in the same task that renders the stacks, so the first frame is packed.
    const firstFrame = await page.evaluateOnNewDocument(() => {
      new MutationObserver((_, mo) => {
        const stack = document.querySelector('[data-stack-grid] > [id^="stack-"]')
        if (!stack) return
        window.__packedFirst = !!stack.parentElement.getAttribute('data-packed') && !!stack.style.gridRow
        mo.disconnect()
      }).observe(document, { childList: true, subtree: true })
    })
    await page.reload({ waitUntil: 'load' })
    await until(page, onPack, undefined, 10000)
    check('packed: stacks are placed before the first paint', (await page.evaluate(() => window.__packedFirst)) === true)
    await page.removeScriptToEvaluateOnNewDocument(firstFrame.identifier)
    await sleep(400)
    await page.screenshot({ path: path.join(SHOTS, '40-packed.png') })

    // Rows: the plain grid, as before 0.8.0.
    const offered = await pickLayout(page, 'rows')
    check('layout: Settings > Appearance offers Packed and Rows, Packed picked', offered === 'Packed:true Rows:false', offered)
    const g4 = await geo(page)
    const rowEnd = Math.max(...g4.stacks.slice(0, cols).map((s) => s.bottom))
    check(
      'rows: the same stack starts below the tallest stack of the first row',
      !g4.packed && !g4.styled && g4.stacks[cols].title === 'Tucked' && Math.abs(g4.stacks[cols].top - rowEnd - g4.gap) < 1 && g4.stacks[cols].left === g4.stacks[0].left,
      `${(g4.stacks[cols].top - rowEnd).toFixed(1)}px under the tallest, gap ${g4.gap}`,
    )
    await page.screenshot({ path: path.join(SHOTS, '41-rows.png') })
    const savedRows = await control.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance?.layout)
    await page.reload({ waitUntil: 'load' })
    await until(page, onPack, undefined, 10000)
    await sleep(400)
    const g5 = await geo(page)
    check('layout: Rows is saved and persists across a reload', savedRows === 'rows' && !g5.packed && Math.abs(g5.stacks[cols].top - g4.stacks[cols].top) < 1, `${savedRows} ${g5.packed}`)

    // Another open tab follows the switch back to Packed.
    const other = await openNtp(onPack)
    const otherRows = await other.evaluate(() => !document.querySelector('[data-stack-grid][data-packed]'))
    await page.bringToFront()
    await pickLayout(page, 'packed')
    await other.bringToFront()
    check('layout: other open tabs follow a change', otherRows && (await until(other, () => !!document.querySelector('[data-stack-grid][data-packed]'))))
    await other.close()
    await page.bringToFront()
    await sleep(300)

    // Drags in Packed, with the real mouse.
    const drag = async (from, to) => {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (let i = 1; i <= 15; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 15, from.y + ((to.y - from.y) * i) / 15)
      await sleep(250)
      await page.mouse.up()
      await sleep(1000)
    }
    const cardAt = (text) =>
      page.evaluate((t) => {
        const r = [...document.querySelectorAll('main a[href^="http"]')].find((a) => a.textContent.includes(t)).parentElement.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, text)
    const headerAt = (title) =>
      page.evaluate((t) => {
        const r = [...document.querySelectorAll('[aria-label="Drag stack header"]')].find((h) => h.querySelector('h3')?.textContent === t).getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, title)
    const kids = (id) => control.evaluate(async (i) => (await chrome.bookmarks.getChildren(i)).map((c) => c.title), id)
    const childrenOf = (title) => control.evaluate(async (t) => {
      const [n] = (await chrome.bookmarks.search({ title: t })).filter((x) => !x.url)
      return (await chrome.bookmarks.getChildren(n.id)).map((c) => c.title)
    }, title)

    await drag(await cardAt('Short 0'), await cardAt('Tucked 1'))
    const into = await childrenOf('Tucked')
    const g6 = await geo(page)
    check(
      'packed: a link drags from one stack into another, and the board packs again',
      into.join('|') === 'Tucked 0|Short 0|Tucked 1|Tucked 2' && (await childrenOf('Short')).join('|') === 'Short 1' && gapOk(g6.stacks[cols].top - g6.stacks[0].bottom, g6.gap),
      into.join(' | '),
    )

    // "Tucked" (stack N, under Short) by its header onto "Tall 2" in the first row.
    await drag(await headerAt('Tucked'), await headerAt('Tall 2'))
    const want = titles.filter((t) => t !== 'Tucked')
    want.splice(2, 0, 'Tucked')
    const order = await kids(spaceId)
    const g7 = await geo(page)
    const packedRight = g7.stacks.every((s, i) =>
      s.left === g7.stacks[i % cols].left && (i < cols ? Math.abs(s.top - g7.stacks[0].top) < 1 : gapOk(s.top - g7.stacks[i - cols].bottom, g7.gap)),
    )
    check(
      'packed: a stack drags to a new place and the board packs around it',
      order.join('|') === want.join('|') && g7.stacks.map((s) => s.title).join('|') === want.join('|') && packedRight && (await page.evaluate(() => !document.querySelector('[data-lifted]'))),
      order.join(' | '),
    )

    // A stack dropped on another space's row in the sidebar moves there.
    const row = await page.evaluate(() => {
      const r = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Pack drop')).getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await drag(await headerAt('Low 1'), row)
    const moved = await kids(dropSpaceId)
    check('packed: a stack dropped on a sidebar space moves there', moved.join('|') === 'Low 1' && !(await kids(spaceId)).includes('Low 1'), moved.join(' | '))

    // The drag preview packs the would-be order. On this board, shifting each stack into its
    // neighbour's slot (dnd-kit's own preview) put the tall M3 over M8; now nothing overlaps
    // mid-drag, and the drop puts every stack where the preview showed it.
    const mixId = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🧮 Pack mix' })
      for (const [s, n] of [2, 9, 10, 11, 3, 2, 6, 2, 4, 7, 1].entries()) {
        const st = await chrome.bookmarks.create({ parentId: space.id, title: `M${s}` })
        for (let i = 0; i < n; i++) await chrome.bookmarks.create({ parentId: st.id, title: `M${s} link ${i}`, url: `https://example.com/m${s}/${i}` })
      }
      return space.id
    })
    await until(page, () => [...document.querySelectorAll('aside button')].some((b) => b.textContent.includes('Pack mix')))
    await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Pack mix')).click())
    await until(page, () => document.querySelector('main h1')?.textContent === 'Pack mix' && document.querySelectorAll('[data-stack-grid] > [id^="stack-"]').length === 11)
    await sleep(400)
    const boxes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-stack-grid] > [id^="stack-"]')].map((el) => {
          const r = el.getBoundingClientRect()
          return { title: el.querySelector('h3').textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        }),
      )
    // The add-stack button isn't a stack the preview can move, so it steps aside during the drag.
    const addShown = () =>
      page.evaluate(() => {
        const b = [...document.querySelectorAll('[data-stack-grid] > button')].find((x) => x.textContent.includes('Add empty Stack'))
        return !!b && getComputedStyle(b).visibility === 'visible'
      })
    const grab = await headerAt('M4')
    const aim = await headerAt('M2')
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    for (let i = 1; i <= 15; i++) await page.mouse.move(grab.x + ((aim.x - grab.x) * i) / 15, grab.y + ((aim.y - grab.y) * i) / 15)
    await sleep(500) // past the stacks' 250ms slide
    const mid = await boxes()
    const addMid = await addShown()
    await page.screenshot({ path: path.join(SHOTS, '42-packed-mid-drag.png') })
    await page.mouse.up()
    await sleep(1000)
    const end = await boxes()
    const addEnd = await addShown()
    const clashes = []
    for (let i = 0; i < mid.length; i++) {
      for (let j = i + 1; j < mid.length; j++) {
        const w = Math.min(mid[i].right, mid[j].right) - Math.max(mid[i].left, mid[j].left)
        const h = Math.min(mid[i].bottom, mid[j].bottom) - Math.max(mid[i].top, mid[j].top)
        if (w > 3 && h > 3) clashes.push(`${mid[i].title}/${mid[j].title} by ${Math.round(h)}px`)
      }
    }
    check('packed: mid-drag, no two stacks overlap and the add-stack button steps aside', mid.length === 11 && clashes.length === 0 && !addMid, clashes.join(', ') || `${mid.length} stacks, button shown: ${addMid}`)
    const strays = mid.filter((m) => {
      const e = end.find((x) => x.title === m.title)
      return !e || Math.abs(e.left - m.left) > 2 || Math.abs(e.top - m.top) > 2
    })
    const mixOrder = await kids(mixId)
    check(
      'packed: each stack lands where the drag preview showed it',
      mixOrder.join(' ') === 'M0 M1 M4 M2 M3 M5 M6 M7 M8 M9 M10' && strays.length === 0 && addEnd,
      mixOrder.join(' ') + (strays.length ? `; not where shown: ${strays.map((s) => s.title).join(' ')}` : '') + (addEnd ? '' : '; add-stack button still hidden'),
    )

    await page.close()
    await control.evaluate(async (ids, look) => {
      for (const id of ids) await chrome.bookmarks.removeTree(id)
      if (look) await chrome.storage.local.set({ appearance: look })
      localStorage.removeItem('stackable:lastSpaceId')
    }, [spaceId, dropSpaceId, mixId], savedLook)
  }

  // ---------- 0.8.0: Rows for boards from before 0.8.0 ----------
  // Packed is the default for new installs only. An update from before 0.8.0 writes Rows into the
  // saved settings unless a layout is saved (played here through the service worker's
  // unpacked-only message, the same step the update runs), and a boot copy from before 0.8.0 has
  // no layout, which reads as Rows, so the first frame already has it. The control page is a board
  // too: it rewrites the boot copy when the saved settings change, so the copy is set last.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const MIRROR = 'stackable:appearance'
    const was = await control.evaluate(async (k) => ({ mirror: localStorage.getItem(k), stored: (await chrome.storage.local.get('appearance')).appearance ?? null }), MIRROR)
    const saved = () => control.evaluate(async () => (await chrome.storage.local.get('appearance')).appearance ?? null)
    const store = async (value) => {
      await control.evaluate((v) => (v === null ? chrome.storage.local.remove('appearance') : chrome.storage.local.set({ appearance: v })), value)
      await sleep(400) // the control page adopts it and rewrites its boot copy
    }
    const mirror = (value) => control.evaluate((k, v) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)), MIRROR, value)
    const updatedFrom = (v) => askWorker(control, { type: 'e2e-updated-from', previousVersion: v })
    // A new tab that notes the stack grid's layout from its first frame: ['rows'], ['packed'], or a jump.
    const firstFrames = async () => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`ntp: ${e.message}`))
      await p.evaluateOnNewDocument(() => {
        window.__layouts = []
        const note = () => {
          const grid = document.querySelector('[data-stack-grid]')
          if (!grid || !grid.querySelector(':scope > [id^="stack-"]')) return
          const now = grid.hasAttribute('data-packed') ? 'packed' : 'rows'
          if (window.__layouts[window.__layouts.length - 1] !== now) window.__layouts.push(now)
        }
        new MutationObserver(note).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-packed'] })
      })
      await p.goto(NTP)
      await p.bringToFront()
      await until(p, () => window.__layouts.length > 0)
      await sleep(1500)
      const seen = await p.evaluate(() => window.__layouts)
      await p.close()
      return seen
    }
    const oldSettings = (() => {
      const { layout, ...rest } = was.stored ?? {}
      void layout
      return rest
    })()
    const oldMirror = (() => {
      const m = JSON.parse(was.mirror ?? '{}')
      if (m.settings) delete m.settings.layout
      return JSON.stringify(m)
    })()

    // Saved settings and a boot copy from 0.7.0, then the update.
    await store(oldSettings)
    const reply = await updatedFrom('0.7.0')
    await sleep(300)
    await mirror(oldMirror)
    const afterUpdate = await saved()
    const updatedFrames = await firstFrames()
    check(
      'layout: an update from 0.7.0 keeps Rows, from the first frame, and writes it into the saved settings',
      reply?.ok === true && afterUpdate?.layout === 'rows' && afterUpdate?.palette === oldSettings.palette && JSON.stringify(updatedFrames) === '["rows"]',
      `${JSON.stringify(reply)} ${afterUpdate?.layout} ${JSON.stringify(updatedFrames)}`,
    )

    // An old board that never saved any settings: no boot copy, nothing saved, then the update.
    await store(null)
    await updatedFrom('0.7.0')
    await sleep(400)
    await mirror(null)
    const bare = await saved()
    const bareFrames = await firstFrames()
    check('layout: an old board that never saved settings opens in Rows after the update, with no jump', bare?.layout === 'rows' && JSON.stringify(bareFrames) === '["rows"]', `${JSON.stringify(bare)} ${JSON.stringify(bareFrames)}`)

    // A fresh install: nothing saved anywhere.
    await store(null)
    await mirror(null)
    const freshFrames = await firstFrames()
    check('layout: a fresh install opens Packed', JSON.stringify(freshFrames) === '["packed"]' && (await saved()) === null, JSON.stringify(freshFrames))

    // A layout someone picked stays through the update; an update from 0.8.0 on writes nothing.
    await store({ ...oldSettings, layout: 'packed' })
    await updatedFrom('0.7.0')
    await sleep(300)
    const picked = await saved()
    const pickedFrames = await firstFrames()
    await store(oldSettings)
    await updatedFrom('0.8.0')
    await sleep(300)
    const later = await saved()
    check(
      'layout: an update never overwrites a layout someone picked, and only a pre-0.8.0 version writes Rows',
      picked?.layout === 'packed' && JSON.stringify(pickedFrames) === '["packed"]' && !!later && !('layout' in later),
      `${picked?.layout} ${JSON.stringify(pickedFrames)} ${JSON.stringify(later)}`,
    )

    await store(was.stored)
    await mirror(was.mirror)
  }

  // ---------- 0.8.0: what's new ----------
  // An update from before 0.8.0 marks the computer (played through the worker's unpacked-only
  // message with whatsNew: true), and the next new tab shows one corner note: free features first,
  // a Pro line only for Pro, the trial or early users, and Try Packed with an Undo. A fresh install
  // sees nothing, and the 0.7.0 Pro note keeps its turn: the two never share a tab.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const card = (page) =>
      page.evaluate(() => {
        const c = document.querySelector('[data-whats-new-080]')
        return c ? { text: c.innerText, pro: !!c.querySelector('[data-whats-new-pro]'), proText: c.querySelector('[data-whats-new-pro]')?.innerText ?? '', tryPacked: !!c.querySelector('[data-try-packed]') } : null
      })
    const savedLayout = () => control.evaluate(async () => ((await chrome.storage.local.get('appearance')).appearance ?? {}).layout ?? null)
    const was = await control.evaluate(async () => ({
      appearance: (await chrome.storage.local.get('appearance')).appearance ?? null,
      sync: await chrome.storage.sync.get(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey']),
      w070: localStorage.getItem('stackable:whatsNew070'),
      firstSeen: localStorage.getItem('stackable:firstSeen'),
    }))
    // A board on Rows, no Pro, the Pro note answered, no 0.8.0 mark yet. The rating tests leave an
    // old first-seen date, which would make this board early (installed before Pro): start it today.
    await control.evaluate(async () => {
      localStorage.setItem('stackable:firstSeen', String(Date.now()))
      localStorage.setItem('stackable:whatsNew070', '-1')
      localStorage.removeItem('stackable:whatsNew080')
      await chrome.storage.local.remove('whatsNew080')
      await chrome.storage.sync.remove(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey'])
      const a = (await chrome.storage.local.get('appearance')).appearance ?? {}
      await chrome.storage.local.set({ appearance: { ...a, layout: 'rows' } })
    })
    await sleep(400)
    const fresh = await openNtp()
    await sleep(1500)
    check("what's new 0.8.0: no update, no note", !(await card(fresh)))
    await fresh.close()

    await askWorker(control, { type: 'e2e-updated-from', previousVersion: '0.7.0', whatsNew: true })
    const p1 = await openNtp()
    const c1 = (await until(p1, () => !!document.querySelector('[data-whats-new-080]'))) ? await card(p1) : null
    check(
      "what's new 0.8.0: an update from 0.7.0 shows the note, free features first, no Pro line without Pro",
      !!c1 && c1.text.includes('folders inside stacks') && c1.text.includes('Settings > Appearance > Layout') && c1.text.includes('share a stack as a link') && c1.tryPacked && !c1.pro,
      JSON.stringify(c1),
    )
    check("what's new 0.8.0: alone on its tab", await p1.evaluate(() => !document.querySelector('[data-whats-new]')))
    await p1.evaluate(() => document.querySelector('[data-try-packed]').click())
    await sleep(600)
    const after = await savedLayout()
    const answered = await p1.evaluate(() => !document.querySelector('[data-whats-new-080]') && localStorage.getItem('stackable:whatsNew080') === '-1')
    check("what's new 0.8.0: Try Packed switches the layout and answers the note", after === 'packed' && answered, `${after} ${answered}`)
    await p1.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => b.textContent.includes('Undo'))?.click())
    await sleep(600)
    check("what's new 0.8.0: Undo puts Rows back", (await savedLayout()) === 'rows')
    await p1.close()

    // An early board whose Pro note is still pending: the Pro note first and alone, the 0.8.0 note on a later tab.
    await control.evaluate(async () => {
      localStorage.setItem('stackable:whatsNew070', '0')
      localStorage.removeItem('stackable:whatsNew080')
      // An early user without a to-do list: since 0.8.0 the lists are part of Pro for them.
      await chrome.storage.sync.set({ proEarly: { from: 'e2e', at: Date.now() }, proEarlyTodo: { keep: false, at: Date.now() } })
    })
    await sleep(400)
    const p2 = await openNtp()
    const first = await until(p2, () => !!document.querySelector('[data-whats-new]'))
    check("what's new 0.8.0: the Pro note goes first, alone", first && (await p2.evaluate(() => !document.querySelector('[data-whats-new-080]'))))
    const n2 = await p2.evaluate(() => document.querySelector('[data-whats-new]')?.innerText ?? '')
    check("what's new 0.8.0: the Pro note counts to-do lists in Pro for an early user without one, and offers the trial", n2.includes('with to-do lists') && n2.includes('Try it free for 14 days') && !n2.includes('stay free'), n2.slice(0, 240))
    await p2.evaluate(() => [...document.querySelectorAll('[data-whats-new] button')].find((b) => b.textContent.trim() === 'Got it')?.click())
    await sleep(600)
    check("what's new 0.8.0: answering the Pro note brings nothing else to that tab", await p2.evaluate(() => !document.querySelector('[data-whats-new]') && !document.querySelector('[data-whats-new-080]')))
    await p2.close()
    const p3 = await openNtp()
    const c3 = (await until(p3, () => !!document.querySelector('[data-whats-new-080]'))) ? await card(p3) : null
    check("what's new 0.8.0: a later tab shows it, with the Pro line for an early user", !!c3 && c3.pro, JSON.stringify(c3))
    check("what's new 0.8.0: the Pro line says to-do lists moved into Pro and offers the 14-day trial", !!c3 && c3.proText.startsWith('To-do lists now come with Pro') && c3.proText.includes('Try it free for 14 days'), JSON.stringify(c3))
    await p3.close()

    // Put back what the blocks after this one expect.
    await control.evaluate(async (w) => {
      await chrome.storage.local.remove('whatsNew080')
      localStorage.removeItem('stackable:whatsNew080')
      if (w.appearance) await chrome.storage.local.set({ appearance: w.appearance })
      else await chrome.storage.local.remove('appearance')
      await chrome.storage.sync.remove(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey'])
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      if (w.w070 === null) localStorage.removeItem('stackable:whatsNew070')
      else localStorage.setItem('stackable:whatsNew070', w.w070)
      if (w.firstSeen === null) localStorage.removeItem('stackable:firstSeen')
      else localStorage.setItem('stackable:firstSeen', w.firstSeen)
    }, was)
    await sleep(400)
  }

  // ---------- 0.9.0: help link in Settings ----------
  // Settings > Help opens getstackboard.com/support with the version in the hash (never sent to the server).
  {
    const p = await openNtp()
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    await p.waitForSelector('[data-help-link]', { timeout: 8000 }).catch(() => null)
    const known = new Set(browser.targets())
    const opened = browser.waitForTarget((t) => !known.has(t) && t.url().startsWith('https://getstackboard.com/support'), { timeout: 10000 }).catch(() => null)
    await p.evaluate(() => document.querySelector('[data-help-link]')?.click())
    const t = await opened
    const version = await p.evaluate(() => chrome.runtime.getManifest().version)
    check('help: Settings opens the help page with the version in the hash', !!t && t.url() === `https://getstackboard.com/support#v=${version}`, t ? t.url() : 'no tab')
    if (t) await (await t.page().catch(() => null))?.close().catch(() => {})
    await p.close()
  }

  // ---------- 0.9.0: what's new ----------
  // An update from 0.8.0 shows the 0.9.0 note: the free line, one Pro line with the 14-day trial for
  // a free user, and See what's in Pro. An update from before 0.8.0 marks both notes; the 0.9.0 one
  // takes the 0.8.0 one's place, carries its items and Try Packed, and the 0.8.0 note never follows.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const card = (page) =>
      page.evaluate(() => {
        const c = document.querySelector('[data-whats-new-090]')
        return c ? { text: c.innerText, pro: c.querySelector('[data-whats-new-pro]')?.innerText ?? '', tryPacked: !!c.querySelector('[data-try-packed]') } : null
      })
    const was = await control.evaluate(async () => ({
      appearance: (await chrome.storage.local.get('appearance')).appearance ?? null,
      sync: await chrome.storage.sync.get(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey']),
      local: await chrome.storage.local.get(['whatsNew080', 'whatsNew090']),
      w070: localStorage.getItem('stackable:whatsNew070'),
      w080: localStorage.getItem('stackable:whatsNew080'),
      w090: localStorage.getItem('stackable:whatsNew090'),
      firstSeen: localStorage.getItem('stackable:firstSeen'),
    }))
    await control.evaluate(async () => {
      localStorage.setItem('stackable:firstSeen', String(Date.now()))
      localStorage.setItem('stackable:whatsNew070', '-1')
      localStorage.removeItem('stackable:whatsNew080')
      localStorage.removeItem('stackable:whatsNew090')
      await chrome.storage.local.remove(['whatsNew080', 'whatsNew090'])
      await chrome.storage.sync.remove(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey'])
      const a = (await chrome.storage.local.get('appearance')).appearance ?? {}
      await chrome.storage.local.set({ appearance: { ...a, layout: 'rows' } })
    })
    await sleep(400)
    await askWorker(control, { type: 'e2e-updated-from', previousVersion: '0.8.0', whatsNew090: true })
    const p1 = await openNtp()
    const c1 = (await until(p1, () => !!document.querySelector('[data-whats-new-090]'))) ? await card(p1) : null
    check(
      "what's new 0.9.0: an update from 0.8.0 shows the suggested stack and Pro with the 14-day trial",
      !!c1 && c1.text.includes('saving a page suggests the right stack') && !c1.text.includes('folders inside stacks') && c1.pro.startsWith('Stackboard Pro adds a Today strip') && c1.pro.includes('Try it free for 14 days') && !c1.tryPacked,
      JSON.stringify(c1),
    )
    await p1.evaluate(() => [...document.querySelectorAll('[data-whats-new-090] button')].find((b) => b.textContent.trim() === 'Got it')?.click())
    await sleep(500)
    check("what's new 0.9.0: Got it retires it", await p1.evaluate(() => !document.querySelector('[data-whats-new-090]') && localStorage.getItem('stackable:whatsNew090') === '-1'))
    await p1.close()

    // From before 0.8.0: both marks. The 0.9.0 note carries the 0.8.0 items; the 0.8.0 note never comes.
    await control.evaluate(() => localStorage.removeItem('stackable:whatsNew090'))
    await askWorker(control, { type: 'e2e-updated-from', previousVersion: '0.7.0', whatsNew: true, whatsNew090: true })
    const p2 = await openNtp()
    const c2 = (await until(p2, () => !!document.querySelector('[data-whats-new-090]'))) ? await card(p2) : null
    const no080 = await p2.evaluate(() => !document.querySelector('[data-whats-new-080]'))
    check(
      "what's new 0.9.0: from before 0.8.0 it also names folders, Packed and sharing, with Try Packed",
      !!c2 && c2.text.includes('folders inside stacks') && c2.text.includes('share a stack as a link') && c2.text.includes('saving a page suggests the right stack') && c2.tryPacked && no080,
      JSON.stringify(c2),
    )
    await p2.evaluate(() => [...document.querySelectorAll('[data-whats-new-090] button')].find((b) => b.textContent.trim() === 'Got it')?.click())
    await sleep(400)
    await p2.close()
    const p3 = await openNtp()
    await sleep(1500)
    check("what's new 0.9.0: the 0.8.0 note never follows it", await p3.evaluate(() => !document.querySelector('[data-whats-new-080]') && !document.querySelector('[data-whats-new-090]')))
    await p3.close()

    await control.evaluate(async (w) => {
      await chrome.storage.local.remove(['whatsNew080', 'whatsNew090'])
      if (Object.keys(w.local).length) await chrome.storage.local.set(w.local)
      if (w.appearance) await chrome.storage.local.set({ appearance: w.appearance })
      else await chrome.storage.local.remove('appearance')
      await chrome.storage.sync.remove(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey'])
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      for (const [k, v] of [['stackable:whatsNew070', w.w070], ['stackable:whatsNew080', w.w080], ['stackable:whatsNew090', w.w090], ['stackable:firstSeen', w.firstSeen]]) {
        if (v === null) localStorage.removeItem(k)
        else localStorage.setItem(k, v)
      }
    }, was)
    await sleep(400)
  }

  // ---------- 0.8.0: stack reorder past a loose link ----------
  // Chrome counts every child of a folder, while the board shows stacks only: a loose link sitting
  // straight in a space folder (easy to make in Chrome's bookmark manager) used to shift a dropped
  // stack by one place. Drops now use Chrome's own index.
  {
    const until = async (page, fn, arg, ms = 6000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const made = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const mk = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, url })
      const space = await mk(root.id, '🧷 Loose test')
      const ids = {}
      for (const [name, loose] of [['Alpha', true], ['Bravo', false], ['Charlie', false]]) {
        const st = await mk(space.id, name)
        ids[name] = st.id
        await mk(st.id, `${name} link`, `https://example.com/?loose=${name}`)
        if (loose) await mk(space.id, 'Loose link', 'https://example.com/?loose=1')
      }
      return { space: space.id, ...ids }
    })
    const page = await openNtp()
    await page.bringToFront()
    await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Loose test'))?.click())
    await until(page, () => document.querySelector('main h1')?.textContent === 'Loose test' && document.querySelectorAll('main [aria-label="Drag stack header"]').length === 3)
    const header = (id) =>
      page.evaluate((sid) => {
        const r = document.querySelector(`#stack-${sid} [aria-label="Drag stack header"]`).getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, id)
    const from = await header(made.Alpha)
    const to = await header(made.Charlie)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let i = 1; i <= 16; i++) await page.mouse.move(from.x + ((to.x + 30 - from.x) * i) / 16, from.y + ((to.y - from.y) * i) / 16)
    await sleep(300)
    await page.mouse.up()
    await sleep(900)
    const order = await control.evaluate(async (sid) => (await chrome.bookmarks.getChildren(sid)).filter((c) => !c.url).map((c) => c.title), made.space)
    check('reorder: a stack dropped on the last one lands after it, past a loose link', order.join('|') === 'Bravo|Charlie|Alpha', order.join('|'))
    await page.close()
    await control.evaluate((sid) => chrome.bookmarks.removeTree(sid), made.space)
  }

  // ---------- 0.8.0: to-do lists join Pro for early users ----------
  // the maintainer, 3 Nov: early users (installed before Pro) need Pro or the trial for a new to-do list too,
  // unless they already had a list when 0.8.0 first ran. The first board 0.8.0 loads decides, once
  // per Chrome profile ({ keep } in sync); a stored decision stands; lists that exist keep working.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const SPACE = 'Pro gate'
    const was = await control.evaluate(async () => ({
      sync: await chrome.storage.sync.get(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey']),
      firstSeen: localStorage.getItem('stackable:firstSeen'),
    }))
    // An empty space to open New stack on. The rating tests leave an old first-seen date, which would
    // make this board early by itself: start it today, so only proEarly decides.
    const spaceId = await control.evaluate(async (name) => {
      localStorage.setItem('stackable:firstSeen', String(Date.now()))
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      return (await chrome.bookmarks.create({ parentId: root.id, title: `\u{1F9EA} ${name}` })).id
    }, SPACE)
    const setPro = (s) => control.evaluate(async (s) => {
      await chrome.storage.sync.remove(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey'])
      const now = Date.now()
      const set = {}
      if (s.early) set.proEarly = { from: 'e2e', at: now }
      if (typeof s.keep === 'boolean') set.proEarlyTodo = { keep: s.keep, at: now }
      if (s.trial) set.proTrial = { startedAt: now }
      if (Object.keys(set).length) await chrome.storage.sync.set(set)
    }, s)
    // New stack > To-do list on the empty space: is the list behind Pro?
    const gate = async () => {
      const page = await openNtp()
      await page.bringToFront()
      await until(page, () => !!document.querySelector('main h1'))
      await page.evaluate((n) => [...document.querySelectorAll('aside button, nav button, button')].find((b) => b.textContent.includes(n))?.click(), SPACE)
      await until(page, (n) => document.querySelector('main h1')?.textContent === n, SPACE)
      await sleep(400)
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add empty Stack').click())
      await page.waitForSelector('[role=dialog] [data-option="todo"]', { timeout: 5000 })
      await page.click('[role=dialog] [data-option="todo"]')
      await sleep(300)
      const out = await page.evaluate(() => {
        const note = document.querySelector('[role=dialog] [data-todo-pro]')
        return { locked: !!note, text: note ? note.innerText.replace(/\s+/g, ' ') : '' }
      })
      await page.close()
      return out
    }
    const decision = () => control.evaluate(async () => (await chrome.storage.sync.get('proEarlyTodo')).proEarlyTodo ?? null)
    const lists = await control.evaluate(async () => {
      const keys = Object.keys(await chrome.storage.sync.get(null)).filter((k) => k.startsWith('todo:'))
      const markers = (await chrome.bookmarks.search({ query: 'getstackboard.com/todo' })).filter((n) => (n.url || '').startsWith('https://getstackboard.com/todo#'))
      return keys.length + markers.length
    })

    await setPro({})
    const fresh = await gate()
    check('to-do Pro: a new user needs Pro for a list, and the note offers the 14-day trial', fresh.locked && fresh.text.includes('Try it free for 14 days'), JSON.stringify(fresh))
    check('to-do Pro: no early decision is stored for a new user', (await decision()) === null)

    await setPro({ early: true })
    const first = await gate()
    let stored = null
    for (let t = 0; t < 6000 && !stored; t += 200) {
      stored = await decision()
      if (!stored) await sleep(200)
    }
    check('to-do Pro: the first 0.8.0 board decides once for an early user, from the lists that exist', !!stored && stored.keep === lists > 0 && first.locked === !stored.keep, JSON.stringify({ stored, lists, first }))

    await setPro({ early: true, keep: false })
    const moved = await gate()
    check('to-do Pro: an early user without a list needs Pro or the trial', moved.locked && moved.text.includes('Try it free for 14 days'), JSON.stringify(moved))
    check('to-do Pro: a stored decision stands on later tabs', (await decision())?.keep === false)

    await setPro({ early: true, keep: true })
    check('to-do Pro: an early user who had a list keeps making them free', !(await gate()).locked)

    await setPro({ early: true, keep: false, trial: true })
    check('to-do Pro: the trial unlocks to-do lists for an early user too', !(await gate()).locked)

    await control.evaluate(async (w) => {
      await chrome.storage.sync.remove(['proEarly', 'proEarlyTodo', 'proTrial', 'proKey'])
      if (Object.keys(w.sync).length) await chrome.storage.sync.set(w.sync)
      if (w.firstSeen === null) localStorage.removeItem('stackable:firstSeen')
      else localStorage.setItem('stackable:firstSeen', w.firstSeen)
    }, was)
    await control.evaluate((id) => chrome.bookmarks.removeTree(id), spaceId)
    await sleep(300)
  }

  // ---------- 0.7.0: the what's-new note ----------
  // People who had Stackboard before Pro see one corner note; answering it retires it. Since 0.8.0
  // it names the 14-day trial while it can be started, and tells an early user who already had a
  // to-do list that their lists stay free.
  {
    const before070 = await control.evaluate(() => chrome.storage.sync.get(['proTrial', 'proKey', 'proEarlyTodo']))
    await control.evaluate(async () => {
      localStorage.removeItem('stackable:whatsNew070')
      await chrome.storage.sync.remove(['proTrial', 'proKey'])
      await chrome.storage.sync.set({ proEarly: { from: 'e2e', at: Date.now() }, proEarlyTodo: { keep: true, at: Date.now() } })
    })
    const page = await openNtp()
    const note = await page.waitForSelector('[data-whats-new]', { timeout: 6000 }).then(() => page.evaluate(() => document.querySelector('[data-whats-new]').innerText), () => '')
    check("what's new: an early user sees the Pro note with the 14-day trial, and their to-do lists stay free", note.includes('Stackboard Pro') && note.includes('Try it free for 14 days') && note.includes('to-do lists stay free'), note.slice(0, 240))
    await page.evaluate(() => [...document.querySelectorAll('[data-whats-new] button')].find((b) => b.textContent.trim() === 'Got it')?.click())
    await page.close()
    const again = await openNtp()
    await sleep(800)
    check("what's new: answering it retires the note", await again.evaluate(() => !document.querySelector('[data-whats-new]')))
    await again.close()
    await control.evaluate(async (w) => {
      await chrome.storage.sync.remove(['proTrial', 'proKey', 'proEarlyTodo'])
      if (Object.keys(w).length) await chrome.storage.sync.set(w)
    }, before070)
  }

  // ---------- School mode: the pro, ai and rating locks ----------
  // For school or shared computers the policy sets lock.pro, lock.ai and lock.rating: the board
  // builder's "School or shared computers" preset makes it, and here its Admin console export goes in
  // through the unpacked-build override. pro: no prices, trial or upgrade prompts anywhere, a running
  // trial counts for nothing, and a paid key already on this computer keeps its Pro card. ai: no Tidy
  // button, no AI pick and no request to the AI server. rating: no rating card, whichever rule fires.
  // The same board with no policy behaves as before. Polar and getstackboard.com/api are stubbed in
  // every page this block opens, and record each call.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    const KEY = 'SB-E2E-0000-SCHOOL'
    const SYNC = ['proTrial', 'proKey', 'proSub', 'proEarly', 'proEarlyTodo', 'aiFile', 'freeTidy']
    const LOCAL = ['proLicense', 'proCheckout', 'proStats', 'tidyReady', 'tidyNotice2', 'aiFileReady', 'whatsNew080', 'whatsNew090', 'stackboardOpenSpace', 'freeTidy']
    const LS = ['stackable:managedOverride', 'stackable:opens', 'stackable:firstSeen', 'stackable:rating', 'stackable:stashes', 'stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090', 'stackable:trialEnding', 'stackable:trialEnded', 'stackable:proMoments', 'stackable:lastSpaceId', 'stackable:snapshotDay']
    const was = await control.evaluate(async (s) => ({
      sync: await chrome.storage.sync.get(s.sync),
      local: await chrome.storage.local.get(s.local),
      ls: Object.fromEntries(s.ls.map((k) => [k, localStorage.getItem(k)])),
    }), { sync: SYNC, local: LOCAL, ls: LS })
    // Board tabs left open by earlier blocks all react when a key or a trial arrives: close them first.
    for (const pg of await browser.pages()) {
      if (pg === control) continue
      if (pg.url().startsWith(`chrome-extension://${extId}/`) || pg.url().startsWith('chrome://newtab')) await pg.close().catch(() => {})
    }
    const stub = () => {
      const real = window.fetch.bind(window)
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
      window.__calls = []
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url
        if (!url.startsWith('https://getstackboard.com/api/') && !url.startsWith('https://api.polar.sh/')) return real(input, init)
        window.__calls.push(`${(init.method || 'GET').toUpperCase()} ${url}`)
        if (url.startsWith('https://api.polar.sh/')) return json({ benefit_id: 'f204b661-dc9b-4ce5-91f5-7cc6559d1617', status: 'granted', expires_at: null })
        if ((init.method || 'GET').toUpperCase() === 'GET') return json({ ok: true, ready: true, max: 600 })
        return json({ ok: true, stack: 0 })
      }
    }
    const open = async () => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`school: ${e.message}`))
      await p.evaluateOnNewDocument(stub)
      await p.goto(NTP, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForFunction(() => !!document.querySelector('main h1'), { timeout: 10000 })
      return p
    }
    // The save popup with a web page as the current tab.
    const popup = async (tab) => {
      const pop = await browser.newPage()
      pop.on('pageerror', (e) => errors.push(`school popup: ${e.message}`))
      await pop.evaluateOnNewDocument(stub)
      await pop.evaluateOnNewDocument((tab) => {
        const real = chrome.tabs.query.bind(chrome.tabs)
        const fake = [{ id: 990002, windowId: -1, index: 0, url: tab.url, title: tab.title, active: true, highlighted: true }]
        Object.defineProperty(chrome.tabs, 'query', { configurable: true, writable: true, value: async (q) => (q && (q.active || q.highlighted) ? fake : real(q)) })
      }, tab)
      await pop.goto(NTP.replace('newtab.html', 'popup.html'), { waitUntil: 'load' })
      await pop.bringToFront()
      return pop
    }
    const settings = (p) => p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Settings')?.click())
    const ctrlK = async (p) => {
      await p.keyboard.down('Control')
      await p.keyboard.press('KeyK')
      await p.keyboard.up('Control')
    }
    const setPolicy = (p) => control.evaluate((j) => (j ? localStorage.setItem('stackable:managedOverride', j) : localStorage.removeItem('stackable:managedOverride')), p ? JSON.stringify(p) : null)
    // Any way to buy or try Pro, or a price; 0.9.2 adds Pro for life and the reverse-trial card.
    const OFFERS = "Get Pro|free trial|Try it free|Try Pro|Keep Pro|Renew Pro|See what's in Pro|Pro for life|pay once|\\$19 once|Pro is on|free until|\\$\\d"

    // 1. The builder's preset, exported for the Google Admin console, is the policy for the rest.
    let policy = { lock: { pro: true, ai: true, rating: true } }
    const SITE = process.env.STACKABLE_SITE || path.resolve(process.env.STACKABLE_DIST ?? path.resolve(ROOT, '../dist'), '..', 'site')
    if (!fs.existsSync(path.join(SITE, 'teams', 'builder', 'index.html'))) {
      console.log(`SKIP  school builder: no site/teams/builder page under ${SITE} (set STACKABLE_SITE)`)
    } else {
      const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
      const bp = await browser.newPage()
      bp.on('pageerror', (e) => errors.push(`school builder: ${e.message}`))
      await bp.setRequestInterception(true)
      bp.on('request', (req) => {
        const u = new URL(req.url())
        if (u.origin !== 'https://getstackboard.com') return req.continue()
        let rel = decodeURIComponent(u.pathname.slice(1))
        if (!path.extname(rel)) rel = path.join(rel, 'index.html')
        const full = path.resolve(SITE, rel)
        if (!full.startsWith(path.resolve(SITE)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return req.respond({ status: 404, body: 'not found' })
        req.respond({ status: 200, contentType: TYPES[path.extname(full)] ?? 'application/octet-stream', body: fs.readFileSync(full) })
      })
      await bp.goto('https://getstackboard.com/teams/builder', { waitUntil: 'load' })
      await bp.bringToFront()
      const offered = await until(bp, () => ['pro', 'ai', 'rating'].every((k) => !!document.querySelector(`[data-lock="${k}"]`)) && !!document.querySelector('[data-preview]'))
      check('school builder: the three new locks sit beside the others', offered)
      await bp.evaluate(() => document.querySelector('[data-act="preset-school"]')?.click())
      await until(bp, () => (document.querySelector('[data-preview]')?.textContent ?? '').includes('"rating"'))
      const built = await bp.evaluate(() => ({
        ticked: [...document.querySelectorAll('[data-lock]')].filter((b) => b.checked).map((b) => b.dataset.lock),
        json: document.querySelector('[data-preview]')?.textContent ?? '',
      }))
      let exported = null
      try {
        exported = JSON.parse(built.json)
      } catch {
        // checked below
      }
      check(
        'school builder: one click on School or shared computers ticks pro, ai and rating, and the export carries them',
        JSON.stringify(built.ticked) === JSON.stringify(['pro', 'ai', 'rating']) && JSON.stringify(exported?.lock?.Value) === JSON.stringify({ pro: true, ai: true, rating: true }),
        JSON.stringify({ ticked: built.ticked, lock: exported?.lock ?? built.json.slice(0, 120) }),
      )
      // The board reads the Admin console's {"Value": ...} form as it is.
      if (exported?.lock) policy = exported
      await bp.close()
    }

    // 2. A free user with a trial in its last days, early (the Pro note pending, no free to-do lists),
    //    the 0.9.0 note due, and the rating rule met: 30 new tabs over 5 days.
    const made = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const space = await chrome.bookmarks.create({ parentId: root.id, title: '🏫 School test' })
      const st = await chrome.bookmarks.create({ parentId: space.id, title: 'Class links' })
      for (let i = 1; i <= 5; i++) await chrome.bookmarks.create({ parentId: st.id, title: `Class ${i}`, url: `https://class${i}.school-test.example/` })
      return { space: space.id, stack: st.id }
    })
    await setPolicy(policy)
    await control.evaluate(async (space) => {
      const now = Date.now()
      // 0.9.5: the free tidy unused, so the locks are what keeps it away.
      await chrome.storage.sync.remove(['proKey', 'proSub', 'aiFile', 'freeTidy'])
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'tidyReady', 'tidyNotice2', 'aiFileReady', 'whatsNew080', 'stackboardOpenSpace', 'freeTidy'])
      await chrome.storage.sync.set({ proTrial: { startedAt: now - 12.5 * 86400000 }, proEarly: { from: 'e2e', at: now }, proEarlyTodo: { keep: false, at: now } })
      await chrome.storage.local.set({ whatsNew090: { from: '0.8.0', at: now } })
      for (const k of ['stackable:whatsNew070', 'stackable:whatsNew090', 'stackable:trialEnding', 'stackable:trialEnded', 'stackable:proMoments', 'stackable:rating']) localStorage.removeItem(k)
      localStorage.setItem('stackable:whatsNew080', '-1')
      localStorage.setItem('stackable:opens', '30')
      localStorage.setItem('stackable:firstSeen', String(now - 5 * 86400000))
      localStorage.setItem('stackable:lastSpaceId', space)
    }, made.space)

    const s1 = await open()
    await until(s1, () => !!document.querySelector('[data-whats-new-090]'))
    await sleep(1200) // the rating ask and the trial recap decide on load too
    const board = await s1.evaluate((offers) => {
      const re = new RegExp(offers, 'i')
      return {
        h1: document.querySelector('main h1')?.textContent,
        rating: !!document.querySelector('[data-rating-prompt]'),
        recap: !!document.querySelector('[data-trial-end]'),
        proNote: !!document.querySelector('[data-whats-new]'),
        note090: document.querySelector('[data-whats-new-090]')?.innerText ?? null,
        note090Pro: !!document.querySelector('[data-whats-new-090] [data-whats-new-pro]'),
        offers: [...document.querySelectorAll('button, a')].map((b) => b.textContent.trim()).filter((t) => re.test(t)),
        text: re.test(document.body.innerText),
        tidy: !!document.querySelector('[data-tidy-button]') || /free once/i.test(document.body.innerText),
      }
    }, OFFERS)
    // 0.9.4: the trial's one-tap switches stay away too: under the lock the trial counts for nothing.
    const boardSwitches = await s1.evaluate((words) => !!document.querySelector('[data-trial-switch]') || new RegExp(words).test(document.body.innerText), SWITCH_WORDS)
    check('school: the rating card stays away though its rule is met (30 tabs over 5 days)', board.h1 === 'School test' && !board.rating, JSON.stringify(board))
    check("school: no Pro note and no trial recap; the 0.9.0 note comes without its Pro line", !board.proNote && !board.recap && !!board.note090 && !board.note090Pro && !/\bPro\b|trial/i.test(board.note090), JSON.stringify(board))
    check('school: no Get Pro, trial or price anywhere on the board', !board.offers.length && !board.text, JSON.stringify(board.offers))
    await s1.evaluate(() => document.activeElement?.blur())
    await ctrlK(s1)
    const toSearch = await until(s1, () => document.activeElement?.getAttribute('aria-label') === 'Search all spaces', null, 3000)
    check('school: a running trial counts for nothing, so Ctrl+K goes to the search box', toSearch && !(await s1.evaluate(() => !!document.querySelector('[data-command-bar]'))))
    await s1.evaluate(() => document.activeElement?.blur())

    await settings(s1)
    await until(s1, () => !!document.querySelector('[data-keys]'))
    const st = await s1.evaluate((offers) => {
      const re = new RegExp(offers, 'i')
      const dialog = document.querySelector('[role=dialog]')
      const managed = document.querySelector('[data-managed-setting="Stackboard Pro"]')
      // Everything Settings says, the managed section's own heading aside.
      const rest = (dialog?.innerText ?? '').replace(managed?.querySelector('h3')?.innerText ?? '\u0000', '')
      return {
        managed: managed?.innerText ?? null,
        proSection: !!document.querySelector('[data-pro]'),
        archive: !!document.querySelector('[data-archive-setting]'),
        scan: !!document.querySelector('[data-cleanup-scan]'),
        looks: !!document.querySelector('[data-pro-looks]'),
        timeOfDay: !!document.querySelector('[data-appearance] [data-option="time"]'),
        keys: document.querySelector('[data-keys]')?.innerText ?? '',
        rate: [...(dialog?.querySelectorAll('button') ?? [])].some((b) => b.textContent.trim() === 'Rate it'),
        words: rest.match(/[^.\n]*(\bPro\b|\btrials?\b|\$\d)[^.\n]*/gi) ?? [],
        offers: [...(dialog?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()).filter((t) => re.test(t)),
        // 0.9.3: the priced Get Pro and the checkout and refund line.
        checkout: !!document.querySelector('[data-pro-refund]') || /refund|Apple Pay|Get Pro for/i.test(dialog?.innerText ?? ''),
      }
    }, OFFERS)
    check('school: Settings shows the managed line in place of the Pro section', !!st.managed && st.managed.includes('Your company manages this setting.') && !st.proSection, JSON.stringify(st.managed))
    check('school: with the trial running, no Pro feature or try-on shows', !st.archive && !st.looks && !st.timeOfDay, JSON.stringify(st))
    check('school: the free clean-up scan stays, and so does Rate it', st.scan && st.rate, JSON.stringify(st))
    check('school: nothing in Settings mentions Pro, a trial or a price, Keys included', !st.words.length && !st.offers.length && !st.keys.includes('(Pro)') && !st.keys.includes('Command bar'), JSON.stringify({ words: st.words, offers: st.offers, keys: st.keys }))
    check('school: Settings has no priced Get Pro and no checkout or refund line', !st.checkout)
    const settingsSwitches = await s1.evaluate((words) => !!document.querySelector('[data-pro-trial-switches], [data-trial-switch]') || new RegExp(words).test(document.querySelector('[role=dialog]')?.innerText ?? ''), SWITCH_WORDS)
    check('school: no trial switches on the board or in Settings with the trial running', !boardSwitches && !settingsSwitches, JSON.stringify({ boardSwitches, settingsSwitches }))

    await s1.evaluate(() => document.querySelector('[data-cleanup-scan]')?.click())
    await until(s1, () => !!document.querySelector('[data-cleanup]'))
    const cl = await s1.evaluate(() => {
      const dialog = document.querySelector('[role=dialog]')
      return {
        tabs: [...(dialog?.querySelectorAll('[data-option]') ?? [])].map((o) => o.dataset.option),
        offer: !!dialog?.querySelector('[data-cleanup-free], [data-cleanup-trial], [data-cleanup-get-pro], [data-cleanup-dead-pro]'),
        footer: [...(dialog?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()).filter(Boolean),
        text: dialog?.innerText ?? '',
      }
    })
    check('school: the clean-up scan runs with no dead-link tab and no offer', cl.tabs.join(',') === 'dupes,unused' && !cl.offer && !/\bPro\b|\btrial\b/i.test(cl.text), JSON.stringify({ ...cl, text: cl.text.slice(0, 160) }))
    await s1.keyboard.press('Escape')
    await until(s1, () => !document.querySelector('[role=dialog]'))

    await s1.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Add empty Stack')?.click())
    await until(s1, () => !!document.querySelector('[role=dialog] input'))
    const ns = await s1.evaluate(() => ({
      title: document.querySelector('[role=dialog]')?.getAttribute('aria-label'),
      todo: !!document.querySelector('[role=dialog] [data-option="todo"]'),
      note: !!document.querySelector('[role=dialog] [data-todo-pro]'),
    }))
    check('school: New stack offers no To-do list to someone who would need Pro for it', ns.title === 'New stack' && !ns.todo && !ns.note, JSON.stringify(ns))
    await s1.keyboard.press('Escape')
    await until(s1, () => !document.querySelector('[role=dialog]'))

    await s1.evaluate((id) => document.querySelector(`#stack-${id} button[aria-label="Stack options"]`)?.click(), made.stack)
    await until(s1, () => !!document.querySelector('[data-stack-style]'))
    const styleLabel = await s1.evaluate(() => document.querySelector('[data-stack-style]')?.textContent.trim())
    await s1.evaluate(() => document.querySelector('[data-stack-style]')?.click())
    await until(s1, () => !!document.querySelector('[data-stack-style-dialog]'))
    const sd = await s1.evaluate(() => ({
      title: document.querySelector('[role=dialog]')?.getAttribute('aria-label'),
      colours: document.querySelectorAll('[data-stack-color-option]').length,
      keep: !!document.querySelector('[data-stack-color-try]'),
    }))
    check("school: a stack's menu offers its icon alone, with no colour try-on", styleLabel === 'Icon' && sd.title === 'Icon' && sd.colours === 0 && !sd.keep, JSON.stringify({ styleLabel, ...sd }))
    await s1.keyboard.press('Escape')
    // 0.9.5: the free tidy, unused here, never shows under the locks, and nothing asks the server about
    // it, from the board, Settings (opened above) or a space menu.
    await s1.evaluate(() => [...document.querySelectorAll('aside button[aria-label="Space options"]')].find((b) => b.parentElement?.parentElement?.textContent.includes('School test'))?.click())
    await sleep(1000)
    const s1Calls = await s1.evaluate(() => window.__calls.filter((c) => c.includes('getstackboard.com/api/')))
    check('school: a free board gets no free Tidy under the locks, and nothing asks the server, from the board, Settings or a space menu', !board.tidy && !s1Calls.length, JSON.stringify({ tidy: board.tidy, s1Calls }))
    await s1.close()

    // Stash and close lands on a new tab, the third stash: no auto-archive line, and no rating ask
    // at the milestone or after the win either. The 0.9.0 note is answered, so the corner is free.
    await control.evaluate((note) => {
      localStorage.setItem('stackable:whatsNew090', '-1')
      localStorage.setItem('stackable:stashes', '2')
      return chrome.storage.local.set({ stackboardOpenSpace: note })
    }, { spaceId: made.space, saved: 3, at: Date.now() })
    const s2 = await open()
    const toast = await until(s2, () => (document.querySelector('.toast')?.textContent ?? '').includes('Stashed'))
    await sleep(3500) // the line waits 2.5 s after the stash lands
    const landed = await s2.evaluate(() => ({ moment: !!document.querySelector('[data-moment-line]'), rating: !!document.querySelector('[data-rating-prompt]'), corner: !!document.querySelector('[data-whats-new], [data-whats-new-090], [data-trial-end]') }))
    check('school: after Stash and close lands, no auto-archive line and no rating ask', toast && !landed.moment && !landed.rating && !landed.corner, JSON.stringify({ toast, ...landed }))
    await s2.close()

    // 3. A paid key already active on this computer, AI pick switched on, the same policy.
    await control.evaluate(async (key) => {
      const now = Date.now()
      await chrome.storage.sync.remove('proTrial')
      await chrome.storage.local.remove(['tidyReady', 'aiFileReady', 'stackboardOpenSpace'])
      // The license first: a key that arrives without one makes open pages activate it.
      await chrome.storage.local.set({ proLicense: { key, activationId: 'act-school', status: 'granted', checkedAt: now, okAt: now } })
      await chrome.storage.sync.set({ proKey: { key }, aiFile: { on: true, at: now } })
    }, KEY)
    await sleep(400)
    const s3 = await open()
    await until(s3, () => !!document.querySelector('[data-pro-crown]'))
    await sleep(1000)
    const tidyLocked = await s3.evaluate(() => !!document.querySelector('[data-tidy-button]'))
    await settings(s3)
    await until(s3, () => document.querySelector('[data-pro]')?.dataset.pro === 'pro')
    await sleep(800)
    const paid = await s3.evaluate(() => {
      const pro = document.querySelector('[data-pro]')
      return {
        card: !!pro?.querySelector('[data-pro-card]'),
        managed: !!document.querySelector('[data-managed-setting="Stackboard Pro"]'),
        archive: !!document.querySelector('[data-archive-setting]'),
        buttons: [...(pro?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()),
        aiPick: !!document.querySelector('[data-ai-file-setting], [data-ai-file-toggle]'),
        keys: document.querySelector('[data-keys]')?.innerText ?? '',
        refund: !!document.querySelector('[data-pro-refund]') || /refund|Apple Pay/i.test(pro?.innerText ?? ''),
        // 0.9.4: the trial's one-tap switches.
        switches: !!document.querySelector('[data-pro-trial-switches], [data-trial-switch]'),
      }
    })
    check('school: a paid key already on this computer keeps its Pro card and Pro features', paid.card && !paid.managed && paid.archive, JSON.stringify(paid))
    check('school: and no trial switches with a paid key', !paid.switches)
    check('school: the Pro card has no buy, trial or renew button', paid.buttons.length > 0 && !paid.buttons.some((t) => /Get Pro|trial|Renew|Keep Pro/i.test(t)), JSON.stringify(paid.buttons))
    check('school: and no checkout or refund line', !paid.refund)
    check('school: with Pro on, Keys lists the command bar without "(Pro)"', paid.keys.includes('Command bar') && !paid.keys.includes('(Pro)'), paid.keys)
    await s3.keyboard.press('Escape')
    await until(s3, () => !document.querySelector('[role=dialog]'))
    await ctrlK(s3)
    const barPaid = await until(s3, () => !!document.querySelector('[data-command-bar]'), null, 3000)
    await s3.keyboard.press('Escape')
    check('school: the command bar works for the paid key', barPaid)
    // A space menu is the other place that asks the server about Tidy for a key.
    await s3.evaluate(() => [...document.querySelectorAll('aside button[aria-label="Space options"]')].find((b) => b.parentElement?.parentElement?.textContent.includes('School test'))?.click())
    await sleep(1200)
    const calls3 = await s3.evaluate(() => window.__calls.slice())
    check('school: under the ai lock a paid key gets no Tidy button and no AI pick switch', !tidyLocked && !paid.aiPick, JSON.stringify({ tidyLocked, aiPick: paid.aiPick }))
    check('school: and nothing asks getstackboard.com/api/tidy or /api/file, from the board, Settings or a space menu', !calls3.some((c) => c.includes('getstackboard.com/api/')), JSON.stringify(calls3))
    await s3.close()
    const p1 = await popup({ url: 'https://class1.school-test.example/homework', title: 'Homework' })
    await until(p1, () => !!document.querySelector('[data-suggested-stack]'))
    await sleep(1200)
    const pick1 = await p1.evaluate(() => ({ calls: window.__calls.slice(), reason: document.querySelector('[data-suggested-stack]')?.dataset.suggestedReason ?? null, asking: (document.querySelector('[data-suggested]')?.textContent ?? '').includes('Asking AI') }))
    check('school: the save popup asks no AI, and offers its own match', pick1.calls.length === 0 && pick1.reason === 'site' && !pick1.asking, JSON.stringify(pick1))
    await p1.close()

    // 4. No policy, the same paid key: Tidy and AI pick come back, and Settings asks the server as before.
    await setPolicy(null)
    const s4 = await open()
    await until(s4, () => !!document.querySelector('[data-pro-crown]'))
    const tidyBack = await until(s4, () => !!document.querySelector('[data-tidy-button]'))
    await settings(s4)
    const askedTidy = await until(s4, () => window.__calls.some((c) => c.startsWith('GET https://getstackboard.com/api/tidy')))
    const pickBack = await until(s4, () => !!document.querySelector('[data-ai-file-toggle]'))
    check('school: with no policy the paid key has Tidy and the AI pick switch, and Settings asks the server', tidyBack && askedTidy && pickBack, JSON.stringify({ tidyBack, askedTidy, pickBack }))
    await s4.close()
    const p2 = await popup({ url: 'https://class1.school-test.example/homework', title: 'Homework' })
    check('school: with no policy the save popup asks the AI again', await until(p2, () => window.__calls.some((c) => c.startsWith('POST https://getstackboard.com/api/file'))))
    await p2.close()

    // 5. No policy, no key: the rating card, the Pro offer with the trial, the Pro note and To-do list are back.
    await control.evaluate(async () => {
      // The license first, so no open page tries to free a computer for a key that never was.
      await chrome.storage.local.remove(['proLicense', 'tidyReady', 'aiFileReady'])
      await chrome.storage.sync.remove(['proKey', 'proSub', 'aiFile'])
    })
    await sleep(400)
    const s5 = await open()
    const ratingBack = await until(s5, () => !!document.querySelector('[data-rating-prompt]'), null, 5000)
    const proNoteBack = await until(s5, () => !!document.querySelector('[data-whats-new]'), null, 5000)
    check('school: with no policy the rating card and the Pro note come back on the same board', ratingBack && proNoteBack, JSON.stringify({ ratingBack, proNoteBack }))
    const freeBack = await until(s5, () => document.querySelector('[data-tidy-button]')?.textContent.trim() === 'Tidy (free once)', null, 5000)
    check('school: with no policy the free board has Tidy (free once) again', freeBack)
    await s5.evaluate(() => [...document.querySelectorAll('[data-rating-prompt] button')].find((b) => b.textContent.trim() === 'No thanks')?.click())
    await settings(s5)
    const offerBack = await until(s5, () => {
      const p = document.querySelector('[data-pro]')
      return p?.dataset.pro === 'free' && p.innerText.includes('Get Pro') && p.innerText.includes('Try it free for 14 days') && !document.querySelector('[data-managed-setting="Stackboard Pro"]')
    })
    check('school: with no policy Settings sells Pro with the trial again', offerBack)
    await s5.keyboard.press('Escape')
    await until(s5, () => !document.querySelector('[role=dialog]'))
    await s5.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Add empty Stack')?.click())
    check('school: with no policy New stack offers To-do list again', await until(s5, () => !!document.querySelector('[role=dialog] [data-option="todo"]')))
    await s5.keyboard.press('Escape')
    await s5.close()

    await control.evaluate(async (s) => {
      // The license first, as above.
      await chrome.storage.local.remove(s.local)
      await chrome.storage.sync.remove(s.sync)
      if (Object.keys(s.was.local).length) await chrome.storage.local.set(s.was.local)
      if (Object.keys(s.was.sync).length) await chrome.storage.sync.set(s.was.sync)
      for (const [k, v] of Object.entries(s.was.ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
      await chrome.bookmarks.removeTree(s.space)
    }, { was, sync: SYNC, local: LOCAL, space: made.space })
    await sleep(400)
  }

  // ---------- 0.9.6: the tidy coach mark after an import, and the rating ask after a tidy ----------
  // An import that lands a space of 15 to 600 links points at its Tidy button with a one-time card,
  // once the server says Tidy is on (the GET Settings and the space menus send; stubbed here as in the
  // tidy block). Nothing under 15 links or under the company's ai lock; once per Chrome profile
  // (localStorage stackable:tidyCoach). An applied tidy is a rating milestone: it asks once its toast
  // has gone, an Undo takes it back, and before the install is a day old it waits for the first new
  // tab after that. The spaces wait in a folder under Other bookmarks, so the board is empty.
  {
    const until = async (page, fn, arg, ms = 8000) => {
      for (let t = 0; t < ms; t += 150) {
        if (await page.evaluate(fn, arg).catch(() => false)) return true
        await sleep(150)
      }
      return false
    }
    // Board tabs left open by earlier blocks would react to every write below: close them.
    for (const pg of await browser.pages()) {
      if (pg === control) continue
      if (pg.url().startsWith(`chrome-extension://${extId}/`) || pg.url().startsWith('chrome://newtab')) await pg.close().catch(() => {})
    }
    const SYNC = ['freeTidy', 'proTrial', 'proKey']
    const LOCAL = ['proLicense', 'proCheckout', 'freeTidy', 'tidyReady', 'tidyNotice2', 'appearance', 'policyLocks']
    const LS = ['stackable:tidyCoach', 'stackable:tidyWin', 'stackable:rating', 'stackable:opens', 'stackable:firstSeen', 'stackable:lastSpaceId', 'stackable:managedOverride', 'stackable:managedDelayMs', 'stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090']
    const was = await control.evaluate(async (s) => ({
      sync: await chrome.storage.sync.get(s.sync),
      local: await chrome.storage.local.get(s.local),
      ls: Object.fromEntries(s.ls.map((k) => [k, localStorage.getItem(k)])),
    }), { sync: SYNC, local: LOCAL, ls: LS })
    // getstackboard.com/api answers in the page, as in the tidy block: GET says whether Tidy is on, POST
    // sorts the links by the first word of their host. Every call is recorded.
    const stub = (ready) => {
      const real = window.fetch.bind(window)
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
      window.__tidyCalls = []
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url
        if (url.startsWith('https://getstackboard.com/api/')) {
          const method = (init.method || 'GET').toUpperCase()
          window.__tidyCalls.push(`${method} ${new URL(url).pathname}`)
          if (method === 'GET') return json({ ok: true, ready, max: 600 })
          const body = JSON.parse(init.body)
          const groups = new Map()
          body.links.forEach((l, i) => {
            const k = new URL(l.url).hostname.split('.')[0].replace(/\d+$/, '')
            groups.set(k, [...(groups.get(k) ?? []), i])
          })
          const stacks = [...groups].map(([name, links]) => ({ name: name[0].toUpperCase() + name.slice(1), links }))
          return json({ ok: true, board: { spaces: [{ name: body.space, emoji: '🧪', stacks }], missing: 0 } })
        }
        if (url.startsWith('https://api.polar.sh/')) return Promise.reject(new TypeError('blocked by the e2e'))
        return real(input, init)
      }
    }
    const open = async (ready = true) => {
      const p = await browser.newPage()
      await p.setViewport({ width: 1400, height: 900 })
      p.on('pageerror', (e) => errors.push(`coach: ${e.message}`))
      await p.evaluateOnNewDocument(stub, ready)
      await p.goto(NTP, { waitUntil: 'load' })
      await p.bringToFront()
      await p.waitForFunction(() => !!document.querySelector('main h1') || !!document.querySelector('[data-welcome="import"] label'), { timeout: 10000 })
      return p
    }
    // Copy on the welcome screen with what's ticked (the bookmarks bar); returns the button's words.
    const copyIn = async (p) => {
      await until(p, () => !!document.querySelector('[data-welcome="import"] label'))
      const said = await p.evaluate(() => {
        const b = [...document.querySelectorAll('[data-welcome="import"] button')].find((x) => x.textContent.trim().startsWith('Copy'))
        b?.click()
        return b?.textContent.trim() ?? ''
      })
      await until(p, () => document.querySelector('main h1')?.textContent === 'Bookmarks bar', null, 15000)
      return said
    }
    const shownCoach = (p) => until(p, () => !!document.querySelector('[data-tidy-coach]'), null, 10000)
    // The default palette on a plain background, so the screenshots show the mark and nothing else.
    const setLook = (mode) => control.evaluate(async (mode) => {
      const a = (await chrome.storage.local.get('appearance')).appearance ?? {}
      await chrome.storage.local.set({ appearance: { ...a, palette: 'stackboard', mode, bg: { ...(a.bg ?? {}), kind: 'solid' } } })
    }, mode)

    const held = await control.evaluate(async () => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const hold = await chrome.bookmarks.create({ parentId: '2', title: 'e2e hold' })
      for (const k of await chrome.bookmarks.getChildren(root.id)) await chrome.bookmarks.move(k.id, { parentId: hold.id })
      return { root: root.id, hold: hold.id }
    })
    const emptyBoard = () => control.evaluate(async (rootId) => {
      for (const k of await chrome.bookmarks.getChildren(rootId)) await chrome.bookmarks.removeTree(k.id)
    }, held.root)
    // The bookmarks bar holds 3 links from the welcome block; a folder of 11 more makes 14.
    const addToPile = (id, from, to) => control.evaluate(async (id, from, to) => {
      const hosts = ['alpha', 'beta', 'gamma']
      for (let i = from; i < to; i++) await chrome.bookmarks.create({ parentId: id, title: `Pile ${i + 1}`, url: `https://${hosts[i % 3]}${i + 1}.coach.example/` })
    }, id, from, to)
    const pile = await control.evaluate(async () => (await chrome.bookmarks.create({ parentId: '1', title: 'Coach pile' })).id)
    await addToPile(pile, 0, 11)
    await control.evaluate(async () => {
      // The license first, so no open page tries to free a computer for a key that never was.
      await chrome.storage.local.remove(['proLicense', 'proCheckout', 'freeTidy', 'tidyReady', 'tidyNotice2'])
      await chrome.storage.sync.remove(['freeTidy', 'proTrial', 'proKey'])
      for (const k of ['stackable:tidyCoach', 'stackable:tidyWin', 'stackable:rating', 'stackable:lastSpaceId', 'stackable:managedOverride']) localStorage.removeItem(k)
      // No corner card takes the corner first: the what's-new notes count as answered here.
      for (const k of ['stackable:whatsNew070', 'stackable:whatsNew080', 'stackable:whatsNew090']) localStorage.setItem(k, '-1')
      localStorage.setItem('stackable:opens', '2')
      // Installed three hours ago: the rating milestone's first day isn't over yet.
      localStorage.setItem('stackable:firstSeen', String(Date.now() - 3 * 3600000))
    })
    await setLook('light')

    // 1. Fourteen links: Tidy (free once) is there, but no coach mark, and nothing asks the server.
    const a = await open()
    const aSaid = await copyIn(a)
    const aTidy = await until(a, () => document.querySelector('[data-tidy-button]')?.textContent.trim() === 'Tidy (free once)')
    await sleep(3200) // past the mark's wait after an import
    const aState = await a.evaluate(() => ({ coach: !!document.querySelector('[data-tidy-coach]'), calls: window.__tidyCalls.slice(), marker: localStorage.getItem('stackable:tidyCoach') }))
    check(
      'tidy coach: an import of 14 links shows no coach mark, though Tidy (free once) is there, and asks the server nothing',
      aSaid === 'Copy 14 links' && aTidy && !aState.coach && !aState.calls.length && aState.marker === null,
      JSON.stringify({ aSaid, aTidy, ...aState }),
    )
    await a.close()
    await emptyBoard()
    await addToPile(pile, 11, 20)

    // 2. The company's ai lock: 23 links, and still no coach mark, no Tidy and no request.
    await control.evaluate(() => localStorage.setItem('stackable:managedOverride', JSON.stringify({ lock: { ai: true } })))
    const b = await open()
    const bSaid = await copyIn(b)
    await sleep(3500)
    const bState = await b.evaluate(() => ({ coach: !!document.querySelector('[data-tidy-coach]'), tidy: !!document.querySelector('[data-tidy-button]'), calls: window.__tidyCalls.slice(), marker: localStorage.getItem('stackable:tidyCoach') }))
    check(
      'tidy coach: under the company ai lock an import of 23 links shows no coach mark and no Tidy, and asks the server nothing',
      bSaid === 'Copy 23 links' && !bState.coach && !bState.tidy && !bState.calls.length && bState.marker === null,
      JSON.stringify({ bSaid, ...bState }),
    )
    await b.close()
    await control.evaluate(() => localStorage.removeItem('stackable:managedOverride'))
    await emptyBoard()

    // The server says Tidy is off: the one GET, then nothing, and the button goes too.
    const off = await open(false)
    await copyIn(off)
    const asked0 = await until(off, () => window.__tidyCalls.includes('GET /api/tidy'))
    await sleep(3000)
    const offState = await off.evaluate(() => ({ coach: !!document.querySelector('[data-tidy-coach]'), tidy: !!document.querySelector('[data-tidy-button]'), calls: window.__tidyCalls.slice(), marker: localStorage.getItem('stackable:tidyCoach') }))
    check(
      'tidy coach: when the server says Tidy is off, the import asks once and shows nothing',
      asked0 && !offState.coach && !offState.tidy && JSON.stringify(offState.calls) === JSON.stringify(['GET /api/tidy']) && offState.marker === null,
      JSON.stringify(offState),
    )
    await off.close()
    await control.evaluate(() => chrome.storage.local.remove('tidyReady'))
    await emptyBoard()

    // 3. 23 links: the mark hangs from that space's Tidy button once the server says Tidy is on.
    const c = await open()
    const cSaid = await copyIn(c)
    const cShown = await shownCoach(c)
    await sleep(400) // its entrance
    const coach = await c.evaluate(() => {
      const card = document.querySelector('[data-tidy-coach]')
      const btn = document.querySelector('[data-tidy-button]')
      const caret = document.querySelector('[data-tidy-coach-caret]')
      if (!card || !btn || !caret) return null
      const r = card.getBoundingClientRect()
      const b = btn.getBoundingClientRect()
      const k = caret.getBoundingClientRect()
      return {
        h1: document.querySelector('main h1')?.textContent,
        kind: card.dataset.tidyCoach,
        title: card.querySelector('h3')?.textContent.trim(),
        body: card.querySelector('p')?.textContent.trim(),
        buttons: [...card.querySelectorAll('button')].map((x) => x.textContent.trim()),
        under: r.top > b.bottom && r.top - b.bottom <= 16 && Math.abs(r.right - b.right) <= 1,
        caret: Math.abs(k.left + k.width / 2 - (b.left + b.width / 2)) <= 2 && k.top >= b.bottom - 1 && k.top < r.top,
        ring: btn.hasAttribute('data-tidy-coached'),
        calls: window.__tidyCalls.slice(),
        marker: localStorage.getItem('stackable:tidyCoach'),
        dialog: !!document.querySelector('[role=dialog]'),
      }
    })
    check(
      "tidy coach: an import of 23 links points at that space's Tidy button, the caret on the button's middle",
      cSaid === 'Copy 23 links' && cShown && coach?.h1 === 'Bookmarks bar' && coach.kind === 'free' && coach.under && coach.caret && coach.ring && !coach.dialog,
      JSON.stringify(coach),
    )
    check(
      'tidy coach: it says "Want these sorted?" with the free line, "Sort them for me" and "Not now"',
      coach?.title === 'Want these sorted?' &&
        coach.body === 'Tidy reads the titles and links in this space and sorts them into stacks. You can undo it. Your first one is free.' &&
        JSON.stringify(coach.buttons) === JSON.stringify(['Sort them for me', 'Not now']),
      JSON.stringify(coach && { title: coach.title, body: coach.body, buttons: coach.buttons }),
    )
    check('tidy coach: right after the import it asked whether Tidy is on, one GET, and sent nothing else', JSON.stringify(coach?.calls) === JSON.stringify(['GET /api/tidy']), JSON.stringify(coach?.calls))
    check('tidy coach: it is marked shown in localStorage, once per Chrome profile', !!coach?.marker && Number(coach.marker) > 0, String(coach?.marker))
    // The whole tab, and a close-up of the button with the mark hanging from it.
    const closeUp = () => c.evaluate(() => {
      const b = document.querySelector('[data-tidy-button]').getBoundingClientRect()
      const r = document.querySelector('[data-tidy-coach]').getBoundingClientRect()
      const x = Math.max(0, Math.min(b.left, r.left) - 48)
      const y = Math.max(0, b.top - 40)
      return { x, y, width: Math.min(innerWidth - x, Math.max(b.right, r.right) + 48 - x), height: r.bottom + 48 - y }
    })
    await c.screenshot({ path: path.join(SHOTS, '096-coach-light.png') })
    await c.screenshot({ path: path.join(SHOTS, '096-coach-light-close.png'), clip: await closeUp() })
    await setLook('dark')
    const darkOn = await until(c, () => document.documentElement.dataset.scheme === 'dark')
    await sleep(500)
    await c.screenshot({ path: path.join(SHOTS, '096-coach-dark.png') })
    await c.screenshot({ path: path.join(SHOTS, '096-coach-dark-close.png'), clip: await closeUp() })
    const darkCard = await c.evaluate(() => {
      const card = document.querySelector('[data-tidy-coach]')
      return card ? { bg: getComputedStyle(card).backgroundColor, title: getComputedStyle(card.querySelector('h3')).color } : null
    })
    check('tidy coach: in the dark scheme it takes the palette (Stackboard Dark) and stays up', darkOn && darkCard?.bg === rgb('#302925'), JSON.stringify(darkCard))
    await setLook('light')
    await until(c, () => document.documentElement.dataset.scheme === 'light')

    // "Sort them for me" starts Tidy exactly as its button does: the notice first, nothing sent yet.
    await c.evaluate(() => document.querySelector('[data-tidy-coach-sort]')?.click())
    const viaCoach = await until(c, () => !!document.querySelector('[data-tidy-notice]'))
    const n1 = await c.evaluate(() => ({
      html: document.querySelector('[role=dialog]')?.innerHTML ?? '',
      title: document.querySelector('[role=dialog]')?.getAttribute('aria-label'),
      coach: !!document.querySelector('[data-tidy-coach]'),
      ring: !!document.querySelector('[data-tidy-coached]'),
      posts: window.__tidyCalls.filter((x) => x.startsWith('POST')).length,
    }))
    await c.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === 'Cancel')?.click())
    await until(c, () => !document.querySelector('[role=dialog]'))
    await c.evaluate(() => document.querySelector('[data-tidy-button]')?.click())
    const viaButton = await until(c, () => !!document.querySelector('[data-tidy-notice]'))
    const n2 = await c.evaluate(() => document.querySelector('[role=dialog]')?.innerHTML ?? '')
    check(
      'tidy coach: "Sort them for me" opens the same AI notice as the Tidy button, and sends nothing yet',
      viaCoach && viaButton && n1.title === 'Tidy this space' && n1.html.includes("Anthropic's AI") && n1.html === n2 && !n1.coach && !n1.ring && n1.posts === 0,
      JSON.stringify({ viaCoach, viaButton, title: n1.title, same: n1.html === n2, coach: n1.coach, ring: n1.ring, posts: n1.posts }),
    )

    // 4. Sorted from there. Three hours after install, so the rating ask keeps the milestone for later.
    await c.evaluate(() => document.querySelector('[data-tidy-continue]')?.click())
    const cPreview = await until(c, () => document.querySelectorAll('[data-tidy-stack]').length >= 3, null, 10000)
    await c.evaluate(() => document.querySelector('[data-tidy-apply]')?.click())
    const cApplied = await until(c, () => (document.querySelector('.toast')?.textContent ?? '').includes('Tidied'), null, 10000)
    const cWin = await c.evaluate(() => localStorage.getItem('stackable:tidyWin'))
    const cGone = await until(c, () => !document.querySelector('.toast'), null, 16000) // the Tidied toast lasts 10 s
    await sleep(1200)
    const cAfter = await c.evaluate(() => ({ rating: !!document.querySelector('[data-rating-prompt]'), win: localStorage.getItem('stackable:tidyWin') }))
    check(
      'tidy rating: a tidy applied before the install is a day old asks nothing on its tab, and is kept for later',
      cPreview && cApplied && !!cWin && cGone && !cAfter.rating && cAfter.win === cWin,
      JSON.stringify({ cPreview, cApplied, cWin, cGone, ...cAfter }),
    )
    await c.close()
    const c2 = await open()
    await sleep(1500)
    const early = await c2.evaluate(() => ({ rating: !!document.querySelector('[data-rating-prompt]'), win: localStorage.getItem('stackable:tidyWin') }))
    await c2.close()
    // The clock moves on: installed two days ago.
    await control.evaluate(() => localStorage.setItem('stackable:firstSeen', String(Date.now() - 2 * 86400000)))
    const c3 = await open()
    const asked = await until(c3, () => !!document.querySelector('[data-rating-prompt]'), null, 5000)
    const ask3 = await c3.evaluate(() => {
      const card = document.querySelector('[data-rating-prompt]')
      const r = card?.getBoundingClientRect()
      return {
        centred: !!r && Math.abs(r.left + r.width / 2 - innerWidth / 2) < 4,
        stars: card ? card.querySelectorAll('svg.lucide-star').length : -1,
        text: card?.textContent ?? '',
        win: localStorage.getItem('stackable:tidyWin'),
      }
    })
    check(
      'tidy rating: a new tab inside the first day keeps it; the first new tab after the one-day mark asks, with the same star-free card',
      !early.rating && !!early.win && asked && ask3.centred && ask3.stars === 0 && ask3.text.includes('A small favour') && ask3.text.includes('Rate on the Chrome Web Store') && ask3.win === null,
      JSON.stringify({ early, asked, ...ask3, text: ask3.text.slice(0, 60) }),
    )
    // Once: with that card still unanswered, the next new tab asks nothing.
    const c4 = await open()
    await sleep(1500)
    const onceOnly = await c4.evaluate(() => !document.querySelector('[data-rating-prompt]'))
    await c4.close()
    await c3.bringToFront()
    await c3.evaluate(() => [...document.querySelectorAll('[data-rating-prompt] button')].find((x) => x.textContent.trim() === 'No thanks')?.click())
    const answered = await until(c3, () => !document.querySelector('[data-rating-prompt]') && localStorage.getItem('stackable:rating') === 'dismissed')
    check('tidy rating: the carried-over ask comes once, and No thanks retires it', onceOnly && answered, JSON.stringify({ onceOnly, answered }))
    await c3.close()

    // 5. Again, with the free tidy unused and no marker: Not now retires the mark, and a later import
    //    on a new tab never brings it back.
    await emptyBoard()
    const fresh = () => control.evaluate(async () => {
      await chrome.storage.local.remove('freeTidy')
      await chrome.storage.sync.remove('freeTidy')
      localStorage.removeItem('stackable:tidyCoach')
    })
    await fresh()
    const d = await open()
    await copyIn(d)
    const dShown = await shownCoach(d)
    await d.evaluate(() => document.querySelector('[data-tidy-coach-later]')?.click())
    const dGone = await until(d, () => !document.querySelector('[data-tidy-coach]') && !document.querySelector('[data-tidy-coached]'))
    const dState = await d.evaluate(() => ({ marker: localStorage.getItem('stackable:tidyCoach'), tidy: document.querySelector('[data-tidy-button]')?.textContent.trim() ?? null, dialog: !!document.querySelector('[role=dialog]') }))
    check('tidy coach: Not now retires it and leaves Tidy (free once) where it was', dShown && dGone && !!dState.marker && dState.tidy === 'Tidy (free once)' && !dState.dialog, JSON.stringify({ dShown, dGone, ...dState }))
    await d.close()
    await emptyBoard()
    const d2 = await open()
    await copyIn(d2)
    await sleep(3500)
    const dAgain = await d2.evaluate(() => ({ coach: !!document.querySelector('[data-tidy-coach]'), tidy: document.querySelector('[data-tidy-button]')?.textContent.trim() ?? null }))
    await d2.close()
    const d3 = await open()
    await sleep(2500)
    const dLater = await d3.evaluate(() => !document.querySelector('[data-tidy-coach]'))
    await d3.close()
    check('tidy coach: once retired it never returns, on a new tab or after another import', !dAgain.coach && dAgain.tidy === 'Tidy (free once)' && dLater, JSON.stringify({ ...dAgain, dLater }))

    // 6. Esc retires it too.
    await emptyBoard()
    await fresh()
    const e = await open()
    await copyIn(e)
    const eShown = await shownCoach(e)
    await e.keyboard.press('Escape')
    const eGone = await until(e, () => !document.querySelector('[data-tidy-coach]'))
    const eMarker = await e.evaluate(() => localStorage.getItem('stackable:tidyCoach'))
    check('tidy coach: Esc retires it as well', eShown && eGone && !!eMarker, JSON.stringify({ eShown, eGone, eMarker }))

    // 7. Two days in, the rating unanswered: an Undo takes the milestone back; a tidy that stays asks
    //    once its toast has gone, and not while the toast and its Undo are up.
    await control.evaluate(() => {
      localStorage.removeItem('stackable:rating')
      localStorage.removeItem('stackable:tidyWin')
    })
    const sortHere = async (p) => {
      await until(p, () => document.querySelector('[data-tidy-button]')?.textContent.trim() === 'Tidy (free once)')
      await p.evaluate(() => document.querySelector('[data-tidy-button]')?.click()) // the notice was accepted in step 3
      await until(p, () => document.querySelectorAll('[data-tidy-stack]').length >= 3, null, 10000)
      await p.evaluate(() => document.querySelector('[data-tidy-apply]')?.click())
      return until(p, () => (document.querySelector('.toast')?.textContent ?? '').includes('Tidied'), null, 10000)
    }
    const undoApplied = await sortHere(e)
    await e.evaluate(() => [...document.querySelectorAll('.toast button')].find((x) => x.textContent.includes('Undo'))?.click())
    const restored = await until(e, () => (document.querySelector('.toast')?.textContent ?? '').includes('Restored'), null, 10000)
    await until(e, () => !document.querySelector('.toast'), null, 8000)
    await sleep(1500)
    const undone = await e.evaluate(() => ({ rating: !!document.querySelector('[data-rating-prompt]'), win: localStorage.getItem('stackable:tidyWin') }))
    check('tidy rating: an Undo takes the milestone back, so no ask after its toast', undoApplied && restored && !undone.rating && undone.win === null, JSON.stringify({ undoApplied, restored, ...undone }))
    await control.evaluate(async () => {
      await chrome.storage.local.remove('freeTidy')
      await chrome.storage.sync.remove('freeTidy')
    })
    const kept = await sortHere(e)
    await sleep(2500) // past the 1.8 s a win waits
    const during = await e.evaluate(() => ({ toast: !!document.querySelector('.toast'), rating: !!document.querySelector('[data-rating-prompt]') }))
    const gAsked = await until(e, () => !document.querySelector('.toast') && !!document.querySelector('[data-rating-prompt]'), null, 16000)
    const gState = await e.evaluate(() => ({ win: localStorage.getItem('stackable:tidyWin'), stars: document.querySelectorAll('[data-rating-prompt] svg.lucide-star').length }))
    check(
      'tidy rating: after the first day an applied tidy brings the rating card once its toast, with Undo, has gone',
      kept && during.toast && !during.rating && gAsked && gState.win === null && gState.stars === 0,
      JSON.stringify({ kept, during, gAsked, ...gState }),
    )
    await e.evaluate(() => [...document.querySelectorAll('[data-rating-prompt] button')].find((x) => x.textContent.trim() === 'No thanks')?.click())
    await e.close()

    // 8. Settings > Copy from Chrome bookmarks is the same import, on a board that has spaces: the copy
    //    closes the dialog, then the mark shows on the new space (a second copy of the bar).
    await fresh()
    const f = await open()
    await f.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Settings')?.click())
    await until(f, (t) => [...document.querySelectorAll('[role=dialog] button')].some((x) => x.textContent.trim() === t), 'Copy from Chrome bookmarks')
    await f.evaluate((t) => [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === t)?.click(), 'Copy from Chrome bookmarks')
    const fOffer = await until(f, (t) => [...document.querySelectorAll('[role=dialog] button')].some((x) => x.textContent.trim() === t), 'Copy 23 links')
    await f.evaluate((t) => [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === t)?.click(), 'Copy 23 links')
    const fShown = await shownCoach(f)
    const fState = await f.evaluate(() => ({
      dialog: !!document.querySelector('[role=dialog]'),
      h1: document.querySelector('main h1')?.textContent,
      stacks: [...document.querySelectorAll('[data-stack-grid] [id^="stack-"] h3')].map((x) => x.textContent.trim()),
      kind: document.querySelector('[data-tidy-coach]')?.dataset.tidyCoach ?? null,
    }))
    check(
      'tidy coach: Settings > Copy from Chrome bookmarks is the same import: once the copy closes the dialog, the mark shows on the new space',
      fOffer && fShown && !fState.dialog && fState.h1 === 'Bookmarks bar' && fState.stacks.includes('Coach pile') && fState.kind === 'free',
      JSON.stringify({ fOffer, fShown, ...fState }),
    )
    await f.evaluate(() => document.querySelector('[data-tidy-coach-later]')?.click())
    await f.close()

    // 9. A company policy that answers late (0.9.6). stackable:managedDelayMs (unpacked builds only)
    //    makes the test policy answer 3 s after a page asks, as a slow managed storage can. The board
    //    paints anyway after its 1.5 s wait; the rating card and the coach mark wait for the answer and
    //    stay away under its locks; and the locks are kept, so the next paint hides locked buttons from
    //    its first frame.
    const late = (p, ms = 3000) => control.evaluate(async (p, ms) => {
      await chrome.storage.local.remove(['policyLocks', 'freeTidy', 'tidyReady'])
      await chrome.storage.sync.remove('freeTidy')
      localStorage.setItem('stackable:managedOverride', JSON.stringify(p))
      localStorage.setItem('stackable:managedDelayMs', String(ms))
    }, p, ms)
    // When the board painted (from the page's start), what it showed then, whether the rating card
    // showed at any point in the first 5 s, and what it shows after the answer.
    const lateBoard = async (p) => {
      const atPaint = await p.evaluate(() => ({
        at: Math.round(performance.getEntriesByName('sb:board')[0]?.startTime ?? -1),
        now: Math.round(performance.now()),
        exportButton: !!document.querySelector('[data-export-button]'),
        rating: !!document.querySelector('[data-rating-prompt]'),
      }))
      let rating = atPaint.rating
      while ((await p.evaluate(() => performance.now())) < 5000) {
        if (await p.evaluate(() => !!document.querySelector('[data-rating-prompt]'))) rating = true
        await sleep(100)
      }
      const after = await p.evaluate(() => ({ exportButton: !!document.querySelector('[data-export-button]'), tidy: !!document.querySelector('[data-tidy-button]'), calls: window.__tidyCalls.slice() }))
      return { atPaint, rating, after }
    }
    const LATE_LOCKS = { ai: true, rating: true, importExport: true }
    await late({ lock: LATE_LOCKS })
    await control.evaluate(() => {
      // The rating rule is met (30 new tabs over 5 days), so only the lock keeps the card away.
      localStorage.removeItem('stackable:rating')
      localStorage.setItem('stackable:opens', '30')
      localStorage.setItem('stackable:firstSeen', String(Date.now() - 5 * 86400000))
    })
    const g = await open()
    const gSeen = await lateBoard(g)
    await g.close()
    const keptLocks = await control.evaluate(async () => (await chrome.storage.local.get('policyLocks')).policyLocks ?? null)
    check(
      'late policy: the board paints before the policy answers, and the rating card never shows under its rating lock',
      gSeen.atPaint.at > 0 && gSeen.atPaint.at < 2600 && gSeen.atPaint.now < 3000 && !gSeen.rating,
      JSON.stringify(gSeen),
    )
    check(
      'late policy: the answer reaches the board when it lands (no Export, no Tidy), nothing asked the AI server, and the locks are kept for the next paint',
      gSeen.atPaint.exportButton && !gSeen.after.exportButton && !gSeen.after.tidy && !gSeen.after.calls.length && !!keptLocks && JSON.parse(keptLocks).ai && JSON.parse(keptLocks).rating && JSON.parse(keptLocks).importExport,
      JSON.stringify({ after: gSeen.after, keptLocks }),
    )
    // The same late policy, now kept from the last answer: locked buttons are gone from the first frame.
    const h = await open()
    const hSeen = await lateBoard(h)
    await h.close()
    check(
      'late policy: with the locks kept from the last answer, the next paint hides Export from its first frame, before the policy answers, and still no rating card',
      hSeen.atPaint.at > 0 && hSeen.atPaint.at < 2600 && hSeen.atPaint.now < 3000 && !hSeen.atPaint.exportButton && !hSeen.rating,
      JSON.stringify(hSeen),
    )
    // No policy at all: the same board does ask, so it was the lock that kept the card away.
    await control.evaluate(() => {
      localStorage.removeItem('stackable:managedOverride')
      localStorage.removeItem('stackable:managedDelayMs')
    })
    const ctl = await open()
    const ctlAsked = await until(ctl, () => !!document.querySelector('[data-rating-prompt]'), null, 6000)
    await ctl.evaluate(() => [...document.querySelectorAll('[data-rating-prompt] button')].find((x) => x.textContent.trim() === 'No thanks')?.click())
    await ctl.close()
    check('late policy: with no policy the same board asks for a rating, as its rule says', ctlAsked)

    // The coach mark: only the ai lock, nothing kept, and an import right after the board paints. The
    // policy answers 6 s late here, so the import lands well before it does (an import takes 1 to 2 s).
    await emptyBoard()
    await late({ lock: { ai: true } }, 6000)
    await control.evaluate(() => localStorage.removeItem('stackable:tidyCoach'))
    const lc = await open()
    await copyIn(lc)
    const landedAt = await lc.evaluate(() => Math.round(performance.now()))
    let coachSeen = false
    while ((await lc.evaluate(() => performance.now())) < 9000) {
      if (await lc.evaluate(() => !!document.querySelector('[data-tidy-coach]'))) coachSeen = true
      await sleep(150)
    }
    const lcState = await lc.evaluate(() => ({ calls: window.__tidyCalls.slice(), marker: localStorage.getItem('stackable:tidyCoach'), tidy: !!document.querySelector('[data-tidy-button]') }))
    await lc.close()
    check(
      'late policy: an import of 23 links that lands before the policy answers gets no coach mark under its ai lock, and nothing asks the AI server',
      landedAt < 6000 && !coachSeen && !lcState.calls.length && lcState.marker === null && !lcState.tidy,
      JSON.stringify({ landedAt, coachSeen, ...lcState }),
    )
    await control.evaluate(async () => {
      localStorage.removeItem('stackable:managedOverride')
      localStorage.removeItem('stackable:managedDelayMs')
      await chrome.storage.local.remove('policyLocks')
    })

    // Back as the block found it: the imported space and the pile go, the spaces come home in order.
    await control.evaluate(async (s) => {
      for (const k of await chrome.bookmarks.getChildren(s.held.root)) await chrome.bookmarks.removeTree(k.id)
      for (const k of await chrome.bookmarks.getChildren(s.held.hold)) await chrome.bookmarks.move(k.id, { parentId: s.held.root })
      await chrome.bookmarks.removeTree(s.held.hold)
      await chrome.bookmarks.removeTree(s.pile)
      // The license first, as above.
      await chrome.storage.local.remove(s.local)
      await chrome.storage.sync.remove(s.sync)
      if (Object.keys(s.was.local).length) await chrome.storage.local.set(s.was.local)
      if (Object.keys(s.was.sync).length) await chrome.storage.sync.set(s.was.sync)
      for (const [k, v] of Object.entries(s.was.ls)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
    }, { held, pile, was, sync: SYNC, local: LOCAL })
    await sleep(400)
  }

  // ---------- 0.7.0: auto-archive (Pro) ----------
  // The service worker saves idle web tabs into today's "Archived" stack, first in the Stash
  // space, and closes them; the tab on screen, pinned tabs and browser pages stay. A 1 ms limit
  // stands in for 12 hours. Last in the suite, since every idle web tab in every window goes.
  {
    // 0.8.0: tab switches are recorded only while auto-archive is on (tabSeen.ts).
    const sessionRecord = () => control.evaluate(async () => (await chrome.storage.session.get('tabSeen')).tabSeen ?? null)
    await control.evaluate(() => chrome.storage.sync.remove('proArchive'))
    await sleep(400)
    await control.evaluate(async () => {
      const t = await chrome.tabs.create({ url: 'about:blank', active: true })
      await chrome.tabs.update(t.id, { active: true })
      await chrome.tabs.remove(t.id)
    })
    await sleep(400)
    check('archive: with auto-archive off, tab switches leave no record', (await sessionRecord()) === null)
    const onAt = Date.now()
    await control.evaluate(() => chrome.storage.sync.set({ proArchive: { afterMs: 6 * 3600000 } }))
    let rec = null
    for (let t = 0; t < 20 && !rec; t++) {
      await sleep(150)
      rec = await sessionRecord()
    }
    check('archive: switching auto-archive on starts a fresh record', !!rec && rec.since >= onAt - 1000, JSON.stringify(rec && { since: rec.since - onAt }))
    const arc = await control.evaluate(async () => {
      const w = await chrome.windows.create({ url: ['https://example.com/?arc=1', 'https://example.org/?arc=2', 'https://example.net/?arc=3', 'about:blank'], focused: true })
      const tabs = await chrome.tabs.query({ windowId: w.id })
      for (const t of tabs) await chrome.tabs.update(t.id, { active: true })
      await chrome.tabs.update(tabs[2].id, { pinned: true })
      return { windowId: w.id }
    })
    await sleep(400)
    // 3 Nov fix: the worker records when each tab was left (lastAccessed only moves on arrival).
    const seen = await control.evaluate(async (windowId) => {
      const s = (await chrome.storage.session.get('tabSeen')).tabSeen
      const ids = (await chrome.tabs.query({ windowId })).filter((t) => !t.active).map((t) => t.id)
      return { since: typeof s?.since === 'number', left: ids.filter((id) => typeof s?.left?.[id] === 'number').length, of: ids.length }
    }, arc.windowId)
    check('archive: the worker records when each tab was left', seen.since && seen.left === seen.of && seen.of >= 3, JSON.stringify(seen))
    await control.evaluate(() => chrome.storage.local.remove('archiveRanAt'))
    const first = await askWorker(control, { type: 'archive', afterMs: 1 })
    const second = await askWorker(control, { type: 'archive', afterMs: 1 })
    await sleep(300)
    const after = await control.evaluate(async (windowId) => {
      const root = (await chrome.bookmarks.getChildren('2')).find((k) => k.title === 'Stackboard' && !k.url)
      const [sub] = await chrome.bookmarks.getSubTree(root.id)
      const space = sub.children.find((c) => c.title === '📥 Stash')
      const stack = space?.children.find((st) => st.title.startsWith('Archived '))
      const left = (await chrome.tabs.query({ windowId })).map((t) => (t.pinned ? 'pinned' : t.pendingUrl || t.url))
      return { links: stack ? stack.children.map((b) => b.url) : null, index: stack ? space.children.indexOf(stack) : -1, left }
    }, arc.windowId)
    check('archive: idle web tabs land in a dated stack, first in Stash', after.index === 0 && ['https://example.com/?arc=1', 'https://example.org/?arc=2'].every((u) => after.links?.includes(u)), JSON.stringify(after))
    check('archive: the tab on screen and pinned tabs stay open', after.left.length === 2 && after.left.includes('pinned') && after.left.includes('about:blank'), JSON.stringify(after.left))
    check('archive: a second ask inside 15 minutes does nothing', first?.archived >= 2 && second?.archived === 0, `${JSON.stringify(first)} ${JSON.stringify(second)}`)
    await control.evaluate((w) => chrome.windows.remove(w), arc.windowId).catch(() => {})
    await control.evaluate(() => chrome.storage.sync.remove('proArchive'))
    let gone = false
    for (let t = 0; t < 20 && !gone; t++) {
      await sleep(150)
      gone = (await sessionRecord()) === null
    }
    check('archive: switching auto-archive off drops the record', gone)
  }
} catch (e) {
  console.log('ERROR', e.message)
  results.push({ name: 'script error', ok: false })
} finally {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (errors.length) console.log('Page errors:\n  ' + [...new Set(errors)].join('\n  '))
  await browser.close()
}
