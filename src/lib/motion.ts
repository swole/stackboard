// One-off animations driven from effects (drop glow, jump-to-stack pulse, fresh saves).
// Web Animations API, so nothing has to add and remove classes to replay them.

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The palette's accent at this element, as "r g b" (Web Animations can't read CSS variables). */
function accentRgb(el: HTMLElement): string {
  const hex = getComputedStyle(el).getPropertyValue('--sb-accent-mark').trim()
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '236 143 79'
}

/** A ring in the palette's accent that swells out and fades. */
export function glow(el: HTMLElement | null, delay = 0): void {
  if (!el || reducedMotion() || typeof el.animate !== 'function') return
  const rgb = accentRgb(el)
  el.animate(
    [
      { boxShadow: `0 0 0 0 rgb(${rgb} / 0)` },
      { boxShadow: `0 0 0 3px rgb(${rgb} / 0.55)`, offset: 0.2 },
      { boxShadow: `0 0 0 9px rgb(${rgb} / 0)` },
    ],
    { duration: 950, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  )
}
