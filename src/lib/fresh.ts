// The "new" accent (0.2.0) marks a link saved in the last day. Links that arrived together
// (a copy from Chrome bookmarks, a starter pack, an undo that recreated a stack) are not news,
// so they stay quiet (0.4.0). One save at a time is always seconds apart; a batch is not.

export const BATCH_MS = 1500

/** For each dateAdded, whether another link in the same stack was added within BATCH_MS. */
export function batchFlags(times: Array<number | undefined>): boolean[] {
  const order = times
    .map((t, i) => [t ?? Number.NaN, i] as const)
    .filter(([t]) => Number.isFinite(t))
    .sort((a, b) => a[0] - b[0])
  const flags = times.map(() => false)
  for (let k = 0; k < order.length; k++) {
    const [t, i] = order[k]
    const near = (j: number) => j >= 0 && j < order.length && Math.abs(order[j][0] - t) <= BATCH_MS
    flags[i] = near(k - 1) || near(k + 1)
  }
  return flags
}
