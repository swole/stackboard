import type { Bookmark, Space, Stack, StackableTree, BookmarkBackup } from './types'
import { buildSpaceTitle, parseSpaceTitle } from './icon'
import { DEMO_TREE } from './demoTree'
import { batchFlags } from './fresh'

const ROOT_TITLE = 'Stackboard'
// The folder was "Stackable" before 0.3.0; ensureRoot renames it in place.
const LEGACY_ROOT_TITLES = ['Stackable']
const OTHER_BOOKMARKS_ID = '2' // Chrome's "Other bookmarks" folder
const ROOT_ID_KEY = 'stackableRootId' // predates the rename; kept so existing caches still hit

/** Folder names Stackboard has used for its root; the importer never copies these. */
export const rootTitles: readonly string[] = [ROOT_TITLE, ...LEGACY_ROOT_TITLES]

// True when running inside a Chrome extension. False under `vite preview`, dev server, etc.
// In non-extension contexts we serve DEMO_TREE so the UI can be screenshotted / iterated on.
export const IS_EXTENSION =
  typeof chrome !== 'undefined' &&
  !!(chrome as { bookmarks?: unknown }).bookmarks

type Node = chrome.bookmarks.BookmarkTreeNode

function isFolder(n: Node): boolean {
  return !n.url
}

async function getRootIdFromStorage(): Promise<string | null> {
  const r = await chrome.storage.local.get(ROOT_ID_KEY)
  return (r[ROOT_ID_KEY] as string) ?? null
}

async function setRootIdInStorage(id: string): Promise<void> {
  await chrome.storage.local.set({ [ROOT_ID_KEY]: id })
}

async function getNode(id: string): Promise<Node | null> {
  try {
    const [node] = await chrome.bookmarks.get(id)
    return node ?? null
  } catch {
    return null
  }
}

async function childCount(id: string): Promise<number> {
  try {
    return (await chrome.bookmarks.getChildren(id)).length
  } catch {
    return 0
  }
}

// Root folders under Other bookmarks: the one holding the most spaces wins, the current
// name breaks ties. Two can exist for a while: a device still on an old version can
// recreate an empty "Stackable" after another device renamed the synced folder.
async function findRootByScan(): Promise<string | null> {
  const children = await chrome.bookmarks.getChildren(OTHER_BOOKMARKS_ID)
  const candidates = children.filter(
    (c) => isFolder(c) && (c.title === ROOT_TITLE || LEGACY_ROOT_TITLES.includes(c.title)),
  )
  if (candidates.length === 0) return null
  const sized = await Promise.all(candidates.map(async (c) => ({ c, n: await childCount(c.id) })))
  sized.sort(
    (a, b) => b.n - a.n || Number(b.c.title === ROOT_TITLE) - Number(a.c.title === ROOT_TITLE),
  )
  return sized[0].c.id
}

/**
 * Ensure the Stackboard root folder exists, returning its id.
 * Uses the chrome.storage.local cache, falls back to a scan, creates if missing, and
 * renames a pre-0.3.0 "Stackable" folder in place.
 */
export async function ensureRoot(): Promise<string> {
  // On a fresh profile the install tab and another new tab can load together; without the
  // lock each finds no root and creates its own. Web Locks span every page of the extension.
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request('stackboard-root', ensureRootNow) : ensureRootNow()
}

async function ensureRootNow(): Promise<string> {
  const cached = await getRootIdFromStorage()
  const cachedNode = cached ? await getNode(cached) : null
  let root: Node | null = cachedNode && isFolder(cachedNode) ? cachedNode : null

  // An empty cached root while a fuller one exists means we cached a stray duplicate.
  if (root && (await childCount(root.id)) === 0) {
    const scanned = await findRootByScan()
    if (scanned && scanned !== root.id && (await childCount(scanned)) > 0) root = await getNode(scanned)
  }
  if (!root) {
    const scanned = await findRootByScan()
    root = scanned ? await getNode(scanned) : null
  }
  if (!root) {
    root = await chrome.bookmarks.create({ parentId: OTHER_BOOKMARKS_ID, title: ROOT_TITLE })
  }

  if (root.id !== cached) await setRootIdInStorage(root.id)
  if (LEGACY_ROOT_TITLES.includes(root.title)) {
    await chrome.bookmarks.update(root.id, { title: ROOT_TITLE })
  }
  return root.id
}

/**
 * Build the entire Stackboard tree as a typed object.
 * Cheap — the subtree is small (hundreds of items, not thousands).
 */
export async function readTree(): Promise<StackableTree> {
  if (!IS_EXTENSION) return DEMO_TREE
  const rootId = await ensureRoot()
  const subtree = await chrome.bookmarks.getSubTree(rootId)
  const root = subtree[0]
  const spaceNodes = (root.children ?? []).filter(isFolder)

  const spaces: Space[] = spaceNodes
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((spaceNode) => {
      const parsed = parseSpaceTitle(spaceNode.title)
      const stackNodes = (spaceNode.children ?? []).filter(isFolder)
      const stacks: Stack[] = stackNodes
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((stackNode) => {
          const bookmarkNodes = (stackNode.children ?? []).filter((c) => !!c.url)
          const sorted = bookmarkNodes.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          const batch = batchFlags(sorted.map((b) => b.dateAdded))
          const bookmarks: Bookmark[] = sorted.map((b, i) => ({
            id: b.id,
            title: b.title || b.url || 'Untitled',
            url: b.url!,
            parentStackId: stackNode.id,
            dateAdded: b.dateAdded,
            batch: batch[i],
          }))
          return {
            id: stackNode.id,
            title: stackNode.title,
            parentSpaceId: spaceNode.id,
            bookmarks,
          }
        })
      return {
        id: spaceNode.id,
        rawTitle: spaceNode.title,
        name: parsed.name,
        emoji: parsed.emoji,
        stacks,
      }
    })

  return { rootId, rootDateAdded: root.dateAdded, spaces }
}

// ---------- Spaces ----------

export async function createSpace(name: string, emoji: string): Promise<string> {
  if (!IS_EXTENSION) return 'demo-noop'
  const rootId = await ensureRoot()
  const node = await chrome.bookmarks.create({
    parentId: rootId,
    title: buildSpaceTitle(emoji, name),
  })
  return node.id
}

export async function renameSpace(id: string, name: string, emoji: string): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.update(id, { title: buildSpaceTitle(emoji, name) })
}

export async function deleteSpace(id: string): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.removeTree(id)
}

export async function moveSpace(id: string, newIndex: number): Promise<void> {
  if (!IS_EXTENSION) return
  const rootId = await ensureRoot()
  await chrome.bookmarks.move(id, { parentId: rootId, index: newIndex })
}

// ---------- Stacks ----------

export async function createStack(spaceId: string, title: string): Promise<string> {
  if (!IS_EXTENSION) return 'demo-noop'
  const node = await chrome.bookmarks.create({ parentId: spaceId, title })
  return node.id
}

export async function renameStack(id: string, title: string): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.update(id, { title })
}

export async function deleteStack(id: string): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.removeTree(id)
}

export async function moveStack(
  id: string,
  newSpaceId: string,
  newIndex: number,
): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.move(id, { parentId: newSpaceId, index: newIndex })
}

// ---------- Bookmarks ----------

export async function createBookmark(
  stackId: string,
  title: string,
  url: string,
): Promise<string> {
  if (!IS_EXTENSION) return 'demo-noop'
  const node = await chrome.bookmarks.create({ parentId: stackId, title, url })
  return node.id
}

export async function updateBookmark(
  id: string,
  title: string,
  url: string,
): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.update(id, { title, url })
}

export async function deleteBookmark(id: string): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.remove(id)
}

export async function moveBookmark(
  id: string,
  newStackId: string,
  newIndex: number,
): Promise<void> {
  if (!IS_EXTENSION) return
  await chrome.bookmarks.move(id, { parentId: newStackId, index: newIndex })
}

// ---------- Undo ----------

// Everything needed to recreate a deleted node and its subtree in place. Chrome keeps no
// bookmark trash, so the undo toast holds one of these for a few seconds after a delete.
export interface NodeSnapshot {
  parentId: string
  index: number
  title: string
  url?: string
  children?: NodeSnapshot[]
}

function toSnapshot(n: Node): NodeSnapshot {
  return {
    parentId: n.parentId ?? '',
    index: n.index ?? 0,
    title: n.title,
    url: n.url,
    children: n.url
      ? undefined
      : (n.children ?? [])
          .slice()
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map(toSnapshot),
  }
}

export async function snapshotNode(id: string): Promise<NodeSnapshot | null> {
  // Demo mode deletes nothing, so a stub snapshot is enough to exercise the toast.
  if (!IS_EXTENSION) return { parentId: '', index: 0, title: '' }
  const [node] = await chrome.bookmarks.getSubTree(id)
  return node ? toSnapshot(node) : null
}

async function createFromSnapshot(
  s: NodeSnapshot,
  parentId: string,
  index?: number,
): Promise<string> {
  const node = await chrome.bookmarks.create({ parentId, index, title: s.title, url: s.url })
  for (const child of s.children ?? []) {
    await createFromSnapshot(child, node.id)
  }
  return node.id
}

/** Recreates a deleted node where it was. Returns the new id (ids never come back). */
export async function restoreSnapshot(s: NodeSnapshot): Promise<string | null> {
  if (!IS_EXTENSION) return null
  // Siblings may have been deleted since, so clamp the original index.
  const siblings = await chrome.bookmarks.getChildren(s.parentId)
  return createFromSnapshot(s, s.parentId, Math.min(s.index, siblings.length))
}

// ---------- Backup ----------

export async function exportBackup(): Promise<BookmarkBackup> {
  const tree = await readTree()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: tree.spaces.map((s) => ({
      emoji: s.emoji,
      name: s.name,
      stacks: s.stacks.map((st) => ({
        name: st.title,
        bookmarks: st.bookmarks.map((b) => ({ title: b.title, url: b.url })),
      })),
    })),
  }
}

export async function importBackup(backup: BookmarkBackup): Promise<void> {
  if (!IS_EXTENSION) return
  if (backup.version !== 1) {
    throw new Error(`Unsupported backup version: ${backup.version}`)
  }
  const rootId = await ensureRoot()
  for (const space of backup.spaces) {
    const spaceNode = await chrome.bookmarks.create({
      parentId: rootId,
      title: buildSpaceTitle(space.emoji, space.name),
    })
    for (const stack of space.stacks) {
      const stackNode = await chrome.bookmarks.create({
        parentId: spaceNode.id,
        title: stack.name,
      })
      for (const bm of stack.bookmarks) {
        await chrome.bookmarks.create({
          parentId: stackNode.id,
          title: bm.title,
          url: bm.url,
        })
      }
    }
  }
}
