// The first-run reveal (0.9.9, backlog K4: make the first minute feel like opening a new
// phone). A fresh install with bookmarks to bring opens on a preview of the board those bookmarks make,
// already laid out, and one button keeps it. Pure: no DOM, no chrome.*, so tests/unit.test.ts covers it.

import { parseBookmarkTitle } from './icon'
import type { PaletteId, Scheme } from './appearance'
import type { PlannedLink, PlannedSpace } from './importPlan'
import { countPlannedStack, plural } from './importPlan'

/** chrome.storage.local: set by background.ts on a fresh install, gone once the reveal is done or can't apply. */
export const REVEAL_KEY = 'stackboardReveal'
/** An install older than this gets the plain welcome screen. */
export const REVEAL_DAYS = 7
const DAY = 24 * 60 * 60 * 1000

export function revealDue(at: unknown, now = Date.now()): boolean {
  const t = Number(at) || 0
  return t > 0 && now - t >= 0 && now - t < REVEAL_DAYS * DAY
}

/** The slice of an import source the reveal reads (lib/importChrome.ts ImportSource). */
export interface RevealSource {
  id: string
  kind: 'bar' | 'other' | 'mobile' | 'folder' | 'arc'
  label: string
  plan: { space: PlannedSpace; links: number }
}

/** The bookmarks bar when it holds links (it's what people use), else the folder with the most links. */
export function pickRevealSource<T extends RevealSource>(sources: readonly T[]): T | null {
  const live = sources.filter((s) => s.kind !== 'arc' && s.plan.links > 0)
  const bar = live.find((s) => s.kind === 'bar')
  if (bar) return bar
  return live.reduce<T | null>((best, s) => (!best || s.plan.links > best.plan.links ? s : best), null)
}

// ---------- names ----------

/** First match wins, so the specific ones sit above the general ones ("Japan trip" is Japan before travel). */
const STACK_EMOJI: readonly [RegExp, string][] = [
  [/\b(recipes?|cooking|food|meals?|baking|kitchen|dinner)\b/i, '🍳'],
  [/\b(japan|tokyo|kyoto|osaka)\b/i, '🗾'],
  [/\b(travel|trips?|vacations?|holidays?|flights?|hotels?)\b/i, '✈️'],
  [/\b(read later|reading|to read|articles?|blogs?|essays?|newsletters?)\b/i, '📚'],
  [/\b(news)\b/i, '📰'],
  [/\b(shop|shopping|wish ?list|deals?|gifts?|buy)\b/i, '🛍️'],
  [/\b(jobs?|careers?|resumes?|interviews?|job hunt)\b/i, '🧭'],
  [/\b(school|class|classes|courses?|study|studies|university|college|homework|lectures?|exams?)\b/i, '🎓'],
  [/\b(dev|code|coding|programming|engineering|github|api)\b/i, '💻'],
  [/\b(design|inspiration|figma|fonts?|ui|ux)\b/i, '🎨'],
  [/\b(work|office|projects?|clients?|team|meetings?)\b/i, '💼'],
  [/\b(music|playlists?|podcasts?)\b/i, '🎵'],
  [/\b(videos?|movies?|films?|tv|shows|streaming|watch later)\b/i, '🎬'],
  [/\b(finance|money|banking|bank|budget|investing|investments?|stocks?|taxes)\b/i, '💳'],
  [/\b(games?|gaming)\b/i, '🎮'],
  [/\b(health|fitness|gym|workouts?|running|sports?)\b/i, '💪'],
  [/\b(ai|chatgpt|gpt|llms?)\b/i, '🤖'],
  [/\b(photos?|photography)\b/i, '📷'],
  [/\b(home|house|diy|garden|gardening)\b/i, '🏠'],
  [/\b(tools?|utilities|apps)\b/i, '🧰'],
  [/\b(ideas?|notes?)\b/i, '💡'],
  [/\b(social|friends|community)\b/i, '💬'],
  [/\b(family|kids?|baby)\b/i, '👪'],
]

/** An icon for a stack named like this, or null when nothing fits well enough to guess. */
export function stackEmoji(title: string): string | null {
  const t = title.trim()
  for (const [re, emoji] of STACK_EMOJI) if (re.test(t)) return emoji
  return null
}

/** The stack made of links sitting loose in the folder (importChrome.ts looseTitle). */
const LOOSE: Record<RevealSource['kind'], string> = { bar: 'On the bar', other: 'Links', mobile: 'Links', folder: 'Links', arc: 'Links' }
const LOOSE_EMOJI: Record<RevealSource['kind'], string> = { bar: '⭐', other: '🔗', mobile: '🔗', folder: '🔗', arc: '🔗' }

export const REVEAL_SPACE = { name: 'Home', emoji: '🏠' }

/**
 * The space the reveal shows and writes: named Home, and each stack wearing an icon where its name
 * makes one obvious (stack icons are the emoji at the start of the title, stackStylePlan.ts). A
 * title that already starts with an emoji keeps it.
 */
export function decorateForReveal(space: PlannedSpace, kind: RevealSource['kind']): PlannedSpace {
  return {
    ...space,
    name: REVEAL_SPACE.name,
    emoji: REVEAL_SPACE.emoji,
    stacks: space.stacks.map((st) => {
      if (parseBookmarkTitle(st.title).emoji) return st
      const icon = st.title === LOOSE[kind] ? LOOSE_EMOJI[kind] : stackEmoji(st.title)
      return icon ? { ...st, title: `${icon} ${st.title}` } : st
    }),
  }
}

// ---------- the preview ----------

export interface PreviewStack {
  title: string
  links: PlannedLink[]
  /** Links in this stack the preview leaves out, those in folders included. */
  more: number
}

/** What the preview draws: the first stacks, each with its first links. */
export function previewOf(space: PlannedSpace, maxStacks = 8, maxLinks = 6): { stacks: PreviewStack[]; moreStacks: number } {
  const stacks = space.stacks.slice(0, maxStacks).map((st) => {
    // Links in folders inside the stack count, and show after its own links (as on the board).
    const flat: PlannedLink[] = [...st.links]
    const walk = (fs = st.folders ?? []) => {
      for (const f of fs) {
        flat.push(...f.links)
        walk(f.folders)
      }
    }
    walk()
    const shown = flat.slice(0, maxLinks)
    return { title: st.title, links: shown, more: countPlannedStack(st) - shown.length }
  })
  return { stacks, moreStacks: Math.max(0, space.stacks.length - maxStacks) }
}

// ---------- looks ----------

export interface RevealLook {
  palette: PaletteId
  scheme: Scheme
  name: string
}

/** One row of looks after the board lands; every one is free (appearance.ts PALETTES). */
export const REVEAL_LOOKS: readonly RevealLook[] = [
  { palette: 'stackboard', scheme: 'light', name: 'Paper' },
  { palette: 'stackboard', scheme: 'dark', name: 'Night' },
  { palette: 'catppuccin', scheme: 'dark', name: 'Catppuccin' },
  { palette: 'gruvbox', scheme: 'dark', name: 'Gruvbox' },
  { palette: 'nord', scheme: 'dark', name: 'Nord' },
  { palette: 'tokyonight', scheme: 'dark', name: 'Tokyo Night' },
  { palette: 'rosepine', scheme: 'light', name: 'Rosé Pine Dawn' },
  { palette: 'black', scheme: 'dark', name: 'True black' },
]

// ---------- open tabs ----------

/** Fewer open tabs than this and the offer to stack them isn't worth the space. */
export const TAB_TRICK_MIN = 4

export function tabsLine(tabs: number, windows: number): string {
  return windows > 1 ? `You have ${plural(tabs, 'tab')} open in ${windows} windows.` : `You have ${plural(tabs, 'tab')} open.`
}

// ---------- words ----------

export const REVEAL_COPY = {
  keep: 'If Chrome asks whether to keep this page, choose',
  title: 'Here’s your new tab.',
  made: (label: string, links: number, stacks: number) =>
    `Made from your ${label === 'Bookmarks bar' ? 'bookmarks bar' : `“${label}” folder`}: ${plural(links, 'link')} in ${plural(stacks, 'stack')}. Your originals stay where they are.`,
  use: 'Use this board',
  copying: (done: number, total: number) => `Setting up ${done.toLocaleString()} of ${total.toLocaleString()}`,
  choose: 'Choose what to bring in',
  footer: 'Saved as ordinary Chrome bookmarks, so it syncs with Chrome. No account.',
  moreLinks: (n: number) => `+${plural(n, 'more link')}`,
  moreStacks: (n: number) => `and ${plural(n, 'more stack')}`,
  finishTitle: 'Make it yours',
  finishLooks: 'Pick a look. Settings has more, your own picture included.',
  tabsHint: 'Stack them on your board, or save them all and close them for a clean start.',
  stack: 'Stack them',
  stackClose: 'Save and close all',
  stacked: (n: number) => `Saved ${plural(n, 'link')} in your Stash space. The tabs stay open.`,
  done: 'Done',
  undo: 'Undo',
} as const
