import { isImportableUrl, type PlannedStack } from './importPlan'

// "Stash this window" (0.4.0): which tabs get saved, and how they group into stacks. Pure, so
// it is unit-tested and the popup can show counts before anything happens.
//
// Pinned tabs stay (people pin what they always want open). Browser pages (chrome://, the new
// tab page, extension pages) can't be bookmarked, so they stay too. Each Chrome tab group becomes
// its own stack under the group's name; the loose tabs share one stack. Stacks follow the tab
// strip's order, and a URL open twice is saved once.

export interface TabLike {
  id?: number
  url?: string
  /** Where a tab that's still loading is headed; its url is empty until the page commits (0.4.1). */
  pendingUrl?: string
  title?: string
  pinned?: boolean
  /** -1 (chrome.tabGroups.TAB_GROUP_ID_NONE) when the tab isn't in a group */
  groupId?: number
}

export interface StashPlan {
  stacks: PlannedStack[]
  /** every tab whose page ends up saved, duplicates included: these are the ones to close */
  tabIds: number[]
  links: number
  skipped: number
  pinned: number
}

export function planStash(tabs: TabLike[], groupTitles: ReadonlyMap<number, string>, looseTitle: string): StashPlan {
  const stacks = new Map<string, PlannedStack & { seen: Set<string> }>()
  const tabIds: number[] = []
  let skipped = 0
  let pinned = 0
  let links = 0

  for (const tab of tabs) {
    if (tab.pinned) {
      pinned++
      continue
    }
    const url = tab.url || tab.pendingUrl || ''
    if (!isImportableUrl(url)) {
      skipped++
      continue
    }
    const grouped = typeof tab.groupId === 'number' && tab.groupId >= 0
    const key = grouped ? `g${tab.groupId}` : 'loose'
    let stack = stacks.get(key)
    if (!stack) {
      const title = grouped ? (groupTitles.get(tab.groupId!) ?? '').trim() || 'Tab group' : looseTitle
      stack = { title, links: [], seen: new Set() }
      stacks.set(key, stack)
    }
    if (typeof tab.id === 'number') tabIds.push(tab.id)
    if (stack.seen.has(url)) continue
    stack.seen.add(url)
    stack.links.push({ title: (tab.title ?? '').trim() || url, url })
    links++
  }

  return {
    stacks: [...stacks.values()].map(({ title, links: l }) => ({ title, links: l })),
    tabIds,
    links,
    skipped,
    pinned,
  }
}

/** "Stashed Sep 27, 11:42 PM" in the browser's locale. */
export function stashLabel(now = new Date()): string {
  const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(now)
  return `Stashed ${when}`
}
