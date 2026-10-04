// Display-only title helpers. The stored bookmark title is never rewritten.

// App names that sites append to page titles, paired with the hosts allowed to use them.
// The favicon already shows the app, so the suffix only costs width in a 260px column.
const APP_SUFFIXES: Array<[host: RegExp, suffix: RegExp]> = [
  [/(^|\.)figma\.com$/, /^figma$/i],
  [/(^|\.)docs\.google\.com$/, /^google (docs|sheets|slides|forms|drawings)$/i],
  [/(^|\.)drive\.google\.com$/, /^google drive$/i],
  [/(^|\.)atlassian\.net$/, /^(jira|confluence)$/i],
  [/(^|\.)sharepoint\.com$/, /^(sharepoint|(microsoft )?(word|excel|powerpoint))( online)?$/i],
  [/(^|\.)teams\.microsoft\.com$/, /^microsoft teams$/i],
  [/(^|\.)outlook\.(office|office365|live)\.com$/, /^outlook$/i],
  [/(^|\.)notion\.(so|site)$/, /^notion$/i],
  [/(^|\.)github\.com$/, /^github$/i],
  [/(^|\.)youtube\.com$/, /^youtube$/i],
]

// "Head <sep> Tail". The tail may not contain a separator, so the split lands on the LAST
// one. Separators need spaces around them, so "Prod-UI-login" stays whole.
// – en dash, — em dash, · middle dot (GitHub uses it).
const LAST_SEGMENT = /^(.+?\S)\s+[-–—|·]\s+([^-–—|·]+?)\s*$/

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function suffixBelongsToHost(suffix: string, host: string): boolean {
  if (!host) return false
  if (APP_SUFFIXES.some(([h, s]) => h.test(host) && s.test(suffix))) return true
  // Generic case: "Stratechery" on stratechery.com, "Mixpanel" on mixpanel.com.
  const labels = host.split('.')
  const site = labels.length >= 2 ? labels[labels.length - 2] : labels[0]
  const squashed = suffix.toLowerCase().replace(/[^a-z0-9]/g, '')
  return squashed.length >= 3 && squashed === site
}

/** "Digital Guidelines – Figma" on figma.com → "Digital Guidelines". */
export function displayTitle(title: string, url: string): string {
  const m = title.match(LAST_SEGMENT)
  if (!m) return title
  const [, head, tail] = m
  if (head.trim().length < 2) return title
  return suffixBelongsToHost(tail.trim(), hostOf(url)) ? head.trim() : title
}

/**
 * Splits a long title so its last word or two stay visible while the start truncates:
 * "ABC Rewards Exp… Design v2". Returns tail '' when the title is short or has no spaces.
 */
export function splitTitle(title: string, maxTail = 12): [head: string, tail: string] {
  if (title.length <= 24) return [title, '']
  const words = title.split(/(?=\s)/) // each piece keeps its leading whitespace
  let tail = ''
  while (words.length > 1) {
    const next = words[words.length - 1] + tail
    if (next.trimStart().length > maxTail) break
    tail = next
    words.pop()
  }
  const head = words.join('')
  if (!tail || head.trim().length < 8) return [title, '']
  return [head, tail]
}
