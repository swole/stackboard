import type { GoLink } from './managedPlan'
import type { Space } from './types'
import { allLinks } from './folderPlan'

// Go links (Teams T6, 0.8.0): type "go" and a space in the address bar, then a name. Names the
// company's policy sets come first, then every link on the board and in the company spaces, by
// title. Free for everyone. Pure: the omnibox wiring lives in background.ts.

export interface GoEntry {
  /** The policy's short name, for policy go links. */
  name: string | null
  title: string
  url: string
  from: 'policy' | 'company' | 'board'
}

const FROM_RANK: Record<GoEntry['from'], number> = { policy: 0, company: 1, board: 2 }

/** Policy go links, then company links, then the person's own, each address once (the first wins). */
export function goEntries(goLinks: readonly GoLink[], spaces: readonly Space[]): GoEntry[] {
  const out: GoEntry[] = []
  const seen = new Set<string>()
  const add = (e: GoEntry) => {
    if (seen.has(e.url)) return
    seen.add(e.url)
    out.push(e)
  }
  for (const g of goLinks) add({ name: g.name, title: g.name, url: g.url, from: 'policy' })
  const ordered = [...spaces.filter((s) => s.company), ...spaces.filter((s) => !s.company)]
  for (const s of ordered) {
    for (const st of s.stacks) {
      // Links in the folders inside a stack (0.8.0) count too, after the stack's own.
      for (const b of allLinks(st)) {
        if (!/^https?:/i.test(b.url)) continue
        add({ name: null, title: b.title || b.url, url: b.url, from: s.company ? 'company' : 'board' })
      }
    }
  }
  return out
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** True when what was typed matches a policy go link's own name (exactly, its start, or every word). */
function nameMatches(e: GoEntry, q: string, qWords: string[]): boolean {
  const name = e.name
  if (!name) return false
  return name === q || name.startsWith(q) || (qWords.length > 0 && qWords.every((w) => name.includes(w)))
}

/** Lower is better; null means no match. */
function score(e: GoEntry, q: string, qWords: string[]): number | null {
  const hits: number[] = []
  const name = e.name
  if (name) {
    if (name === q) hits.push(0)
    else if (name.startsWith(q)) hits.push(1)
    else if (qWords.length && qWords.every((w) => name.includes(w))) hits.push(4)
  }
  const t = e.title.toLowerCase()
  if (t === q) hits.push(2)
  const tWords = words(e.title)
  if (qWords.length && qWords.every((w) => tWords.some((tw) => tw.startsWith(w)))) hits.push(3)
  else if (t.includes(q)) hits.push(4)
  else if (host(e.url).includes(q)) hits.push(5)
  return hits.length ? Math.min(...hits) : null
}

/**
 * The best matches for what was typed after "go". A policy go link whose name matches always comes
 * first: the company named it for exactly this. Then exact titles, word starts and anywhere, and at
 * the same strength company links come before the person's own.
 */
export function rankGo(query: string, entries: readonly GoEntry[], limit = 5): GoEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries.filter((e) => e.from === 'policy').slice(0, limit)
  const qWords = words(q)
  return entries
    .map((e, i) => ({ e, i, s: score(e, q, qWords), named: nameMatches(e, q, qWords) }))
    .filter((x): x is { e: GoEntry; i: number; s: number; named: boolean } => x.s !== null)
    .sort((a, b) => Number(b.named) - Number(a.named) || a.s - b.s || FROM_RANK[a.e.from] - FROM_RANK[b.e.from] || a.e.title.length - b.e.title.length || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.e)
}

/** The omnibox reads its descriptions as XML. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** "<match>Jira</match> board <dim>go/jira</dim> <url>jira.example.com</url>": the typed part highlighted once. */
export function goDescription(e: GoEntry, query: string): string {
  const q = query.trim()
  const label = e.name ? `go/${e.name}` : e.title
  const at = q ? label.toLowerCase().indexOf(q.toLowerCase()) : -1
  const shown =
    at < 0
      ? escapeXml(label)
      : `${escapeXml(label.slice(0, at))}<match>${escapeXml(label.slice(at, at + q.length))}</match>${escapeXml(label.slice(at + q.length))}`
  const where = e.from === 'board' ? 'Your board' : 'From your company'
  return `${shown} <dim>${escapeXml(where)}</dim> <url>${escapeXml(host(e.url) || e.url)}</url>`
}

export function goSuggestions(query: string, entries: readonly GoEntry[], limit = 5): { content: string; description: string }[] {
  return rankGo(query, entries, limit).map((e) => ({ content: e.url, description: goDescription(e, query) }))
}

/** A full web address someone typed or picked from the suggestions. */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

/** The omnibox's disposition as chrome.search.query names it (a background tab is a new tab there). */
export function searchDisposition(omnibox: string): 'CURRENT_TAB' | 'NEW_TAB' {
  return omnibox === 'currentTab' ? 'CURRENT_TAB' : 'NEW_TAB'
}

/** A board search link: the new tab opens with the search filled in. */
export function searchHash(text: string): string {
  return `#search=${encodeURIComponent(text.trim())}`
}

export function readSearchHash(hash: string): string | null {
  const m = /^#search=(.*)$/.exec(hash)
  if (!m) return null
  try {
    const q = decodeURIComponent(m[1]).trim()
    return q ? q.slice(0, 200) : null
  } catch {
    return null
  }
}
