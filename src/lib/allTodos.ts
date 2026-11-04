import { create } from 'zustand'
import type { TodoList } from './todoPlan'
import { loadList, updateList, watchList } from './todos'

// Every to-do list on the board, kept live (Pro, 0.7.1): the Today list and its count in the
// sidebar read them. Each to-do stack still loads its own copy (useTodoList); both follow
// storage, so they always agree. App tracks the board's list ids only while Pro is on.

interface AllTodos {
  lists: Record<string, TodoList>
  /** Follow exactly these list ids: new ones load and watch, gone ones stop. */
  track: (ids: string[]) => void
  /** Shows the edit at once, then writes it; a failed write reloads the stored copy and rethrows. */
  change: (id: string, fn: (l: TodoList) => TodoList) => Promise<void>
}

const stops = new Map<string, () => void>()

export const useAllTodos = create<AllTodos>((set, get) => ({
  lists: {},

  track: (ids) => {
    const want = new Set(ids)
    let dropped = false
    for (const [id, stop] of stops) {
      if (want.has(id)) continue
      stop()
      stops.delete(id)
      dropped = true
    }
    if (dropped) set((s) => ({ lists: Object.fromEntries(Object.entries(s.lists).filter(([id]) => want.has(id))) }))
    for (const id of want) {
      if (stops.has(id)) continue
      const put = (l: TodoList) => {
        if (stops.has(id)) set((s) => ({ lists: { ...s.lists, [id]: l } }))
      }
      stops.set(id, watchList(id, put))
      void loadList(id).then(put)
    }
  },

  change: async (id, fn) => {
    const now = get().lists[id]
    if (now) {
      try {
        set((s) => ({ lists: { ...s.lists, [id]: fn(now) } }))
      } catch {
        // a full list: updateList throws the same error below
      }
    }
    try {
      const saved = await updateList(id, fn)
      set((s) => ({ lists: { ...s.lists, [id]: saved } }))
    } catch (err) {
      const stored = await loadList(id)
      set((s) => ({ lists: { ...s.lists, [id]: stored } }))
      throw err
    }
  },
}))
