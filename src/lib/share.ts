import { IS_EXTENSION, ensureRoot } from './bookmarks'
import { buildSpaceTitle } from './icon'
import { carriesFolderLinks, encodeShare, parsePayload, shareNote, type SharedStack } from './sharePlan'
import { allLinks } from './folderPlan'
import type { Stack } from './types'

// Share a stack as a link (0.8.0, T4): copying the link on the board, and adding a shared stack
// that getstackboard.com/s handed to the service worker. A web page never writes bookmarks: the
// worker only parks the stack in chrome.storage.session and opens a Stackboard tab, where the
// person picks a space and presses Add.

/** chrome.storage.session key prefix for a stack waiting for its Add click. */
export const PENDING_PREFIX = 'shareAdd:'
/** A parked stack older than this is dropped. */
export const PENDING_MS = 60 * 60 * 1000
/** At most this many parked stacks wait at once; the newest are kept. */
export const PENDING_MAX = 5

export interface PendingShare {
  stack: SharedStack
  at: number
}

/** Clipboard first; the old execCommand route when the page isn't focused enough for it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Copies a stack's share link. Returns what the toast should say, or null when there's nothing to
 * share. A share stays one flat list: links in the stack's folders (0.8.0) follow its own links,
 * and the toast says so when any of them made it into the link.
 */
export async function shareStack(stack: Stack): Promise<{ title: string; detail: string; copied: boolean } | null> {
  const made = await encodeShare({ title: stack.title, links: allLinks(stack) })
  if (!made) return null
  const copied = await copyText(made.url)
  return { ...shareNote(made, carriesFolderLinks(made, stack.bookmarks)), copied }
}

/** Reads (and keeps) the parked stack for a `#share=<id>` tab. */
export async function readPendingShare(id: string): Promise<SharedStack | null> {
  if (!IS_EXTENSION || !/^[a-z0-9]{8,40}$/.test(id) || !chrome.storage.session) return null
  const key = PENDING_PREFIX + id
  const got = (await chrome.storage.session.get(key))[key] as PendingShare | undefined
  if (!got || typeof got.at !== 'number' || Date.now() - got.at > PENDING_MS) return null
  // Checked again on the way out: storage.session only ever holds what the worker validated,
  // but a stack is about to become bookmarks.
  return parsePayload({ v: 1, t: got.stack?.title, l: (got.stack?.links ?? []).map((l) => [l?.title, l?.url]) })
}

export async function dropPendingShare(id: string): Promise<void> {
  if (!IS_EXTENSION || !chrome.storage.session) return
  await chrome.storage.session.remove(PENDING_PREFIX + id).catch(() => {})
}

/**
 * Adds a shared stack at the end of a space (or of a new space named after it). Returns the ids so
 * the board can show it. Only ever called from the Add button in the extension's own page.
 */
export async function addSharedStack(stack: SharedStack, target: { spaceId: string } | { newSpace: true }): Promise<{ spaceId: string; stackId: string }> {
  let spaceId: string
  if ('spaceId' in target) spaceId = target.spaceId
  else spaceId = (await chrome.bookmarks.create({ parentId: await ensureRoot(), title: buildSpaceTitle('🔗', stack.title) })).id
  const folder = await chrome.bookmarks.create({ parentId: spaceId, title: stack.title })
  for (const l of stack.links) {
    await chrome.bookmarks.create({ parentId: folder.id, title: l.title, url: l.url })
  }
  return { spaceId, stackId: folder.id }
}
