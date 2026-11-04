// How a Chrome bookmark folder becomes a Stackboard space (0.4.0 first-run import).
// Pure, with no chrome.* calls, so the mapping is unit-tested and the welcome screen can
// preview the result before anything is written.
//
// The rule: the folder becomes one space. Links sitting directly in it become the first
// stack; every folder directly below it that holds links (at any depth) becomes a stack, and
// the folders inside that one stay folders inside the stack (0.8.0; they used to become stacks
// named by their path, "Work › Clients", which company ManagedBookmarks still do: `nest: false`).
// Empty folders disappear. Bookmarklets and browser-internal pages are skipped: a new tab page
// can't open them, so they stay where they are.

export interface PlannedLink {
  title: string
  url: string
}

/** A folder inside a planned stack, with the folders inside it (0.8.0). */
export interface PlannedFolder {
  title: string
  links: PlannedLink[]
  folders: PlannedFolder[]
}

export interface PlannedStack {
  title: string
  links: PlannedLink[]
  /** Folders inside the stack, nested, after its links (0.8.0). */
  folders?: PlannedFolder[]
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

/**
 * `nest: false` keeps the pre-0.8.0 mapping: every folder below the source that holds links becomes
 * a stack named by its path ("Work › Clients"), and no stack has folders. Company ManagedBookmarks
 * use it, since the board builder writes each company space as a folder there.
 */
export function planFolder(
  folder: FolderNode,
  opts: { name: string; emoji: string; looseTitle: string; exclude?: ReadonlySet<string>; nest?: boolean },
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

  // A folder with its links and the folders inside it; null when nothing below it is a link.
  const plan = (node: FolderNode): PlannedFolder | null => {
    const own = ownLinks(node)
    const folders = subfolders(node)
      .map(plan)
      .filter((f): f is PlannedFolder => !!f)
    if (!own.length && !folders.length) return null
    return { title: node.title.trim() || 'Untitled', links: own, folders }
  }

  // The pre-0.8.0 walk: a stack per folder that holds links, named by its path.
  const walk = (node: FolderNode, path: string[]) => {
    const own = ownLinks(node)
    if (own.length) stacks.push({ title: path.join(PATH_SEPARATOR), links: own })
    for (const sub of subfolders(node)) walk(sub, [...path, sub.title.trim() || 'Untitled'])
  }

  const loose = ownLinks(folder)
  if (loose.length) stacks.push({ title: opts.looseTitle, links: loose })
  for (const sub of subfolders(folder)) {
    if (opts.nest === false) {
      walk(sub, [sub.title.trim() || 'Untitled'])
      continue
    }
    const f = plan(sub)
    if (f) stacks.push({ title: f.title, links: f.links, ...(f.folders.length ? { folders: f.folders } : {}) })
  }

  return { space: { name: opts.name, emoji: opts.emoji, stacks }, links, skipped }
}

/** How many links and folders planned folders hold, counting the folders themselves, at any depth. */
export function countPlannedFolders(folders: readonly PlannedFolder[] = []): { links: number; folders: number } {
  return folders.reduce(
    (n, f) => {
      const inner = countPlannedFolders(f.folders)
      return { links: n.links + f.links.length + inner.links, folders: n.folders + 1 + inner.folders }
    },
    { links: 0, folders: 0 },
  )
}

export function countPlanned(space: PlannedSpace): number {
  return space.stacks.reduce((n, s) => n + s.links.length + countPlannedFolders(s.folders).links, 0)
}

/** "1 link", "42 links" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
