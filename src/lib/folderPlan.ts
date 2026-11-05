import type { BackupFolder, Bookmark, BookmarkBackup, Folder, Space, Stack, StackableTree } from './types'
import { parseSpaceTitle } from './icon'
import { batchFlags } from './fresh'
import { todoIdFromUrl } from './todoPlan'
import { STACK_MARKER_TITLE, isStackMarker, parseStackColor, stackColorIn, stackColorUrl } from './stackStylePlan'
import { plural } from './importPlan'

// Nested folders (0.8.0): a folder inside a stack folder shows inside the stack card as a foldable
// section, at any depth. Pure, so tests/unit.test.ts covers the mapping from Chrome's bookmark
// tree, the walks that every count, search and open-all go through, the move index and the backup
// round trip. The chrome.* side stays in bookmarks.ts.
//
// The mapping, the move index and the walks follow tokyo51's nested stacks in their MIT fork,
// github.com/tokyo51/stackboard-brave (c61af27, 2026-10-12).

/** The parts of a chrome.bookmarks node the board reads; the unit tests build these by hand. */
export interface TreeNode {
  id: string
  title: string
  url?: string
  index?: number
  dateAdded?: number
  children?: TreeNode[]
}

/** A stack or a folder inside one: anything that holds links. */
export type Container = Stack | Folder

const byIndex = (a: TreeNode, b: TreeNode) => (a.index ?? 0) - (b.index ?? 0)
const isFolder = (n: TreeNode) => !n.url

/** A folder's links in order, each with its index among all the folder's children. To-do and colour markers aren't links. */
function linksIn(node: TreeNode): Bookmark[] {
  const sorted = (node.children ?? []).filter((c) => !!c.url && !todoIdFromUrl(c.url) && !isStackMarker(c.url)).sort(byIndex)
  const batch = batchFlags(sorted.map((b) => b.dateAdded))
  return sorted.map((b, i) => ({
    id: b.id,
    title: b.title || b.url || 'Untitled',
    url: b.url!,
    parentStackId: node.id,
    index: b.index,
    dateAdded: b.dateAdded,
    batch: batch[i],
  }))
}

/** Every to-do marker below a node, however deep: a list can be moved inside another stack. */
function markersIn(node: TreeNode): string[] {
  return (node.children ?? []).flatMap((c) => {
    if (!c.url) return markersIn(c)
    const id = todoIdFromUrl(c.url)
    return id ? [id] : []
  })
}

function foldersIn(node: TreeNode): Folder[] {
  return (node.children ?? [])
    .filter(isFolder)
    .sort(byIndex)
    .map((f) => ({ id: f.id, title: f.title, parentId: node.id, bookmarks: linksIn(f), folders: foldersIn(f) }))
}

/**
 * The Stackboard root folder as the board: space folders, the stack folders in them, and every
 * folder below a stack as a folder inside it. Links straight in the root or in a space folder have
 * no stack and are left out.
 */
export function mapTree(root: TreeNode): StackableTree {
  const spaces: Space[] = (root.children ?? [])
    .filter(isFolder)
    .sort(byIndex)
    .map((spaceNode) => {
      const parsed = parseSpaceTitle(spaceNode.title)
      const stacks = (spaceNode.children ?? [])
        .filter(isFolder)
        .sort(byIndex)
        .map((stackNode): Stack => {
          // A to-do stack is a folder holding a marker bookmark; its items live in storage.sync.
          const marker = (stackNode.children ?? []).find((c) => todoIdFromUrl(c.url))
          // 0.9.0: a colour marker gives the stack its tab-group colour (stackStylePlan.ts).
          const color = stackColorIn(stackNode.children)
          if (marker) {
            return {
              id: stackNode.id,
              title: stackNode.title,
              parentSpaceId: spaceNode.id,
              bookmarks: [],
              todo: { id: todoIdFromUrl(marker.url)!, anchorId: marker.id },
              ...(color ? { color } : {}),
              ...(typeof stackNode.index === 'number' ? { index: stackNode.index } : {}),
            }
          }
          const folders = foldersIn(stackNode)
          return {
            id: stackNode.id,
            title: stackNode.title,
            parentSpaceId: spaceNode.id,
            bookmarks: linksIn(stackNode),
            ...(folders.length ? { folders } : {}),
            ...(color ? { color } : {}),
            ...(typeof stackNode.index === 'number' ? { index: stackNode.index } : {}),
          }
        })
      return {
        id: spaceNode.id,
        rawTitle: spaceNode.title,
        name: parsed.name,
        emoji: parsed.emoji,
        stacks,
        ...(typeof spaceNode.index === 'number' ? { index: spaceNode.index } : {}),
      }
    })
  return { rootId: root.id, rootDateAdded: root.dateAdded, spaces, todoIds: markersIn(root) }
}

/**
 * The to-do lists the orphan sweep keeps: every marker under the Stackboard folder at any depth,
 * a list moved inside another stack included, plus the to-do stacks the board shows.
 */
export function liveTodoIds(tree: StackableTree): string[] {
  const shown = tree.spaces.flatMap((sp) => sp.stacks.flatMap((st) => (st.todo ? [st.todo.id] : [])))
  return [...new Set([...(tree.todoIds ?? []), ...shown])]
}

// ---------- Walks ----------

type Holder = { bookmarks: Bookmark[]; folders?: Folder[] }

/** Every link in a stack or folder, the folders inside included: its own links first, then each folder's. */
export function allLinks(c: Holder): Bookmark[] {
  return [...c.bookmarks, ...(c.folders ?? []).flatMap(allLinks)]
}

/** Every folder below a stack or folder, depth first, in board order. */
export function walkFolders(c: Holder): Folder[] {
  return (c.folders ?? []).flatMap((f) => [f, ...walkFolders(f)])
}

export interface Place {
  space: Space
  stack: Stack
  /** The folders from the stack down to this one, outermost first; [] for the stack itself. */
  path: Folder[]
  container: Container
}

/** A space's stacks and every folder in them, each with where it sits, in board order. */
export function placesIn(space: Space): Place[] {
  const out: Place[] = []
  const visit = (stack: Stack, c: Holder, path: Folder[]) => {
    for (const f of c.folders ?? []) {
      const p = [...path, f]
      out.push({ space, stack, path: p, container: f })
      visit(stack, f, p)
    }
  }
  for (const stack of space.stacks) {
    out.push({ space, stack, path: [], container: stack })
    visit(stack, stack, [])
  }
  return out
}

/** Where a stack, or a folder at any depth, sits. */
export function locate(tree: { spaces: readonly Space[] } | null, id: string): Place | null {
  for (const space of tree?.spaces ?? []) {
    const hit = placesIn(space).find((p) => p.container.id === id)
    if (hit) return hit
  }
  return null
}

/** The stack or folder holding a link, and where it sits. */
export function holderOf(tree: { spaces: readonly Space[] } | null, bookmarkId: string): Place | null {
  for (const space of tree?.spaces ?? []) {
    const hit = placesIn(space).find((p) => p.container.bookmarks.some((b) => b.id === bookmarkId))
    if (hit) return hit
  }
  return null
}

/** "4 links", or "2 folders, 9 links" when it holds folders: what a delete takes with it. */
export function contentsLabel(c: Holder): string {
  const folders = walkFolders(c).length
  const links = plural(allLinks(c).length, 'link')
  return folders ? `${plural(folders, 'folder')}, ${links}` : links
}

/**
 * The index chrome.bookmarks.move needs to put a link where `to` is now. Chrome counts every child
 * of a folder, folders too, so the links' own indexes are used, with their places in the list as
 * the fallback (demo data). Within one folder a move down passes one more: Chrome takes the link
 * out first, then inserts.
 */
export function moveIndex(from: { index?: number }, fromPos: number, to: { index?: number }, toPos: number, sameParent: boolean): number {
  const a = from.index ?? fromPos
  const b = to.index ?? toPos
  return sameParent && b > a ? b + 1 : b
}

// ---------- Fold state (localStorage, one list per device) ----------

/** Open folders remembered per device; the oldest drop off past this. */
export const OPEN_FOLDERS_MAX = 500

/** The ids of the folders open on this device, oldest first. Every other folder shows folded. */
export function parseOpenFolders(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-OPEN_FOLDERS_MAX) : []
  } catch {
    return []
  }
}

/** The list with `id` opened (moved to the end) or folded (removed), capped. */
export function setFolderOpen(list: readonly string[], id: string, open: boolean): string[] {
  const rest = list.filter((x) => x !== id)
  return (open ? [...rest, id] : rest).slice(-OPEN_FOLDERS_MAX)
}

// ---------- Backups ----------

type BackupStack = BookmarkBackup['spaces'][number]['stacks'][number]
type BackupLink = { title: string; url: string }

const linkOf = (b: Bookmark): BackupLink => ({ title: b.title, url: b.url })

function backupFolders(folders: readonly Folder[] = []): BackupFolder[] {
  return folders.map((f) => {
    const inner = backupFolders(f.folders)
    return { name: f.title, bookmarks: f.bookmarks.map(linkOf), ...(inner.length ? { folders: inner } : {}) }
  })
}

/** A link stack as a backup keeps it: its links, then its folders, nested, and its colour (0.9.0). */
export function backupStack(stack: Stack): BackupStack {
  const folders = backupFolders(stack.folders)
  return { name: stack.title, bookmarks: stack.bookmarks.map(linkOf), ...(folders.length ? { folders } : {}), ...(stack.color ? { color: stack.color } : {}) }
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** A backup's links, keeping only entries with an address (older or hand-edited files can hold anything). */
function readLinks(raw: unknown): BackupLink[] {
  return list(raw).flatMap((l) => {
    const o = l as { title?: unknown; url?: unknown } | null
    return o && typeof o.url === 'string' ? [{ title: typeof o.title === 'string' ? o.title : o.url, url: o.url }] : []
  })
}

/** Links in a backup's folders, at any depth. */
export function countFolderLinks(folders: unknown): number {
  return list(folders).reduce<number>((n, f) => {
    const o = f as { bookmarks?: unknown; folders?: unknown } | null
    return n + readLinks(o?.bookmarks).length + countFolderLinks(o?.folders)
  }, 0)
}

/** What writing a backup needs from chrome.bookmarks (its promise API). */
export interface CreateApi {
  create(arg: { parentId: string; title: string; url?: string }): Promise<{ id: string }>
}

async function writeLinks(api: CreateApi, parentId: string, links: BackupLink[], onSkip?: (url: string, err: unknown) => void) {
  for (const l of links) {
    try {
      await api.create({ parentId, title: l.title, url: l.url })
    } catch (err) {
      if (!onSkip) throw err
      onSkip(l.url, err)
    }
  }
}

async function writeFolders(api: CreateApi, parentId: string, folders: unknown, onSkip?: (url: string, err: unknown) => void) {
  for (const f of list(folders)) {
    const o = f as { name?: unknown; bookmarks?: unknown; folders?: unknown } | null
    if (!o || typeof o !== 'object') continue
    const node = await api.create({ parentId, title: typeof o.name === 'string' ? o.name : '' })
    await writeLinks(api, node.id, readLinks(o.bookmarks), onSkip)
    await writeFolders(api, node.id, o.folders, onSkip)
  }
}

/**
 * Writes one backed-up link stack into a space: the stack folder, its links, then its folders and
 * theirs. Older backups have no folders. With `onSkip`, a link Chrome refuses is reported there and
 * left out (a snapshot restore); without it the error stops the import. Returns the stack's id.
 */
export async function writeBackupStack(
  api: CreateApi,
  spaceId: string,
  stack: BackupStack,
  onSkip?: (url: string, err: unknown) => void,
): Promise<string> {
  const node = await api.create({ parentId: spaceId, title: stack.name })
  await writeLinks(api, node.id, readLinks(stack.bookmarks), onSkip)
  await writeFolders(api, node.id, stack.folders, onSkip)
  await writeStackColor(api, node.id, stack.color)
  return node.id
}

/** A backed-up stack's colour (0.9.0) as its marker bookmark, last in the folder; nothing for a missing or unknown one. */
export async function writeStackColor(api: CreateApi, stackId: string, color: unknown): Promise<void> {
  const c = parseStackColor(color)
  if (c) await api.create({ parentId: stackId, title: STACK_MARKER_TITLE, url: stackColorUrl(c) })
}
