import { useLayoutEffect, useRef, type RefObject } from 'react'
import { rectSortingStrategy, type SortingStrategy } from '@dnd-kit/sortable'
import { packedMove, packPlan, type PackPlace } from '../lib/packPlan'

// Packed stacks (0.8.0, backlog U1). In Rows the stack grid is a plain CSS grid, so each row is as
// tall as its tallest stack and a short stack leaves a gap under it. Packed keeps that grid (the
// auto-fill columns, density, tile sizes and the wallpaper look all still apply) but turns its rows
// into a 4px unit with no gap, and gives each grid item a column, a row to start on and a span: its
// height plus the gap Rows puts between stacks (--stack-gap in index.css). lib/packPlan.ts does
// the sums.
//
// The placement is written onto the elements from a layout effect and from ResizeObserver
// callbacks, so it lands before paint and no stack re-renders. React leaves these properties alone:
// a stack's style prop only carries dnd-kit's transform and transition. DOM order and parents never
// change, so a drag in progress keeps its nodes.

/** <html> attributes behind the gap and the columns: density, wallpaper, tile size. */
const WATCHED = ['data-density', 'data-bg', 'data-tile']

/** The packing on screen, for the drag preview. */
export interface PackedGrid {
  columns: number
  gap: number
}

/**
 * Packs the grid's children while `on`. `items` names them in order (stack ids, plus the add-stack
 * button): when it changes, the grid is measured again and the new children are watched. Returns
 * the packing on screen, null while the grid isn't packed.
 */
export function usePackedGrid(gridRef: RefObject<HTMLElement | null>, on: boolean, items: string): RefObject<PackedGrid | null> {
  const packing = useRef<PackedGrid | null>(null)
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!on || !grid || typeof ResizeObserver === 'undefined') return
    const kids = () => Array.from(grid.children) as HTMLElement[]
    const placed = new WeakMap<HTMLElement, string>()
    let widest = 0 // the highest column an item sits in

    const unplace = (el: HTMLElement) => {
      placed.delete(el)
      el.style.removeProperty('grid-column')
      el.style.removeProperty('grid-row')
    }
    const place = (el: HTMLElement, p: PackPlace) => {
      const key = `${p.column} ${p.row} ${p.span}`
      if (placed.get(el) === key) return // unchanged: no style write, no layout
      placed.set(el, key)
      el.style.gridColumn = String(p.column)
      el.style.gridRow = `${p.row} / span ${p.span}`
    }

    const pack = () => {
      const els = kids()
      if (!els.length) return
      const cs = getComputedStyle(grid)
      // A column the grid no longer has (the window got narrower) still shows up as a track while
      // an item sits in it, but at 0px (grid-auto-columns below), so it doesn't count.
      const columns = cs.gridTemplateColumns.split(' ').filter((t) => parseFloat(t) > 0).length || 1
      // An item in such a column measures at a width of 0: let everything flow back in first.
      if (widest > columns) for (const el of els) unplace(el)
      const gap = parseFloat(cs.getPropertyValue('--stack-gap')) || 0
      const { unit, places } = packPlan(els.map(outerHeight), columns, gap)
      if (grid.style.gridAutoRows !== `${unit}px`) {
        grid.style.rowGap = '0px'
        grid.style.gridAutoRows = `${unit}px`
        grid.style.gridAutoColumns = '0px'
      }
      if (grid.getAttribute('data-packed') !== String(columns)) grid.setAttribute('data-packed', String(columns))
      els.forEach((el, i) => place(el, places[i]))
      widest = Math.min(columns, els.length)
      if (packing.current?.columns !== columns || packing.current.gap !== gap) packing.current = { columns, gap }
    }

    pack()
    // Links added or removed, to-dos, a new width (window, sidebar, tile size): every stack is
    // watched, and a new width resizes them all. Moving a stack never resizes it, so packing
    // doesn't feed back into these. The scroll area is watched too, by its border box, which
    // packing never changes (a taller board only scrolls): it comes first in a resize, so the
    // stacks that a lost column had squeezed get another callback in the same frame, without a
    // "ResizeObserver loop" notice.
    const sizes = new ResizeObserver(pack)
    if (grid.parentElement) sizes.observe(grid.parentElement, { box: 'border-box' })
    for (const el of kids()) sizes.observe(el)
    const theme = new MutationObserver(pack)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: WATCHED })
    return () => {
      sizes.disconnect()
      theme.disconnect()
      for (const el of kids()) unplace(el)
      for (const p of ['row-gap', 'grid-auto-rows', 'grid-auto-columns']) grid.style.removeProperty(p)
      grid.removeAttribute('data-packed')
      packing.current = null
    }
  }, [gridRef, on, items])
  return packing
}

/**
 * The stacks' sorting strategy in Packed. While a stack is dragged, every stack moves to its slot
 * in the would-be order (packedMove), so the preview never overlaps and shows the board the drop
 * makes. dnd-kit's rects are the stacks as packed when the drag started, and every stack in a
 * render gets the same array, so the order is packed once per new target. Rows keeps
 * rectSortingStrategy, and so does a grid that isn't packed yet.
 */
export function packedSorting(packing: RefObject<PackedGrid | null>): SortingStrategy {
  let last: { rects: unknown; from: number; to: number; grid: PackedGrid; at: Array<{ left: number; top: number }> } | null = null
  return (args) => {
    const grid = packing.current
    if (!grid) return rectSortingStrategy(args)
    const { rects, activeIndex, overIndex, index } = args
    if (!last || last.rects !== rects || last.from !== activeIndex || last.to !== overIndex || last.grid !== grid) {
      last = { rects, from: activeIndex, to: overIndex, grid, at: packedMove(rects, activeIndex, overIndex, grid.columns, grid.gap) }
    }
    const now = rects[index]
    const to = last.at[index]
    if (!now || !to) return null
    return { x: to.left - now.left, y: to.top - now.top, scaleX: 1, scaleY: 1 }
  }
}

/** Height in px with the margins, which sit inside the item's grid area too. */
function outerHeight(el: HTMLElement): number {
  const s = getComputedStyle(el)
  return el.getBoundingClientRect().height + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0)
}
