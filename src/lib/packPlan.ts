// Packed stacks (0.8.0, backlog U1): where each grid item sits when short stacks tuck under the
// stack above them, and (packedMove) where a drag would send them. Pure: no DOM, so
// tests/unit.test.ts covers it. hooks/usePackedGrid.ts measures the stacks and writes the answer
// onto the grid.
//
// Column-stable: stack i stays in column i mod N, the column it has in Rows, and starts one gap
// below the stack above it. Adding a link to one stack never sends another stack to a different
// column, and people find links on a new tab by where they sit.

/** The grid's row height in px: small, so a stack lands within a few px of its spot. */
export const PACK_UNIT = 4

/** Firefox drops grid lines past 10,000, so a board stays well under that. */
export const PACK_MAX_ROWS = 9000

/** A stack that overruns a row by less than this (px) doesn't take another row. */
const SLACK = 0.5

export interface PackPlace {
  /** Grid column line, from 1. */
  column: number
  /** Grid row line the item starts on, from 1. */
  row: number
  /** Rows it spans: its height plus the gap under it, rounded up to whole rows. */
  span: number
}

export interface Pack {
  /** Row height in px: PACK_UNIT, or more on a board too tall for the line limit. */
  unit: number
  places: PackPlace[]
}

/**
 * `heights`: each grid item's height in px, margins included, in board order (the add-stack
 * button last, when it shows). `columns`: how many columns the grid has. `gap`: px between a stack
 * and the one under it, the row gap Rows uses.
 */
export function packPlan(heights: readonly number[], columns: number, gap: number, unit = PACK_UNIT): Pack {
  const n = Number.isFinite(columns) && columns >= 1 ? Math.floor(columns) : 1
  const g = Number.isFinite(gap) && gap > 0 ? gap : 0
  let u = Number.isFinite(unit) && unit > 0 ? unit : PACK_UNIT
  // A huge board doubles the row height until its tallest column fits under the limit.
  for (let tries = 0; ; tries++) {
    const used = new Array<number>(n).fill(0) // rows taken so far in each column
    const places = heights.map((h, i) => {
      const c = i % n
      const span = Math.max(1, Math.ceil(((Number.isFinite(h) && h > 0 ? h : 0) + g - SLACK) / u))
      const place = { column: c + 1, row: used[c] + 1, span }
      used[c] += span
      return place
    })
    if (Math.max(0, ...used) <= PACK_MAX_ROWS || tries >= 20) return { unit: u, places }
    u *= 2
  }
}

/** A stack as it sits now: its top-left corner (any one coordinate space) and its height. */
export interface PackBox {
  left: number
  top: number
  height: number
}

/**
 * The drag preview: where each stack would sit if the one at `from` were dropped at `to`, as a
 * top-left corner in the coordinates of `boxes` (the stacks as packed now, in board order). The
 * would-be order is packed like the board itself, so no two stacks overlap and the drop lands
 * each one exactly there. Indexes off the board leave everything where it is.
 */
export function packedMove(boxes: readonly PackBox[], from: number, to: number, columns: number, gap: number): Array<{ left: number; top: number }> {
  const n = boxes.length
  if (from < 0 || to < 0 || from >= n || to >= n) return boxes.map(({ left, top }) => ({ left, top }))
  const order = boxes.map((_, i) => i)
  order.splice(to, 0, ...order.splice(from, 1))
  const { unit, places } = packPlan(order.map((i) => boxes[i].height), columns, gap)
  // Packed now, stack c of the first row sits in column c, so it gives that column's left edge;
  // the would-be order fills the same columns. The first stack's top is the grid's.
  const at = new Array<{ left: number; top: number }>(n)
  order.forEach((i, j) => {
    const p = places[j]
    at[i] = { left: boxes[p.column - 1].left, top: boxes[0].top + (p.row - 1) * unit }
  })
  return at
}
