import type { Bookmark, Folder, Space, Stack, StackableTree } from './types'
import { placesIn } from './folderPlan'

export interface SearchGroup {
  space: Space
  stack: Stack
  /** The folders inside the stack that lead to these links, outermost first; [] for the stack's own (0.8.0). */
  path: Folder[]
  hits: Bookmark[]
  best: number
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Every term must match the bookmark's title, its URL, or the name of its stack, the folders it
 * sits in, or its space ("japan" lists the whole Japan stack, its folders included). Word starts in
 * the title rank highest. Groups come back best-first, so groups[0].hits[0] is what Enter opens.
 * Each folder inside a stack is its own group (0.8.0).
 */
export function searchTree(tree: StackableTree, query: string): SearchGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const wordStart = terms.map((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(t)}`, 'u'))

  const groups: SearchGroup[] = []
  for (const space of tree.spaces) {
    for (const { stack, path, container } of placesIn(space)) {
      const where = [space.name, stack.title, ...path.map((f) => f.title)].join(' ').toLowerCase()
      const scored: Array<{ bookmark: Bookmark; score: number }> = []
      for (const bookmark of container.bookmarks) {
        const title = bookmark.title.toLowerCase()
        const url = bookmark.url.toLowerCase()
        let score = 0
        let matched = true
        for (let i = 0; i < terms.length; i++) {
          const t = terms[i]
          if (wordStart[i].test(title)) score += 4
          else if (title.includes(t)) score += 3
          else if (where.includes(t)) score += 2
          else if (url.includes(t)) score += 1
          else {
            matched = false
            break
          }
        }
        if (matched) scored.push({ bookmark, score })
      }
      if (scored.length > 0) {
        scored.sort((a, b) => b.score - a.score) // stable: stack order breaks ties
        groups.push({ space, stack, path, hits: scored.map((s) => s.bookmark), best: scored[0].score })
      }
    }
  }
  groups.sort((a, b) => b.best - a.best)
  return groups
}

export function topHit(tree: StackableTree | null, query: string): Bookmark | null {
  if (!tree) return null
  return searchTree(tree, query)[0]?.hits[0] ?? null
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * 0.9.7: a listed link is a close match when every typed word matches it closely: at the start of a
 * word in its title, at the start of a label in its hostname (git: github.com, mail:
 * mail.google.com), or anywhere in its hostname for a word of 3 or more characters (hub:
 * github.com). A word found only in the path or query, only mid-word in the title, or only in a
 * stack, folder or space name still lists the link, but doesn't make it close.
 */
export function isCloseMatch(bookmark: Pick<Bookmark, 'title' | 'url'>, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return false
  const title = bookmark.title.toLowerCase()
  const host = hostOf(bookmark.url)
  const labels = host.split('.')
  return terms.every(
    (t) =>
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(t)}`, 'u').test(title) ||
      labels.some((l) => l.startsWith(t)) ||
      (t.length >= 3 && host.includes(t)),
  )
}

/**
 * What Enter opens (0.9.7): the highest-ranked close match among the listed links, or null, and then
 * Enter searches the web. Listed links that aren't close stay reachable with the arrow keys.
 */
export function enterHit(tree: StackableTree | null, query: string): Bookmark | null {
  if (!tree) return null
  for (const group of searchTree(tree, query)) {
    for (const bookmark of group.hits) if (isCloseMatch(bookmark, query)) return bookmark
  }
  return null
}
