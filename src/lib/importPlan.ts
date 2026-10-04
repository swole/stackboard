// How a Chrome bookmark folder becomes a Stackboard space (0.4.0 first-run import).
// Pure, with no chrome.* calls, so the mapping is unit-tested and the welcome screen can
// preview the result before anything is written.
//
// The rule: the folder becomes one space. Links sitting directly in it become the first
// stack; every folder below it that holds links becomes a stack named by its path
// ("Work › Clients"). Empty folders disappear. Bookmarklets and browser-internal pages are
// skipped: a new tab page can't open them, so they stay where they are.

export interface PlannedLink {
  title: string
  url: string
}

export interface PlannedStack {
  title: string
  links: PlannedLink[]
}

export interface PlannedSpace {
  name: string
  emoji: string
  stacks: PlannedStack[]
}

/** The slice of chrome.bookmarks.BookmarkTreeNode the planner reads. */
export interface FolderNode {
  id: string
  title: string
  url?: string
  children?: FolderNode[]
}

export interface Plan {
  space: PlannedSpace
  links: number
  skipped: number
}

export const PATH_SEPARATOR = ' › '

export function isImportableUrl(url: string): boolean {
  return /^https?:\/\/[^/\s]/i.test(url.trim())
}

export function planFolder(
  folder: FolderNode,
  opts: { name: string; emoji: string; looseTitle: string; exclude?: ReadonlySet<string> },
): Plan {
  const stacks: PlannedStack[] = []
  let links = 0
  let skipped = 0

  const ownLinks = (node: FolderNode): PlannedLink[] => {
    const out: PlannedLink[] = []
    for (const child of node.children ?? []) {
      if (!child.url) continue
      if (!isImportableUrl(child.url)) {
        skipped++
        continue
      }
      out.push({ title: child.title.trim() || child.url, url: child.url })
    }
    links += out.length
    return out
  }

  const subfolders = (node: FolderNode) =>
    (node.children ?? []).filter((c) => !c.url && !opts.exclude?.has(c.id))

  const walk = (node: FolderNode, path: string[]) => {
    const own = ownLinks(node)
    if (own.length) stacks.push({ title: path.join(PATH_SEPARATOR), links: own })
    for (const sub of subfolders(node)) walk(sub, [...path, sub.title.trim() || 'Untitled'])
  }

  const loose = ownLinks(folder)
  if (loose.length) stacks.push({ title: opts.looseTitle, links: loose })
  for (const sub of subfolders(folder)) walk(sub, [sub.title.trim() || 'Untitled'])

  return { space: { name: opts.name, emoji: opts.emoji, stacks }, links, skipped }
}

export function countPlanned(space: PlannedSpace): number {
  return space.stacks.reduce((n, s) => n + s.links.length, 0)
}

/** "1 link", "42 links" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
