import { decodeShare } from './sharePlan'
import { PENDING_MAX, PENDING_MS, PENDING_PREFIX, type PendingShare } from './share'
import { readCompany } from './company'

// Share a stack as a link (0.8.0, T4), service-worker side. getstackboard.com/s can reach the
// extension because the manifest lists it under externally_connectable; nothing else can. The
// page may ask three things: are you there, add this stack, open these links. "Add" never
// writes a bookmark: it parks the checked stack and opens a Stackboard tab that asks first.

export const SHARE_ORIGIN = 'https://getstackboard.com'
const SHARE_PAGE_RE = /^https:\/\/getstackboard\.com\/s(?:[/?#]|$)/
/** Tabs "Open all" will open for one shared stack. */
export const MAX_OPEN = 100
/** One add or open per page every couple of seconds: a stuck button can't flood the window. */
const GAP_MS = 2000

let lastAt = 0

type Reply = (r: unknown) => void

function busy(): boolean {
  const now = Date.now()
  if (now - lastAt < GAP_MS) return true
  lastAt = now
  return false
}

function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20)
}

/**
 * Drops parked stacks that expired, and keeps room for one more: at most PENDING_MAX wait at a
 * time, the newest kept, so a page can't fill session storage.
 */
async function dropStale(now: number): Promise<void> {
  const all = await chrome.storage.session.get(null)
  const parked = Object.entries(all).filter(([k]) => k.startsWith(PENDING_PREFIX)) as [string, PendingShare | undefined][]
  const old = parked.filter(([, v]) => !v?.at || now - v.at > PENDING_MS).map(([k]) => k)
  const live = parked.filter(([k]) => !old.includes(k)).sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0))
  const over = live.slice(PENDING_MAX - 1).map(([k]) => k)
  if (old.length || over.length) await chrome.storage.session.remove([...old, ...over])
}

/** Teams T8: a company that locks import and export also turns off adding shared stacks. */
async function addLocked(): Promise<boolean> {
  const company = await readCompany().catch(() => null)
  return !!company?.config.lock.importExport
}

async function add(data: string, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; reason?: string }> {
  if (busy()) return { ok: false, reason: 'busy' }
  if (await addLocked()) return { ok: false, reason: 'locked' }
  const stack = await decodeShare(data)
  if (!stack) return { ok: false, reason: 'invalid' }
  const now = Date.now()
  await dropStale(now).catch(() => {})
  const id = randomId()
  const parked: PendingShare = { stack, at: now }
  await chrome.storage.session.set({ [PENDING_PREFIX + id]: parked })
  const tab = sender.tab
  await chrome.tabs.create({
    url: `${chrome.runtime.getURL('newtab.html')}#share=${id}`,
    active: true,
    ...(tab?.windowId !== undefined ? { windowId: tab.windowId } : {}),
    ...(typeof tab?.index === 'number' ? { index: tab.index + 1 } : {}),
  })
  return { ok: true }
}

async function open(data: string, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; opened?: number; reason?: string }> {
  if (busy()) return { ok: false, reason: 'busy' }
  const stack = await decodeShare(data)
  if (!stack) return { ok: false, reason: 'invalid' }
  const links = stack.links.slice(0, MAX_OPEN)
  const tab = sender.tab
  const ids: number[] = []
  for (let i = 0; i < links.length; i++) {
    const t = await chrome.tabs.create({
      url: links[i].url,
      active: false,
      ...(tab?.windowId !== undefined ? { windowId: tab.windowId } : {}),
      ...(typeof tab?.index === 'number' ? { index: tab.index + 1 + i } : {}),
    })
    if (typeof t.id === 'number') ids.push(t.id)
  }
  if (ids.length && chrome.tabs.group) {
    try {
      const groupId = await chrome.tabs.group({ tabIds: ids })
      await chrome.tabGroups?.update(groupId, { title: stack.title, collapsed: false })
    } catch {
      // grouping is a nicety; the tabs are open either way
    }
  }
  return { ok: true, opened: ids.length }
}

/**
 * chrome.runtime.onMessageExternal: only the share page, open as a page of its own (a tab's top
 * frame, never inside another site's frame), and only these three messages.
 */
export function onShareMessage(msg: unknown, sender: chrome.runtime.MessageSender, reply: Reply): boolean | undefined {
  if (sender.origin !== SHARE_ORIGIN || !SHARE_PAGE_RE.test(sender.url ?? '')) return undefined
  if (!sender.tab || sender.frameId !== 0) return undefined
  const m = (msg && typeof msg === 'object' ? msg : {}) as { type?: unknown; data?: unknown }
  if (m.type === 'ping') {
    reply({ ok: true, version: chrome.runtime.getManifest().version })
    return undefined
  }
  if ((m.type === 'add' || m.type === 'open') && typeof m.data === 'string' && m.data.length <= 20000) {
    const run = m.type === 'add' ? add : open
    run(m.data, sender).then(reply, () => reply({ ok: false, reason: 'error' }))
    return true // the reply comes later
  }
  return undefined
}
