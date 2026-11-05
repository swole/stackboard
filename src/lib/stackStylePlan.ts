// Stack colours and icons (Pro, 0.9.0). Pure: no DOM, no chrome.*, so tests/unit.test.ts covers it.
// A stack's icon is the emoji at the start of its folder title, the way spaces do it ("📚 Reading"),
// so it syncs with the bookmarks and shows in Chrome's bookmark manager. Its colour is one of
// Chrome's tab-group colours, kept as a marker bookmark inside the stack folder,
// getstackboard.com/stack#c=<colour>, so it syncs too. The board hides that marker the way it
// hides a to-do list's (todoPlan.ts): never a link, never counted, shared, cleaned or exported as one.

import { onAccentFor } from './looks'
import type { Scheme } from './appearance'
import { parseBookmarkTitle } from './icon'

export type StackColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange'

export const STACK_MARKER_BASE = 'https://getstackboard.com/stack#c='
export const STACK_MARKER_TITLE = 'Stackboard stack colour'

/** Chrome's tab-group colours in Chrome's order, with the shades its light and dark themes use. */
export const STACK_COLORS: readonly { id: StackColor; name: string; light: string; dark: string }[] = [
  { id: 'grey', name: 'Grey', light: '#5f6368', dark: '#bdc1c6' },
  { id: 'blue', name: 'Blue', light: '#1a73e8', dark: '#8ab4f8' },
  { id: 'red', name: 'Red', light: '#d93025', dark: '#f28b82' },
  { id: 'yellow', name: 'Yellow', light: '#f9ab00', dark: '#fdd663' },
  { id: 'green', name: 'Green', light: '#1e8e3e', dark: '#81c995' },
  { id: 'pink', name: 'Pink', light: '#d01884', dark: '#ff8bcb' },
  { id: 'purple', name: 'Purple', light: '#9334e6', dark: '#d7aefb' },
  { id: 'cyan', name: 'Cyan', light: '#007b83', dark: '#78d9ec' },
  { id: 'orange', name: 'Orange', light: '#fa903e', dark: '#fcad70' },
]

/** A few icons one click away; the full picker has the rest. */
export const QUICK_ICONS: readonly string[] = ['📌', '⭐', '📚', '💼', '🛠️', '🎨', '🧪', '🏠']

/** A colour id from anywhere (storage, a backup, a marker), or null. */
export function parseStackColor(value: unknown): StackColor | null {
  return typeof value === 'string' && STACK_COLORS.some((c) => c.id === value) ? (value as StackColor) : null
}

export function stackColorUrl(color: StackColor): string {
  return STACK_MARKER_BASE + color
}

/** Any getstackboard.com/stack#… bookmark is a colour marker, a colour we don't know included. */
export function isStackMarker(url: string | undefined): boolean {
  return typeof url === 'string' && /^https:\/\/(www\.)?getstackboard\.com\/stack\/?#/i.test(url)
}

/** The colour a marker carries, or null for anything else. */
export function stackColorFromUrl(url: string | undefined): StackColor | null {
  if (!isStackMarker(url)) return null
  const m = /#c=([a-z]+)$/i.exec(url!)
  return m ? parseStackColor(m[1].toLowerCase()) : null
}

/** A stack folder's colour: its first marker with a colour we know. */
export function stackColorIn(children: readonly { url?: string }[] | undefined): StackColor | null {
  for (const c of children ?? []) {
    const color = stackColorFromUrl(c.url)
    if (color) return color
  }
  return null
}

/** The label behind a stack's title: Chrome's shade for the scheme, and black or white text that clears 4.5:1 on it. */
export function chipColors(color: StackColor, scheme: Scheme): { bg: string; fg: string } {
  const c = STACK_COLORS.find((x) => x.id === color) ?? STACK_COLORS[0]
  const bg = scheme === 'dark' ? c.dark : c.light
  return { bg, fg: onAccentFor(bg) }
}

/** "📚 Reading" as its icon and name; a title with no leading emoji has no icon. */
export function splitStackTitle(title: string): { icon: string | null; name: string } {
  const { emoji, text } = parseBookmarkTitle(title)
  return { icon: emoji, name: text }
}

/** The folder title for an icon and a name: "📚 Reading", or just the name. */
export function buildStackTitle(icon: string | null, name: string): string {
  const n = name.trim()
  const i = (icon ?? '').trim()
  return i && n ? `${i} ${n}` : n || i
}
