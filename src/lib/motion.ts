// One-off animations driven from effects (drop glow, jump-to-stack pulse, fresh saves).
// Web Animations API, so nothing has to add and remove classes to replay them.

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A peach ring that swells out and fades. */
export function glow(el: HTMLElement | null, delay = 0): void {
  if (!el || reducedMotion() || typeof el.animate !== 'function') return
  el.animate(
    [
      { boxShadow: '0 0 0 0 rgb(236 143 79 / 0)' },
      { boxShadow: '0 0 0 3px rgb(236 143 79 / 0.55)', offset: 0.2 },
      { boxShadow: '0 0 0 9px rgb(236 143 79 / 0)' },
    ],
    { duration: 950, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  )
}
