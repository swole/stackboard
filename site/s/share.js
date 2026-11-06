// getstackboard.com/s: shows a stack someone shared from Stackboard (0.8.0, T4). The stack is in
// the hash, decoded here and never sent anywhere. Shared text only ever goes in via textContent.
import { decodeShare, hostOf, monogram } from './share-core.js'

// Tests put the unpacked build's id here; everyone else talks to the store build.
const EXT_ID = window.__STACKBOARD_EXT_ID || 'bgcedhchngcopaefchpkbhioagknnpma'
const ASK_ABOVE = 10
const MAX_OPEN = 100

const $ = (id) => document.getElementById(id)
const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

let stack = null
// The hash that produced the stack on screen. Add and Open all send this, never location.hash read
// again at click time, so what Stackboard receives is exactly what the page showed.
let shownData = ''
let loads = 0
let extension = false
let armed = false
let armTimer = 0

function say(text, bad = false) {
  $('status').textContent = text
  $('status').classList.toggle('bad', bad)
}

function ask(message) {
  return new Promise((resolve) => {
    try {
      window.chrome.runtime.sendMessage(EXT_ID, message, (reply) => {
        void window.chrome.runtime.lastError // read it so Chrome doesn't log "unchecked"
        resolve(reply || null)
      })
    } catch {
      resolve(null)
    }
  })
}

function render() {
  const n = stack.links.length
  document.title = `${stack.title} | Shared stack | Stackboard`
  $('title').textContent = stack.title
  $('count').textContent = n === 1 ? '1 link' : `${n} links`
  const list = $('links')
  list.replaceChildren()
  for (const l of stack.links) {
    const li = el('li')
    li.append(el('span', 'mono', monogram(l.url)))
    const body = el('div')
    const a = el('a', 't', l.title)
    a.href = l.url
    a.target = '_blank'
    a.rel = 'noopener noreferrer nofollow'
    a.title = l.url
    body.append(a, el('span', 'h', hostOf(l.url)))
    li.append(body)
    list.append(li)
  }
  $('actions').hidden = false
  $('fine').hidden = false
  $('open').textContent = 'Open all'
}

function broken() {
  $('title').textContent = "This link doesn't hold a stack"
  $('count').textContent = 'It may have been cut short when it was copied. Ask for the link again.'
  $('links').replaceChildren()
  $('actions').hidden = false
  $('add').hidden = true
  $('open').hidden = true
}

async function load() {
  armed = false
  const run = ++loads
  const data = location.hash.slice(1)
  const decoded = await decodeShare(data)
  if (run !== loads) return // the hash changed again while this one decoded
  stack = decoded
  shownData = decoded ? data : ''
  say('')
  if (!stack) return broken()
  $('open').hidden = false
  render()
  if (!window.chrome?.runtime?.sendMessage) return
  const pong = await ask({ type: 'ping' })
  extension = !!pong?.ok
  $('add').hidden = !extension
  $('get').hidden = extension
}

$('add').addEventListener('click', async () => {
  if (!stack || !shownData) return
  $('add').disabled = true
  const r = await ask({ type: 'add', data: shownData })
  $('add').disabled = false
  if (r?.ok) say('Stackboard opened a new tab. Pick a space there and press Add.')
  else if (r?.reason === 'busy') say('One moment, then try again.')
  else if (r?.reason === 'locked') say('Your company manages this: adding shared stacks is turned off on this computer.', true)
  else say("Stackboard couldn't take this stack. Try opening the link again.", true)
})

$('open').addEventListener('click', async () => {
  if (!stack) return
  const n = Math.min(stack.links.length, MAX_OPEN)
  if (n > ASK_ABOVE && !armed) {
    armed = true
    $('open').textContent = `Open ${n} tabs?`
    $('open').classList.add('armed')
    clearTimeout(armTimer)
    armTimer = setTimeout(() => {
      armed = false
      $('open').textContent = 'Open all'
      $('open').classList.remove('armed')
    }, 4000)
    return
  }
  armed = false
  clearTimeout(armTimer)
  $('open').textContent = 'Open all'
  $('open').classList.remove('armed')
  if (extension) {
    const r = await ask({ type: 'open', data: shownData })
    if (r?.ok) {
      say(r.opened < stack.links.length ? `Opened the first ${r.opened} links.` : `Opened ${r.opened === 1 ? '1 link' : `${r.opened} links`}.`)
      return
    }
  }
  // Without Stackboard the browser decides: most allow one new tab per click and block the rest.
  // The page's referrer policy already keeps this address out of the new tabs' requests.
  let blocked = 0
  for (const l of stack.links.slice(0, n)) {
    const w = window.open(l.url, '_blank')
    if (w) w.opener = null
    else blocked++
  }
  if (blocked) say(`Your browser blocked ${blocked === 1 ? '1 tab' : `${blocked} tabs`}. Allow pop-ups for this page, or open the links one by one.`)
})

window.addEventListener('hashchange', () => void load())
void load()
