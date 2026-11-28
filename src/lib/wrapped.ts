import { liveTodoIds } from './folderPlan'
import { prefs } from './prefs'
import { loadList } from './todos'
import type { TodoItem } from './todoPlan'
import type { StackableTree } from './types'
import { parseWrappedMarker, type WrappedMarker } from './wrappedPlan'

// "Your 2026 in Stackboard" (0.9.10): the card's one marker (localStorage stackable:wrapped2026, on this
// computer only) and the board's to-do items for the year's count. The rules are in wrappedPlan.ts.

export function readWrappedMarker(): WrappedMarker {
  return parseWrappedMarker(prefs.wrapped2026())
}

/** Applies `fn` to the stored marker and keeps the result when it changed. */
export function updateWrappedMarker(fn: (m: WrappedMarker) => WrappedMarker): WrappedMarker {
  const now = readWrappedMarker()
  const next = fn(now)
  if (JSON.stringify(next) !== JSON.stringify(now)) prefs.setWrapped2026(JSON.stringify(next))
  return next
}

/** Every to-do item on the board's lists (a list moved inside another stack included); null if storage refuses. */
export async function boardTodos(tree: StackableTree): Promise<TodoItem[] | null> {
  try {
    const lists = await Promise.all(liveTodoIds(tree).map((id) => loadList(id)))
    return lists.flatMap((l) => l.items)
  } catch {
    return null
  }
}
