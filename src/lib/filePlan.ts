import type { Space, StackableTree } from './types'
import { allLinks } from './folderPlan'
import { buildSpaceTitle } from './icon'

// Suggested stack when saving (0.9.0): the toolbar popup offers one stack first, so saving the page
// takes one click or Enter. The local match below runs for everyone and sends nothing; Pro can let
// AI pick instead (lib/aiFile.ts asks site/api/file.js). Pure, unit-tested in tests/unit.test.ts.

/** A stack a save can go to. */
export interface FileTarget {
  stackId: string
  spaceId: string
  spaceName: string
  stackTitle: string
  /** "Work › Docs": what the popup shows, and what the AI pick reads */
  path: string
}

export interface Suggestion extends FileTarget {
  /** site: the stack already holds links from this site; words: its name matches the title; ai: Pro's pick */
  reason: 'site' | 'words' | 'ai'
}

/** The AI pick sees at most this many stacks (MAX_STACKS in site/api/_lib/file.js). */
export const FILE_MAX_STACKS = 300

// Stash is where tabs get dumped, so a site sitting in an old stash stack says nothing about where a
// new link belongs.
const STASH_TITLE = buildSpaceTitle('📥', 'Stash')

/** The host without "www.", lower case; '' for anything that isn't a web address. */
export function siteOf(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function skipSpace(sp: Space): boolean {
  return !!sp.company || sp.rawTitle === STASH_TITLE
}

/**
 * Link stacks a save can go to, in board order: no to-do stacks, nothing from a company space.
 * Stash comes last, since it's a real place to save to but a poor one to suggest.
 */
export function fileTargets(tree: StackableTree | null): FileTarget[] {
  const out: FileTarget[] = []
  const later: FileTarget[] = []
  for (const sp of tree?.spaces ?? []) {
    if (sp.company) continue
    for (const st of sp.stacks) {
      if (st.todo || st.readOnly) continue
      const t = { stackId: st.id, spaceId: sp.id, spaceName: sp.name, stackTitle: st.title, path: `${sp.name || 'Untitled'} › ${st.title}` }
      ;(sp.rawTitle === STASH_TITLE ? later : out).push(t)
    }
  }
  return [...out, ...later]
}

// Words too common to say anything about a page or a stack.
const STOP = new Set(
  'the and for with your you how what why when from this that are was were will can get our out new all not but its into about more most best home page site www com net org html http https'.split(' '),
)

/** "Recipes" and "recipe" count as one word, as do "groceries" and "grocery"; "news" and "glass" stay as they are. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  return w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
}

/** Lower-case words of three letters or more, common words left out, each once. */
export function words(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of (text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue
    seen.add(stem(raw))
  }
  return [...seen]
}

/**
 * The stack to offer first for a page, or null when nothing fits. The stack holding the most links
 * from the same site wins (board order breaks a tie); with no such stack, the best overlap between
 * the page title and the stack's name (worth 2 a word) and its space's name (worth 1), when the stack
 * name itself matches at least once.
 */
export function suggestStack(tree: StackableTree | null, page: { url: string; title: string }): Suggestion | null {
  const site = siteOf(page.url)
  let best: { space: Space; stackId: string; score: number } | null = null
  if (site) {
    for (const sp of tree?.spaces ?? []) {
      if (skipSpace(sp)) continue
      for (const st of sp.stacks) {
        if (st.todo || st.readOnly) continue
        const score = allLinks(st).filter((b) => siteOf(b.url) === site).length
        if (score > 0 && (!best || score > best.score)) best = { space: sp, stackId: st.id, score }
      }
    }
  }
  let reason: Suggestion['reason'] = 'site'
  if (!best) {
    reason = 'words'
    const want = new Set(words(page.title))
    if (want.size) {
      for (const sp of tree?.spaces ?? []) {
        if (skipSpace(sp)) continue
        const fromSpace = words(sp.name).filter((w) => want.has(w)).length
        for (const st of sp.stacks) {
          if (st.todo || st.readOnly) continue
          const own = words(st.title).filter((w) => want.has(w)).length
          const score = own * 2 + fromSpace
          if (own > 0 && (!best || score > best.score)) best = { space: sp, stackId: st.id, score }
        }
      }
    }
  }
  if (!best) return null
  const target = fileTargets(tree).find((t) => t.stackId === best!.stackId)
  return target ? { ...target, reason } : null
}

/** The AI pick's answer, read: a stack from the list it was given, or null. */
export function readPick(body: unknown, targets: FileTarget[]): Suggestion | null {
  const i = (body as { stack?: unknown } | null)?.stack
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= targets.length) return null
  return { ...targets[i], reason: 'ai' }
}

/** What the AI pick sends: the page and the stacks as paths, in the order the answer refers to. */
export function fileBody(page: { url: string; title: string }, targets: FileTarget[], license: { key: string; activationId: string }) {
  return {
    page: { title: page.title.slice(0, 300), url: page.url.slice(0, 2000) },
    stacks: targets.slice(0, FILE_MAX_STACKS).map((t) => t.path.slice(0, 120)),
    license,
  }
}
