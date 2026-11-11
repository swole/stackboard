// One free AI tidy per person (0.9.5, the maintainer's go 10 Nov 2026): the daily budget every free run
// shares. Pure, with no imports, so tests/unit.test.ts checks the arithmetic. site/api/tidy.js counts
// today's markers before a free run and writes one after it went through: private Blob files under
// free-tidy/<UTC day>/, each named by its run's link count (free-tidy/2026-11-12/137-<random>.json)
// and holding only { at, links }, nothing about the person or the links. The extension keeps track of
// who has had theirs; nothing here can tell people apart.

/** Free runs a UTC day, for everyone together (FREE_TIDY_RUNS overrides it, and 0 stops free runs). */
export const FREE_RUNS = 300
/** ...and the links they may carry in total (FREE_TIDY_LINKS). */
export const FREE_LINKS = 30000

const PREFIX = 'free-tidy/'

/** "2026-11-12": the UTC day a run counts towards. */
export function freeDay(now) {
  return new Date(now).toISOString().slice(0, 10)
}

/** The folder a day's markers sit in, as list()'s prefix. */
export function dayPrefix(day) {
  return `${PREFIX}${day}/`
}

/** A marker's pathname before the store adds its random suffix: the day's folder, then the link count. */
export function markerPath(day, links) {
  return `${dayPrefix(day)}${links}.json`
}

/** The link count a marker's pathname carries; a name without one counts no links (the run still counts). */
export function markerLinks(pathname) {
  const m = /\/(\d+)(?:-[^/]*)?\.json$/.exec(String(pathname))
  return m ? Number(m[1]) : 0
}

/** The day so far, from its markers' pathnames: how many free runs, and how many links they carried. */
export function tally(pathnames) {
  return { runs: pathnames.length, links: pathnames.reduce((n, p) => n + markerLinks(p), 0) }
}

/** The budget: the defaults, or a whole number of 0 or more from FREE_TIDY_RUNS and FREE_TIDY_LINKS. */
export function readBudget(env = {}) {
  const num = (v, fallback) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : fallback)
  return { runs: num(env.FREE_TIDY_RUNS, FREE_RUNS), links: num(env.FREE_TIDY_LINKS, FREE_LINKS) }
}

/** True when one more run of `links` links stays within the day's budget. */
export function fits(used, links, budget) {
  return used.runs + 1 <= budget.runs && used.links + links <= budget.links
}
