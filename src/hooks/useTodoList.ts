import { useCallback, useEffect, useState } from 'react'
import type { TodoList } from '../lib/todoPlan'
import { loadList, updateList, watchList } from '../lib/todos'
import { useStackableStore } from '../store/useStackableStore'

/**
 * A to-do stack's items, kept in step with storage (other tabs, other devices). `change`
 * shows the edit at once and writes it; a failed write puts the stored copy back and says why.
 * A null id (a links stack) loads nothing.
 */
export function useTodoList(id: string | null) {
  const [list, setList] = useState<TodoList | null>(null)

  useEffect(() => {
    if (!id) return
    let live = true
    void loadList(id).then((l) => live && setList(l))
    const stop = watchList(id, (l) => live && setList(l))
    return () => {
      live = false
      stop()
    }
  }, [id])

  const change = useCallback(
    async (what: string, fn: (l: TodoList) => TodoList): Promise<boolean> => {
      if (!id) return false
      try {
        setList((l) => {
          try {
            return l ? fn(l) : l
          } catch {
            return l // a full list: updateList throws the same error below and reports it
          }
        })
        setList(await updateList(id, fn))
        return true
      } catch (err) {
        useStackableStore.getState().reportError(what, err)
        setList(await loadList(id))
        return false
      }
    },
    [id],
  )

  return { list, change }
}
