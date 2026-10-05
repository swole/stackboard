// Keyboard shortcuts on the board: "/" focuses search (0.2.0), 1-9 jump to a space (0.5.0).

/** The space index for keys 1-9, or null for any other key. */
export function spaceIndexForKey(key: string): number | null {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : null
}

/** True while focus is in a text field, where keys belong to the field. */
export function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}
