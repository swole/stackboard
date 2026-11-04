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
