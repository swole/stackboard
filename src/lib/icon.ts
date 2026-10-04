const DEFAULT_EMOJI = '⚡'

// Use Intl.Segmenter to grab the first grapheme (handles ZWJ emoji like 👨‍👩‍👧).
function firstGrapheme(s: string): string | null {
  if (!s) return null
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const iter = seg.segment(s)[Symbol.iterator]()
    const first = iter.next()
    if (first.done) return null
    return first.value.segment
  } catch {
    return s[0] ?? null
  }
}

function isLikelyEmoji(s: string): boolean {
  if (!s) return false
  // Extended_Pictographic excludes digits and basic symbols — good fit for "is this a real emoji".
  return /\p{Extended_Pictographic}/u.test(s)
}

export function parseSpaceTitle(rawTitle: string): { emoji: string; name: string } {
  const trimmed = rawTitle.trim()
  const first = firstGrapheme(trimmed)
  if (first && isLikelyEmoji(first)) {
    const rest = trimmed.slice(first.length).trim()
    return { emoji: first, name: rest || trimmed }
  }
  return { emoji: DEFAULT_EMOJI, name: trimmed }
}

/**
 * Bookmarks follow the same convention as spaces: a title that starts with an emoji
 * ("💎 Crown Jewel") shows that emoji as its icon. Returns emoji null when there isn't one.
 */
export function parseBookmarkTitle(rawTitle: string): { emoji: string | null; text: string } {
  const trimmed = rawTitle.trim()
  const first = firstGrapheme(trimmed)
  if (first && isLikelyEmoji(first)) {
    const rest = trimmed.slice(first.length).trim()
    if (rest) return { emoji: first, text: rest }
  }
  return { emoji: null, text: trimmed }
}

export function buildSpaceTitle(emoji: string, name: string): string {
  const e = (emoji ?? '').trim() || DEFAULT_EMOJI
  const n = (name ?? '').trim()
  return `${e} ${n}`
}

export { DEFAULT_EMOJI }
