import { create } from 'zustand'
import { IS_EXTENSION } from './bookmarks'
import { STACK_MARKER_TITLE, isStackMarker, stackColorUrl, type StackColor } from './stackStylePlan'

// Stack colours (Pro, 0.9.0): the chrome.bookmarks side of stackStylePlan.ts, and the colour the
// "Colour and icon" dialog is showing on its stack while it's open. That preview is how a free user
// tries a colour; the board shows saved colours only while Pro or the trial is on.

interface Preview {
  /** The stack the dialog is open for, or null. */
  id: string | null
  color: StackColor | null
}

export const useStackPreview = create<Preview>(() => ({ id: null, color: null }))

export function previewStackColor(id: string | null, color: StackColor | null = null): void {
  useStackPreview.setState({ id, color })
}

/**
 * Saves a stack's colour as its marker bookmark: the first marker is reused (moved to the colour
 * asked for), any extra ones go, and null removes them all.
 */
export async function setStackColor(stackId: string, color: StackColor | null): Promise<void> {
  if (!IS_EXTENSION) return
  const markers = (await chrome.bookmarks.getChildren(stackId)).filter((c) => isStackMarker(c.url))
  const [keep, ...extra] = markers
  for (const m of color ? extra : markers) await chrome.bookmarks.remove(m.id)
  if (!color) return
  const url = stackColorUrl(color)
  if (!keep) await chrome.bookmarks.create({ parentId: stackId, title: STACK_MARKER_TITLE, url })
  else if (keep.url !== url) await chrome.bookmarks.update(keep.id, { title: STACK_MARKER_TITLE, url })
}
