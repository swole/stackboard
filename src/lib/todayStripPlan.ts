// The Today strip (Pro, 0.9.0): one line above the board with a focus for the day and the to-dos
// due today or earlier. Pure, so tests/unit.test.ts covers it. The strip itself is
// components/TodayStrip.tsx; storage lives in todayStrip.ts.

/** Longest focus line, in characters (code points, so emoji stay whole). */
export const FOCUS_MAX = 140

/** Due to-dos shown in the strip before "+N more". */
export const STRIP_SHOWN = 3

/** sync `todayFocus` = { day, text }: the text when it was written today, else ''. */
export function focusFor(stored: unknown, today: string): string {
  const v = stored as { day?: unknown; text?: unknown } | null | undefined
  if (!v || v.day !== today || typeof v.text !== 'string') return ''
  return cleanFocus(v.text)
}

/** One line, trimmed, at most FOCUS_MAX characters. */
export function cleanFocus(text: string): string {
  return [...text.replace(/\s+/g, ' ').trim()].slice(0, FOCUS_MAX).join('')
}

/** sync `todayStrip` = { on: true } while the strip is switched on. */
export function stripOn(stored: unknown): boolean {
  return (stored as { on?: unknown } | null | undefined)?.on === true
}

/** The first few entries and how many more there are. */
export function stripShown<T>(entries: readonly T[], max = STRIP_SHOWN): { shown: T[]; more: number } {
  return { shown: entries.slice(0, max), more: Math.max(0, entries.length - max) }
}
