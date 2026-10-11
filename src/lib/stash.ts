import { buildSpaceTitle } from './icon'
import { ensureRoot } from './bookmarks'
import { bankruptcyStackTitle, planStash, stashLabel, type Bankruptcy, type StashPlan } from './stashPlan'

// "Stash this window" (0.4.0): save every tab into stacks in a "📥 Stash" space, newest first,
// then optionally close them. Runs from the popup and from the keyboard shortcut (background.ts).

export const STASH_SPACE_TITLE = buildSpaceTitle('📥', 'Stash')
/** A new tab reads this once to open on the Stash space and say what happened. */
export const OPEN_SPACE_KEY = 'stackboardOpenSpace'

export interface OpenSpaceNote {
  spaceId: string
  saved: number
  at: number
  /** set by "Declare tab bankruptcy": the new tab shows the certificate */
  bankruptcy?: Bankruptcy
}

export async function planWindow(windowId: number, label = stashLabel()): Promise<StashPlan> {
  const tabs = await chrome.tabs.query({ windowId })
  const groupIds = [...new Set(tabs.map((t) => t.groupId).filter((g): g is number => typeof g === 'number' && g >= 0))]
  const titles = new Map<number, string>()
  if (chrome.tabGroups?.get) {
    for (const id of groupIds) {
      try {
        titles.set(id, (await chrome.tabGroups.get(id)).title ?? '')
      } catch {
        // the group closed meanwhile: its tabs fall back to "Tab group"
      }
    }
  }
  return planStash(tabs, titles, label)
}

/** Every normal window's plan, last-focused window first, for "Declare tab bankruptcy". */
export async function planAllWindows(): Promise<{ windowId: number; plan: StashPlan }[]> {
  const focused = await chrome.windows.getLastFocused().catch(() => null)
  const wins = (await chrome.windows.getAll({ windowTypes: ['normal'] })).filter((w) => typeof w.id === 'number')
  wins.sort((a, b) => Number(b.id === focused?.id) - Number(a.id === focused?.id))
  const label = `Tab bankruptcy ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date())}`
  const out: { windowId: number; plan: StashPlan }[] = []
  for (const w of wins) {
    const plan = await planWindow(w.id!, bankruptcyStackTitle(label, out.length))
    if (plan.links) out.push({ windowId: w.id!, plan })
  }
  return out
}

async function saveStacks(spaceId: string, plans: StashPlan[]): Promise<void> {
  let index = 0
  for (const plan of plans) {
    for (const stack of plan.stacks) {
      const folder = await chrome.bookmarks.create({ parentId: spaceId, index: index++, title: stack.title })
      for (const link of stack.links) {
        await chrome.bookmarks.create({ parentId: folder.id, title: link.title, url: link.url })
      }
    }
  }
}

async function stashSpaceId(): Promise<string> {
  const rootId = await ensureRoot()
  const kids = await chrome.bookmarks.getChildren(rootId)
  const found = kids.find((k) => !k.url && k.title === STASH_SPACE_TITLE)
  if (found) return found.id
  return (await chrome.bookmarks.create({ parentId: rootId, title: STASH_SPACE_TITLE })).id
}

/**
 * Saves the window's tabs into the Stash space. With `close`, opens a new tab on the Stash space
 * first (so the window survives) and then closes the saved tabs.
 */
export async function stashWindow(windowId: number, opts: { close: boolean }): Promise<{ saved: number; closed: number }> {
  const plan = await planWindow(windowId)
  if (!plan.links) return { saved: 0, closed: 0 }

  const spaceId = await stashSpaceId()
  await saveStacks(spaceId, [plan])

  if (!opts.close) return { saved: plan.links, closed: 0 }
  const note: OpenSpaceNote = { spaceId, saved: plan.links, at: Date.now() }
  await chrome.storage.local.set({ [OPEN_SPACE_KEY]: note })
  await chrome.tabs.create({ windowId, active: true })
  await chrome.tabs.remove(plan.tabIds)
  return { saved: plan.links, closed: plan.tabIds.length }
}

/**
 * "Declare tab bankruptcy" (0.5.1): every tab in every window into the Stash space, then all of
 * them close and one new tab opens on the certificate. Pinned tabs and browser pages stay.
 */
export async function declareBankruptcy(): Promise<Bankruptcy | null> {
  const all = await planAllWindows()
  const tabIds = all.flatMap((w) => w.plan.tabIds)
  if (!tabIds.length) return null
  const spaceId = await stashSpaceId()
  await saveStacks(spaceId, all.map((w) => w.plan))
  const saved = all.reduce((n, w) => n + w.plan.links, 0)
  const bankruptcy: Bankruptcy = { tabs: tabIds.length, windows: all.length, saved, at: Date.now() }
  const note: OpenSpaceNote = { spaceId, saved, at: bankruptcy.at, bankruptcy }
  await chrome.storage.local.set({ [OPEN_SPACE_KEY]: note })
  await chrome.tabs.create({ windowId: all[0].windowId, active: true })
  await chrome.tabs.remove(tabIds)
  return bankruptcy
}

/** For a freshly opened new tab: the stash it should show, if one just happened. */
export async function takeOpenSpaceNote(now = Date.now()): Promise<OpenSpaceNote | null> {
  const got = await chrome.storage.local.get(OPEN_SPACE_KEY)
  const note = got[OPEN_SPACE_KEY] as OpenSpaceNote | undefined
  if (!note) return null
  await chrome.storage.local.remove(OPEN_SPACE_KEY)
  return now - note.at < 60_000 ? note : null
}
