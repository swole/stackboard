import { plural } from './importPlan'

// What Pro did on this computer (0.9.0), for the trial-end recap: counters kept in
// chrome.storage.local under `proStats` (lib/proStats.ts bumps them). Nothing here leaves the
// device. Pure, so tests/unit.test.ts covers the parsing and the sentence.

export const STATS_KEY = 'proStats'

export type StatKey = 'archived' | 'snapshots' | 'todosDone' | 'cleaned' | 'tidied'
export type ProStats = Record<StatKey, number>

const KEYS: StatKey[] = ['archived', 'snapshots', 'todosDone', 'cleaned', 'tidied']

/** Whatever is stored, as whole non-negative counts; anything else reads as zero. */
export function readStats(v: unknown): ProStats {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out = {} as ProStats
  for (const k of KEYS) {
    const n = o[k]
    out[k] = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return out
}

export function addStat(s: ProStats, key: StatKey, n = 1): ProStats {
  const add = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  return { ...s, [key]: s[key] + add }
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * "Pro archived 214 tabs, kept 12 snapshots and checked off 9 to-dos." from the counts that
 * aren't zero; null when Pro hasn't done anything yet.
 */
export function statsLine(s: ProStats): string | null {
  const parts: string[] = []
  if (s.archived) parts.push(`archived ${plural(s.archived, 'tab')}`)
  if (s.snapshots) parts.push(`kept ${plural(s.snapshots, 'snapshot')}`)
  if (s.todosDone) parts.push(`checked off ${plural(s.todosDone, 'to-do')}`)
  if (s.cleaned) parts.push(`cleaned up ${plural(s.cleaned, 'link')}`)
  if (s.tidied) parts.push(`tidied ${plural(s.tidied, 'space')}`)
  return parts.length ? `Pro ${joinList(parts)}.` : null
}
