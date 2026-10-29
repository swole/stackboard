import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Stack } from '../lib/types'
import {
  TODO_MAX_TEXT,
  addItem,
  editItem,
  ordered,
  removeItem,
  restoreItem,
  toggleItem,
  type TodoList,
} from '../lib/todoPlan'
import { useStackableStore } from '../store/useStackableStore'

interface Props {
  stack: Stack
  list: TodoList | null
  change: (what: string, fn: (l: TodoList) => TodoList) => Promise<boolean>
  /** Changes when the stack is revealed (just created, sidebar jump): an empty list takes focus. */
  revealSeq: number
}

// The body of a to-do stack (0.6.0): open items, then done ones, then an always-there input.
// Enter adds and keeps focus for the next one; double-click edits; delete has the usual undo.
export function TodoItems({ stack, list, change, revealSeq }: Props) {
  const showToast = useStackableStore((s) => s.showToast)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const items = list ? ordered(list.items) : []
  const empty = !!list && list.items.length === 0

  useEffect(() => {
    if (revealSeq && empty) inputRef.current?.focus()
  }, [revealSeq, empty])

  const onAdd = async () => {
    const text = draft
    if (!text.trim()) return
    // Clear before the write lands so fast typing starts a fresh item; a failed save gives the text back.
    setDraft('')
    if (!(await change('add the to-do', (l) => addItem(l, text, Date.now()))))
      setDraft((d) => d || text)
  }

  const onDelete = (id: string) => {
    if (!list) return
    const index = list.items.findIndex((it) => it.id === id)
    const item = list.items[index]
    if (!item) return
    void change('delete the to-do', (l) => removeItem(l, id))
    showToast({
      verb: 'Deleted',
      title: item.text,
      duration: 7000,
      undo: async () => {
        await change('restore the to-do', (l) => restoreItem(l, item, index))
      },
    })
  }

  return (
    <>
      {items.map((it) => (
        <div
          key={it.id}
          data-todo-item={it.done ? 'done' : 'open'}
          className="group/todo flex items-start gap-2 rounded-lg bg-card px-2.5 py-2 text-sm compact:py-1 wallpaper:bg-card/70"
        >
          <button
            role="checkbox"
            aria-checked={it.done}
            aria-label={it.done ? `Mark "${it.text}" as not done` : `Mark "${it.text}" as done`}
            data-todo-toggle
            onClick={() => void change('update the to-do', (l) => toggleItem(l, it.id))}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              it.done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong hover:border-accent'
            }`}
          >
            {it.done && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
          {editing === it.id ? (
            <input
              autoFocus
              defaultValue={it.text}
              maxLength={TODO_MAX_TEXT}
              aria-label="Edit to-do"
              className="min-w-0 flex-1 bg-transparent text-fg focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setEditing(null)
                }
              }}
              onBlur={(e) => {
                const text = e.currentTarget.value
                setEditing(null)
                if (text !== it.text) void change('edit the to-do', (l) => editItem(l, it.id, text))
              }}
            />
          ) : (
            <span
              onDoubleClick={() => setEditing(it.id)}
              title="Double-click to edit"
              className={`min-w-0 flex-1 cursor-text [overflow-wrap:anywhere] ${it.done ? 'text-faint line-through' : 'text-fg'}`}
            >
              {it.text}
            </span>
          )}
          <button
            onClick={() => onDelete(it.id)}
            aria-label={`Delete "${it.text}"`}
            data-todo-delete
            className="mt-0.5 shrink-0 rounded text-faint opacity-0 hover:text-danger focus-visible:opacity-100 group-hover/todo:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <input
        ref={inputRef}
        value={draft}
        maxLength={TODO_MAX_TEXT}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void onAdd()
          if (e.key === 'Escape') {
            setDraft('')
            e.currentTarget.blur()
          }
        }}
        placeholder="Add a to-do"
        aria-label={`Add a to-do to ${stack.title}`}
        data-todo-input
        // Quiet at rest like "Add bookmark": the dashed outline shows on hover, focus, or an empty list.
        className={`mt-1 w-full rounded-lg border border-dashed bg-transparent px-2.5 py-2 text-xs text-fg placeholder:text-muted hover:border-accent-line focus:border-focus focus:outline-none compact:py-1.5 ${
          empty ? 'border-line-strong' : 'border-transparent group-hover/stack:border-line-strong'
        }`}
      />
    </>
  )
}
