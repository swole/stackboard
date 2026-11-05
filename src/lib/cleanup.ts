import { IS_EXTENSION, ensureRoot, restoreSnapshot, snapshotNode, type NodeSnapshot } from './bookmarks'
import { DEMO_TREE } from './demoTree'
import { todoIdFromUrl } from './todoPlan'
import { isStackMarker } from './stackStylePlan'
import { placesIn } from './folderPlan'
import { PATH_SEPARATOR } from './importPlan'
import { bumpStat } from './proStats'
import {
  CHECK_CONCURRENCY,
  CHECK_TIMEOUT_MS,
  boardLinks,
  groupBySite,
  normalizeUrl,
  readCheckError,
  secondProbe,
  type CheckResult,
  type CleanLink,
} from './cleanupPlan'

// "Clean up your board" (Pro, 0.7.1): the reads, the reachability checks and the removal. The
// rules are in cleanupPlan.ts. Only links on the board itself are ever looked at: spaces and
// stacks under Other bookmarks > Stackboard, and the folders inside stacks (0.8.0). Company
// folders sit outside it, and to-do stacks and markers are skipped, so none of them can be
// removed from here.

/** Every link on the board, in board order (space, stack, position, then folders in the stack). */
export async function readBoardLinks(): Promise<CleanLink[]> {
  if (!IS_EXTENSION) return demoLinks()
  const [root] = await chrome.bookmarks.getSubTree(await ensureRoot())
  return root ? boardLinks(root) : []
}

/** The demo board for vite preview, with two copies and two old links so every section shows something. */
function demoLinks(): CleanLink[] {
  const old = Date.now() - 400 * 86_400_000
  const links: CleanLink[] = DEMO_TREE.spaces.flatMap((sp) =>
    placesIn(sp).flatMap(({ stack, path, container }) =>
      container.bookmarks.map((b, i) => ({
        id: b.id,
        url: b.url,
        title: b.title,
        spaceName: sp.name,
        spaceEmoji: sp.emoji,
        stackTitle: [stack.title, ...path.map((f) => f.title)].join(PATH_SEPARATOR),
        parentId: container.id,
        index: i,
        dateAdded: i % 3 === 0 ? old : Date.now(),
      })),
    ),
  )
  if (links.length > 3) links.push({ ...links[0], id: 'demo-copy-1', stackTitle: links[3].stackTitle, parentId: links[3].parentId, index: 99 })
  return links
}

/**
 * Asks each site whether it still answers, once per site and a few at a time: a HEAD request for
 * its home page, never the saved page itself (a page address can carry one-time tokens or act when
 * loaded). A no-cors request needs no host permission: it either gets an opaque answer (the site is
 * there, whatever it said) or throws (no connection, a dead domain, a refused TLS handshake, or no
 * answer in 8 seconds). `results` is keyed by the normalised link, `sites` by site.
 */
export async function checkLinks(
  urls: string[],
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ results: Map<string, CheckResult>; sites: Map<string, CheckResult> }> {
  const results = new Map<string, CheckResult>()
  const sites = new Map<string, CheckResult>()
  const groups = [...groupBySite(urls).entries()]
  let next = 0
  let done = 0
  const probe = async (url: string, method: 'HEAD' | 'GET'): Promise<CheckResult> => {
    try {
      const signals = [AbortSignal.timeout(CHECK_TIMEOUT_MS), ...(opts.signal ? [opts.signal] : [])]
      await fetch(url, { method, mode: 'no-cors', credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: AbortSignal.any(signals) })
      return 'ok'
    } catch (err) {
      return readCheckError(err)
    }
  }
  const one = async (site: string): Promise<CheckResult> => {
    if (!IS_EXTENSION) return /broken|example\.invalid/.test(site) ? 'failed' : 'ok'
    const first = await probe(site, 'HEAD')
    if (first === 'ok' || opts.signal?.aborted) return first
    // Some live sites refuse a request from another site but answer for their icon.
    const icon = secondProbe(site)
    return icon && (await probe(icon, 'GET')) === 'ok' ? 'ok' : first
  }
  const worker = async () => {
    while (next < groups.length && !opts.signal?.aborted) {
      const [site, pages] = groups[next++]
      const r = await one(site)
      if (opts.signal?.aborted) return
      sites.set(site, r)
      for (const url of pages) results.set(normalizeUrl(url), r)
      opts.onProgress?.(++done, groups.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, groups.length) }, worker))
  return { results, sites }
}

/**
 * How many steps up from a node the Stackboard root is: 1 for a space, 2 for a stack, 3 for a link
 * in a stack, more for a folder inside a stack and the links in it (0.8.0). 0 when the node is
 * gone or the root isn't above it.
 */
async function stepsToRoot(id: string, rootId: string): Promise<number> {
  let at: string | undefined = id
  try {
    for (let steps = 0; at && steps < 64; steps++) {
      if (at === rootId) return steps
      const [node]: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.get(at)
      at = node?.parentId
    }
  } catch {
    // gone already
  }
  return 0
}

/** True while a link still sits in a stack on the board, or in a folder inside one (link > stack > space > root). */
async function onBoard(id: string, rootId: string): Promise<boolean> {
  return (await stepsToRoot(id, rootId)) >= 3
}

/**
 * Removes the links and hands back what brings them back. Every link is copied before the first
 * one goes, so each copy holds its position on the board as it was; restoring puts them back
 * lowest position first in each stack or folder, which lands every one exactly where it was. A link
 * that left the board since the list was read (another tab, Chrome's bookmark manager) is left
 * alone, and each one's stack or folder is checked again right before its link goes back.
 */
export async function removeLinks(ids: string[]): Promise<{ removed: number; skipped: number; restore: () => Promise<number> }> {
  if (!IS_EXTENSION) return { removed: ids.length, skipped: 0, restore: async () => ids.length }
  const rootId = await ensureRoot()
  const before: { id: string; snap: NodeSnapshot }[] = []
  for (const id of ids) {
    const s = await snapshotNode(id).catch(() => null)
    if (!s || !s.url || todoIdFromUrl(s.url) || isStackMarker(s.url)) continue
    before.push({ id, snap: s })
  }
  const snaps: NodeSnapshot[] = []
  let skipped = ids.length - before.length
  for (const { id, snap } of before) {
    if (!(await onBoard(id, rootId))) {
      skipped++
      continue
    }
    try {
      await chrome.bookmarks.remove(id)
      snaps.push(snap)
    } catch {
      skipped++ // gone meanwhile (another tab or computer): nothing to bring back
    }
  }
  if (snaps.length) void bumpStat('cleaned', snaps.length) // 0.9.0: the trial-end recap
  const restore = async () => {
    // Lowest positions first in each stack or folder, so every link lands where it was.
    const order = [...snaps].sort((a, b) => (a.parentId === b.parentId ? a.index - b.index : a.parentId < b.parentId ? -1 : 1))
    let back = 0
    for (const s of order) {
      try {
        // Its stack or folder must still be on the board (moved off, it would take the link along).
        if ((await stepsToRoot(s.parentId, rootId)) < 2) continue
        if (await restoreSnapshot(s)) back++
      } catch {
        // its stack is gone too: that link can still come back from a daily snapshot
      }
    }
    return back
  }
  return { removed: snaps.length, skipped, restore }
}
