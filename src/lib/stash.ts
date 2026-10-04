import { buildSpaceTitle } from './icon'
import { ensureRoot } from './bookmarks'
import { planStash, stashLabel, type StashPlan } from './stashPlan'

// "Stash this window" (0.4.0): save every tab into stacks in a "📥 Stash" space, newest first,
// then optionally close them. Runs from the popup and from the keyboard shortcut (background.ts).

export const STASH_SPACE_TITLE = buildSpaceTitle('📥', 'Stash')
/** A new tab reads this once to open on the Stash space and say what happened. */
export const OPEN_SPACE_KEY = 'stackboardOpenSpace'

export interface OpenSpaceNote {
  spaceId: string
  saved: number
  at: number
}

export async function planWindow(windowId: number): Promise<StashPlan> {
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
  return planStash(tabs, titles, stashLabel())
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
  let index = 0
  for (const stack of plan.stacks) {
    const folder = await chrome.bookmarks.create({ parentId: spaceId, index: index++, title: stack.title })
    for (const link of stack.links) {
      await chrome.bookmarks.create({ parentId: folder.id, title: link.title, url: link.url })
    }
  }

  if (!opts.close) return { saved: plan.links, closed: 0 }
  const note: OpenSpaceNote = { spaceId, saved: plan.links, at: Date.now() }
  await chrome.storage.local.set({ [OPEN_SPACE_KEY]: note })
  await chrome.tabs.create({ windowId, active: true })
  await chrome.tabs.remove(plan.tabIds)
  return { saved: plan.links, closed: plan.tabIds.length }
}

/** For a freshly opened new tab: the stash it should show, if one just happened. */
export async function takeOpenSpaceNote(now = Date.now()): Promise<OpenSpaceNote | null> {
  const got = await chrome.storage.local.get(OPEN_SPACE_KEY)
  const note = got[OPEN_SPACE_KEY] as OpenSpaceNote | undefined
  if (!note) return null
  await chrome.storage.local.remove(OPEN_SPACE_KEY)
  return now - note.at < 60_000 ? note : null
}
