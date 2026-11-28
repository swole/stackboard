import { WRAPPED_TAGLINE, WRAPPED_URL, count, heroWords, wrappedFacts, wrappedTiles, type WrappedStats } from './wrappedPlan'

// The share picture for "Your 2026 in Stackboard" (0.9.10): a 1080x1350 portrait poster in a
// risograph look, the same inks as the 2 Dec Short (paper, fluorescent pink, blue, yellow): two inks
// printed slightly off register, halftone suns and paper grain. Drawn on a canvas on this computer
// with the system's own fonts, so nothing is fetched; components/Wrapped.tsx saves it as a PNG.
// The sizes keep it readable when a phone shows it a third of its width: no text under 28 px.

export const ART_W = 1080
export const ART_H = 1350

const PAPER = '#f1e9d8'
const PINK = '#ff48b0'
const BLUE = '#0078bf'
const YELLOW = '#ffd900'
const INK = '#2a2430'
/** Where blue and pink overprint: what the two-ink type reads as. */
const NAVY = '#002284'
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const MONO = '"Cascadia Mono", "SF Mono", Menlo, Consolas, "Roboto Mono", "DejaVu Sans Mono", monospace'
const M = 72
const CW = ART_W - 2 * M

type G = CanvasRenderingContext2D

/** A small seeded random source, so the grain comes out the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function setFont(g: G, weight: number, size: number, family: string, spacingEm = 0): void {
  g.font = `${weight} ${size}px ${family}`
  // Chrome 99+; elsewhere the text just keeps its normal spacing.
  ;(g as G & { letterSpacing?: string }).letterSpacing = `${Math.round(spacingEm * size * 10) / 10}px`
}

const EMOJI = /\p{Extended_Pictographic}/u

/**
 * The largest size from `max` down to `min` at which `text` fits `width`; at `min` it's shortened
 * with an ellipsis. A site keeps its end: leading labels go first ("…docs.example.com"), down to its
 * own name ("example.co.uk" keeps three), then letters from the front.
 */
function fit(g: G, text: string, o: { weight: number; family: string; width: number; max: number; min: number; spacing?: number; host?: boolean }): { size: number; text: string } {
  for (let size = o.max; size >= o.min; size -= 2) {
    setFont(g, o.weight, size, o.family, o.spacing)
    if (g.measureText(text).width <= o.width) return { size, text }
  }
  setFont(g, o.weight, o.min, o.family, o.spacing)
  const fits = (t: string) => g.measureText(t).width <= o.width
  if (o.host) {
    const parts = text.split('.')
    const last = parts.length - 1
    const keep = parts.length >= 3 && parts[last].length === 2 && parts[last - 1].length <= 3 ? 3 : 2
    for (let k = parts.length - 1; k >= keep; k--) {
      const t = `…${parts.slice(parts.length - k).join('.')}`
      if (fits(t)) return { size: o.min, text: t }
    }
    const chars = [...text]
    while (chars.length > 1 && !fits(`…${chars.join('')}`)) chars.shift()
    return { size: o.min, text: `…${chars.join('')}` }
  }
  const chars = [...text]
  while (chars.length > 1 && !fits(`${chars.join('')}…`)) chars.pop()
  return { size: o.min, text: `${chars.join('').trimEnd()}…` }
}

/** How far the second ink sits off register, by type size: a real riso drifts a few pixels. */
function drift(size: number): [number, number] {
  return [Math.round(2 + size * 0.036), Math.round(2 + size * 0.03)]
}

/** Text in two inks, the second a little off register; both overprint (multiply), as on a riso. */
function ink2(g: G, text: string, x: number, y: number, main: string, second: string, size: number): void {
  g.save()
  g.globalCompositeOperation = 'multiply'
  if (EMOJI.test(text)) {
    // A colour emoji in a stack name would print twice: one pass, in the overprint colour.
    g.fillStyle = NAVY
    g.fillText(text, x, y)
  } else {
    const [dx, dy] = drift(size)
    g.fillStyle = second
    g.fillText(text, x + dx, y + dy)
    g.fillStyle = main
    g.fillText(text, x, y)
  }
  g.restore()
}

/** A little board of card stacks, for a fact cell that has nothing in it. */
function miniBoard(g: G, x: number, y: number, w: number, h: number): void {
  const cols = 3
  const gap = 18
  const cw = (w - gap * (cols - 1)) / cols
  const counts = [3, 2, 3]
  g.save()
  g.globalCompositeOperation = 'multiply'
  for (let c = 0; c < cols; c++) {
    const cx = x + c * (cw + gap)
    const ink = c % 2 ? PINK : BLUE
    g.fillStyle = ink
    roundRect(g, cx, y, cw, 22, 6)
    g.fill()
    for (let k = 0; k < counts[c]; k++) {
      const cy = y + 34 + k * 46
      if (cy + 36 > y + h) break
      g.strokeStyle = ink
      g.lineWidth = 4
      roundRect(g, cx, cy, cw, 36, 8)
      g.stroke()
      g.fillStyle = c % 2 ? BLUE : PINK
      roundRect(g, cx + 10, cy + 11, 14, 14, 3)
      g.fill()
      g.fillStyle = INK
      g.globalAlpha = 0.7
      roundRect(g, cx + 32, cy + 15, Math.min(cw - 46, 40 + ((c * 3 + k * 7) % 4) * 14), 7, 3.5)
      g.fill()
      g.globalAlpha = 1
    }
  }
  g.restore()
}

/** A halftone disc: dots on a grid, largest at the centre, fading out to the edge. */
function halftone(g: G, cx: number, cy: number, r: number, color: string, step: number, angle: number): void {
  g.save()
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = color
  g.translate(cx, cy)
  g.rotate((angle * Math.PI) / 180)
  for (let y = -r; y <= r; y += step) {
    for (let x = -r; x <= r; x += step) {
      const d = Math.hypot(x, y) / r
      if (d >= 1) continue
      const rad = step * 0.5 * Math.min(1, Math.pow(1 - d, 0.55) * 1.08)
      if (rad < 1.2) continue
      g.beginPath()
      g.arc(x, y, rad, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.restore()
}

/** A browser tab's outline, the motif the Short uses. */
function tabPath(g: G, x: number, y: number, w: number, h: number): void {
  g.beginPath()
  g.moveTo(x, y + h)
  g.lineTo(x + w * 0.07, y + h * 0.2)
  g.quadraticCurveTo(x + w * 0.1, y, x + w * 0.17, y)
  g.lineTo(x + w * 0.83, y)
  g.quadraticCurveTo(x + w * 0.9, y, x + w * 0.93, y + h * 0.2)
  g.lineTo(x + w, y + h)
  g.closePath()
}

function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Stackboard's mark (a board of card stacks), in blue with the pink plate off register. */
function mark(g: G, x: number, y: number, s: number): void {
  const u = s / 128
  // Knocked out of the yellow behind it, as a printer would, so the mark keeps its own two inks.
  g.fillStyle = PAPER
  roundRect(g, x - 8, y - 8, s + 22, s + 21, 30 * u)
  g.fill()
  g.save()
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = PINK
  roundRect(g, x + 6, y + 5, s, s, 26 * u)
  g.fill()
  g.fillStyle = BLUE
  roundRect(g, x, y, s, s, 26 * u)
  g.fill()
  g.restore()
  g.fillStyle = PAPER
  for (const [cx, cy, w, h] of [[18, 20, 16, 26], [18, 50, 16, 18], [44, 20, 16, 18], [44, 42, 16, 18], [44, 64, 16, 18], [70, 20, 16, 32]]) {
    roundRect(g, x + (cx + 4) * u * 1.18, y + (cy + 4) * u * 1.18, w * u * 1.18, h * u * 1.18, 4 * u)
    g.fill()
  }
}

/**
 * Paper grain over everything: dark flecks multiplied in, light flecks where the ink skipped. Two-pixel
 * flecks at a few fixed strengths on a repeating tile, so the PNG stays a sensible size.
 */
function grain(g: G, seed: number): void {
  const size = 192
  const cell = 2
  const tile = document.createElement('canvas')
  tile.width = tile.height = size
  const t = tile.getContext('2d')!
  const rand = rng(seed)
  const fleck = (color: string, density: number, alphas: number[]) => {
    t.clearRect(0, 0, size, size)
    t.fillStyle = color
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        if (rand() >= density) continue
        t.globalAlpha = alphas[Math.floor(rand() * alphas.length)]
        t.fillRect(x, y, cell, cell)
      }
    }
    t.globalAlpha = 1
  }
  fleck('#787878', 0.2, [0.1, 0.18, 0.26])
  g.save()
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = g.createPattern(tile, 'repeat')!
  g.fillRect(0, 0, ART_W, ART_H)
  g.restore()
  fleck(PAPER, 0.06, [0.5, 0.75])
  g.save()
  g.globalCompositeOperation = 'screen'
  g.fillStyle = g.createPattern(tile, 'repeat')!
  g.fillRect(0, 0, ART_W, ART_H)
  g.restore()
}

/** Small capitals in mono, the labels' voice. */
function label(g: G, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', maxWidth?: number): void {
  setFont(g, 700, size, MONO, 0.08)
  g.fillStyle = color
  g.textAlign = align
  g.fillText(text.toUpperCase(), x, y, maxWidth)
  g.textAlign = 'left'
}

/** Splits `text` (set in capitals) into at most two lines that fit `width`; a word too long is shortened. */
function wrapLabel(g: G, text: string, width: number): string[] {
  const words = text.toUpperCase().split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (!line || g.measureText(next).width <= width) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > 2) lines.splice(1, lines.length - 1, `${lines.slice(1).join(' ')}`)
  return lines.map((l) => {
    if (g.measureText(l).width <= width) return l
    const chars = [...l]
    while (chars.length > 1 && g.measureText(`${chars.join('')}…`).width > width) chars.pop()
    return `${chars.join('').trimEnd()}…`
  })
}

/** Draws the year onto `canvas` (sized to ART_W x ART_H). `names`: the busiest stack's name goes on it. */
export function drawWrapped(canvas: HTMLCanvasElement, s: WrappedStats, o: { names: boolean }): void {
  canvas.width = ART_W
  canvas.height = ART_H
  const g = canvas.getContext('2d')!
  g.textBaseline = 'alphabetic'
  g.fillStyle = PAPER
  g.fillRect(0, 0, ART_W, ART_H)

  // Two suns behind the big number, and a small one behind the mark.
  halftone(g, 890, 270, 320, YELLOW, 26, 0)
  halftone(g, 1010, 120, 220, PINK, 24, 15)
  halftone(g, 1020, 1300, 150, YELLOW, 22, 0)

  label(g, `My ${s.year} in Stackboard`, M, 104, 36, BLUE)

  // The big number: links saved this year.
  const hero = fit(g, count(s.saved), { weight: 900, family: SANS, width: CW - 20, max: 270, min: 140, spacing: -0.045 })
  setFont(g, 900, hero.size, SANS, -0.045)
  ink2(g, hero.text, M - 8, 346, PINK, BLUE, hero.size)
  setFont(g, 900, 100, SANS, -0.035)
  ink2(g, heroWords(s), M - 2, 452, BLUE, PINK, 100)

  // A row of tabs, alternating inks, under the number.
  g.save()
  g.globalCompositeOperation = 'multiply'
  const tabs = 6
  const tw = (CW - (tabs - 1) * 14) / tabs
  for (let i = 0; i < tabs; i++) {
    tabPath(g, M + i * (tw + 14), 492, tw, 42)
    if (i % 2) {
      g.fillStyle = PINK
      g.fill()
    } else {
      g.strokeStyle = BLUE
      g.lineWidth = 5
      g.stroke()
    }
  }
  g.restore()

  // The big facts two by two, then the counts in a strip, centred between the tabs and the footer.
  const tiles = wrappedTiles(s, o.names)
  const facts = wrappedFacts(s)
  const ROW = 210
  const STRIP = 156
  const rows = Math.ceil(tiles.length / 2)
  const from = 572
  const room = 1170 - from
  const start = from + Math.max(0, (room - rows * ROW - STRIP) / 2)
  const colW = (CW - 40) / 2
  tiles.forEach((t, i) => {
    const x = M + (i % 2) * (colW + 40)
    const y = start + Math.floor(i / 2) * ROW
    g.save()
    g.globalCompositeOperation = 'multiply'
    g.fillStyle = BLUE
    g.fillRect(x, y, colW, 6)
    g.restore()
    label(g, t.label, x, y + 50, 32, INK, 'left', colW)
    const v = fit(g, t.value, { weight: 900, family: SANS, width: colW - 10, max: 78, min: 38, spacing: -0.03, host: t.key === 'site' || t.key === 'oldest' })
    setFont(g, 900, v.size, SANS, -0.03)
    ink2(g, v.text, x - 2, y + 128, BLUE, PINK, v.size)
    if (t.sub) label(g, t.sub, x, y + 176, 30, INK, 'left', colW)
  })
  // An odd number of facts leaves a cell: a little board fills it.
  if (tiles.length % 2) miniBoard(g, M + colW + 40 + 40, start + (rows - 1) * ROW + 16, colW - 80, 168)

  const stripY = start + rows * ROW + 12
  g.save()
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = INK
  for (let dx = M; dx < ART_W - M; dx += 16) g.fillRect(dx, stripY, 8, 3)
  g.restore()
  const cellW = CW / Math.max(facts.length, 3)
  facts.forEach((f, i) => {
    const x = M + i * cellW
    const v = fit(g, f.value, { weight: 900, family: SANS, width: cellW - 16, max: 66, min: 34, spacing: -0.03 })
    setFont(g, 900, v.size, SANS, -0.03)
    ink2(g, v.text, x - 2, stripY + 76, PINK, BLUE, v.size)
    setFont(g, 700, 28, MONO, 0.05)
    g.fillStyle = INK
    wrapLabel(g, f.label, cellW - 16).forEach((line, k) => g.fillText(line, x, stripY + 116 + k * 33))
  })

  // Where it came from.
  setFont(g, 700, 46, MONO, 0.01)
  g.fillStyle = BLUE
  g.fillText(WRAPPED_URL, M, ART_H - 110)
  setFont(g, 700, 36, SANS, 0)
  g.fillStyle = INK
  g.fillText(WRAPPED_TAGLINE, M, ART_H - 58)
  mark(g, ART_W - M - 100, ART_H - 170, 100)

  grain(g, 2026)
}
