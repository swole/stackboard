import type { Bookmark, Folder, Space, Stack, StackableTree } from './types'
import { searchTree } from './search'

// The command bar (Pro, 0.9.0): Ctrl/Cmd+K finds links, stacks and spaces and runs a few actions.
// Pure, so tests/unit.test.ts covers what a query lists and in what order; the bar itself is
// components/CommandBar.tsx. Links rank with the board's own search (search.ts).

export type CommandAction = 'new-space' | 'new-stack' | 'stash' | 'settings' | 'light' | 'dark' | 'cleanup' | 'tidy'

export const ACTIONS: readonly { id: CommandAction; label: string; words: string }[] = [
  { id: 'new-space', label: 'New space', words: 'add create' },
  { id: 'new-stack', label: 'New stack here', words: 'add create list to-do' },
  { id: 'stash', label: 'Stash this window', words: 'save tabs close' },
  { id: 'settings', label: 'Open Settings', words: 'preferences options pro' },
  { id: 'light', label: 'Light', words: 'theme mode' },
  { id: 'dark', label: 'Dark', words: 'theme mode night' },
  { id: 'cleanup', label: 'Clean up', words: 'duplicates dead links unused' },
  { id: 'tidy', label: 'Tidy this space', words: 'ai sort organize' },
]

/** Most rows each kind adds to the list. */
export const COMMAND_CAPS = { action: 4, space: 4, stack: 5, link: 8 } as const

export type CommandItem =
  | { kind: 'action'; id: CommandAction; label: string }
  | { kind: 'space'; space: Space }
  | { kind: 'stack'; space: Space; stack: Stack }
  | { kind: 'link'; space: Space; stack: Stack; path: Folder[]; bookmark: Bookmark }

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

function wordStarts(text: string, term: string): boolean {
  let at = text.indexOf(term)
  while (at >= 0) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true
    at = text.indexOf(term, at + 1)
  }
  return false
}

/** Every term must appear in the text; one that starts a word counts double. 0 = no match. */
export function nameScore(text: string, query: string): number {
  const t = terms(query)
  if (!t.length) return 0
  const hay = text.toLowerCase()
  let score = 0
  for (const term of t) {
    if (wordStarts(hay, term)) score += 2
    else if (hay.includes(term)) score += 1
    else return 0
  }
  return score
}

function best<T>(rows: T[], score: (r: T) => number, cap: number): T[] {
  return rows
    .map((r, i) => ({ r, s: score(r), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, cap)
    .map((x) => x.r)
}

/**
 * What the bar lists. With no query: the actions on offer, then the spaces. With one: actions whose
 * name has a word starting with what was typed come first (they're few and asked for by name), then
 * spaces and stacks, then actions found inside a word or by a related word ("do" finds the Docs stack
 * before New stack's "to-do" and Stash this window), then links.
 */
export function commandItems(p: { tree: StackableTree | null; query: string; available: ReadonlySet<CommandAction> }): CommandItem[] {
  const actions = ACTIONS.filter((a) => p.available.has(a.id))
  const spaces = p.tree?.spaces ?? []
  if (!terms(p.query).length) {
    return [
      ...actions.map((a): CommandItem => ({ kind: 'action', id: a.id, label: a.label })),
      ...spaces.slice(0, 9).map((space): CommandItem => ({ kind: 'space', space })),
    ]
  }
  const out: CommandItem[] = []
  const found = best(actions, (a) => Math.max(nameScore(a.label, p.query), nameScore(`${a.label} ${a.words}`, p.query) && 1), COMMAND_CAPS.action)
  const byName = found.filter((a) => nameScore(a.label, p.query) >= 2)
  for (const a of byName) out.push({ kind: 'action', id: a.id, label: a.label })
  for (const space of best(spaces, (s) => nameScore(s.name, p.query), COMMAND_CAPS.space)) out.push({ kind: 'space', space })
  const stacks = spaces.flatMap((space) => space.stacks.map((stack) => ({ space, stack })))
  for (const { space, stack } of best(stacks, (x) => nameScore(x.stack.title, p.query), COMMAND_CAPS.stack)) {
    out.push({ kind: 'stack', space, stack })
  }
  for (const a of found.filter((x) => !byName.includes(x))) out.push({ kind: 'action', id: a.id, label: a.label })
  if (p.tree) {
    const links: CommandItem[] = []
    for (const g of searchTree(p.tree, p.query)) {
      for (const bookmark of g.hits) {
        if (links.length >= COMMAND_CAPS.link) break
        links.push({ kind: 'link', space: g.space, stack: g.stack, path: g.path, bookmark })
      }
      if (links.length >= COMMAND_CAPS.link) break
    }
    out.push(...links)
  }
  return out
}

/** The next row for an arrow key, wrapping at both ends. */
export function stepIndex(index: number, by: 1 | -1, count: number): number {
  if (count <= 0) return 0
  return (index + by + count) % count
}
