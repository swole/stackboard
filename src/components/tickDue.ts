import { useAllTodos } from '../lib/allTodos'
import { checkItem, localDay, nextDue, spokenDue, unrollItem } from '../lib/duePlan'
import type { TodoItem } from '../lib/todoPlan'
import { useStackableStore } from '../store/useStackableStore'
import { bumpStat } from '../lib/proStats'

/**
 * Ticks a due to-do from a list App follows (the Today list, and the Today strip since 0.9.0), the
 * same as ticking it in its stack: a repeating item moves to its next date, anything else is done.
 * Both come back with the toast's Undo. Resolves false when the write failed (the error is shown).
 */
export async function tickDue(listId: string, item: TodoItem): Promise<boolean> {
  const store = useStackableStore.getState()
  const { change } = useAllTodos.getState()
  const day = localDay()
  try {
    await change(listId, (l) => checkItem(l, item.id, day, true).list)
  } catch (err) {
    store.reportError('update the to-do', err)
    return false
  }
  if (!item.done) void bumpStat('todosDone') // 0.9.0: the trial-end recap
  if (item.r && item.d) {
    const from = item.d
    const next = nextDue(from, item.r, day, item.md)
    store.showToast({
      verb: 'Done',
      title: item.text,
      detail: `next due ${spokenDue(next, day)}`,
      duration: 6000,
      undo: async () => {
        try {
          await change(listId, (l) => unrollItem(l, item.id, from, next))
        } catch (err) {
          useStackableStore.getState().reportError('put the date back', err)
        }
      },
    })
    return true
  }
  store.showToast({
    verb: 'Done',
    title: item.text,
    duration: 6000,
    undo: async () => {
      try {
        await change(listId, (l) => ({ ...l, items: l.items.map((x) => (x.id === item.id ? { ...x, done: false } : x)) }))
      } catch (err) {
        useStackableStore.getState().reportError('restore the to-do', err)
      }
    },
  })
  return true
}
