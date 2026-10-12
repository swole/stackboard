import { isImportableUrl, plural, type PlannedLink, type PlannedStack } from './importPlan'

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

// "Save N selected tabs" (0.5.2, C1): the tabs highlighted in the tab strip (Ctrl/Shift+click)
// go into one stack the popup's picker chooses. Unlike a stash, a pinned tab someone selected is
// saved too. Browser pages are skipped and a URL selected twice is saved once, in strip order.

export interface SelectionPlan {
  links: PlannedLink[]
  skipped: number
}

export function planSelected(tabs: TabLike[]): SelectionPlan {
  const seen = new Set<string>()
  const links: PlannedLink[] = []
  let skipped = 0
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || ''
    if (!isImportableUrl(url)) {
      skipped++
      continue
    }
    if (seen.has(url)) continue
    seen.add(url)
    links.push({ title: (tab.title ?? '').trim() || url, url })
  }
  return { links, skipped }
}

/** "Stashed Sep 27, 11:42 PM" in the browser's locale. */
export function stashLabel(now = new Date()): string {
  const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(now)
  return `Stashed ${when}`
}

/** The popup's "... stay open." note; "1 browser page stays open" took the plural verb before 0.4.3. */
export function staysNote(pinned: number, skipped: number): string {
  const parts = [pinned ? plural(pinned, 'pinned tab') : '', skipped ? plural(skipped, 'browser page') : ''].filter(Boolean)
  if (!parts.length) return ''
  return `${parts.join(' and ')} ${pinned + skipped === 1 ? 'stays' : 'stay'} open.`
}

// "Tab bankruptcy" (0.5.1, G2): stash every tab in every window at once, then hand out a
// certificate. The numbers and wording live here so they're unit-tested.

export interface Bankruptcy {
  /** tabs closed (duplicates included: each one was open) */
  tabs: number
  windows: number
  /** links saved after de-duplication */
  saved: number
  at: number
}

/** The window's loose-tab stack name: the first window keeps the plain label, later ones get a number. */
export function bankruptcyStackTitle(label: string, windowIndex: number): string {
  return windowIndex === 0 ? label : `${label} (window ${windowIndex + 1})`
}

export interface Certificate {
  headline: string
  detail: string
  /** a short line for the share text and the alt text */
  share: string
}

export function certificateText(b: Bankruptcy): Certificate {
  const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(b.at))
  const headline = `${plural(b.tabs, 'tab')} discharged`
  const where = b.windows > 1 ? ` across ${plural(b.windows, 'window')}` : ''
  const detail = `${date}${where}. All ${plural(b.saved, 'link')} saved as bookmarks.`
  const share = `I declared tab bankruptcy: ${plural(b.tabs, 'tab')} discharged${where}. Nothing lost, all saved as bookmarks.`
  return { headline, detail, share }
}
