import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Check, X } from 'lucide-react'
import type { Stack } from '../lib/types'
import {
  TODO_MAX_TEXT,
  addItem,
  editItem,
  newTodoId,
  ordered,
  removeItem,
  restoreItem,
  type TodoItem,
  type TodoList,
} from '../lib/todoPlan'
import { checkItem, localDay, nextDue, setDue, setRepeat, spokenDue, unrollItem } from '../lib/duePlan'
import { usePro } from '../lib/pro'
import { hasPro } from '../lib/proPlan'
import { useToday } from '../lib/today'
import { useStackableStore } from '../store/useStackableStore'

/**
 * After a tick, the same item ignores more ticks until its write lands and this long after: a
 * double-click on a repeating item would otherwise skip a date.
 */
export const TICK_GUARD_MS = 700
import { DueChip } from './DueChip'
import { DueMenu } from './DueMenu'

interface Props {
  stack: Stack
  list: TodoList | null
  change: (what: string, fn: (l: TodoList) => TodoList) => Promise<boolean>
  /** Changes when the stack is revealed (just created, sidebar jump): an empty list takes focus. */
  revealSeq: number
}

// The body of a to-do stack (0.6.0): open items, then done ones, then an always-there input.
// Enter adds and keeps focus for the next one; double-click edits; delete has the usual undo.
// 0.7.1 (Pro): a date and a repeat per item. Without Pro the controls stay off the board, dates
// already set keep showing, and a repeating item ticks off like any other.
export function TodoItems({ stack, list, change, revealSeq }: Props) {
  const showToast = useStackableStore((s) => s.showToast)
  const proOn = usePro((s) => s.ready && hasPro(s.state))
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [dating, setDating] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const ticking = useRef(new Set<string>())
  const items = list ? ordered(list.items) : []
  const empty = !!list && list.items.length === 0
  const today = useToday((s) => s.day)

  useEffect(() => {
    if (revealSeq && empty) inputRef.current?.focus()
  }, [revealSeq, empty])

  const onAdd = async () => {
    const text = draft
    if (!text.trim()) return
    // Clear before the write lands so fast typing starts a fresh item; a failed save gives the text back.
    setDraft('')
    // One id and time for the shown and the stored copy, so a tick right after adding finds it
    const itemId = newTodoId()
    const at = Date.now()
    if (!(await change('add the to-do', (l) => addItem(l, text, at, itemId))))
      setDraft((d) => d || text)
  }

  const onToggle = async (it: TodoItem) => {
    if (ticking.current.has(it.id)) return
    ticking.current.add(it.id)
    try {
      const day = localDay()
      const rolls = proOn && !it.done && !!it.r && !!it.d
      const ok = await change('update the to-do', (l) => checkItem(l, it.id, day, proOn).list)
      if (ok && rolls) {
        const from = it.d!
        const next = nextDue(from, it.r!, day, it.md)
        showToast({
          verb: 'Done',
          title: it.text,
          detail: `next due ${spokenDue(next, day)}`,
          duration: 6000,
          undo: async () => {
            await change('put the date back', (l) => unrollItem(l, it.id, from, next))
          },
        })
      }
    } finally {
      setTimeout(() => ticking.current.delete(it.id), TICK_GUARD_MS)
    }
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
          className="group/todo relative flex items-start gap-2 rounded-lg bg-card px-2.5 py-2 text-sm compact:py-1 wallpaper:bg-card/70"
        >
          <button
            role="checkbox"
            aria-checked={it.done}
            aria-label={it.done ? `Mark "${it.text}" as not done` : `Mark "${it.text}" as done`}
            data-todo-toggle
            onClick={() => void onToggle(it)}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              it.done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong hover:border-accent'
            }`}
          >
            {it.done && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
                className={`min-w-0 cursor-text [overflow-wrap:anywhere] ${it.done ? 'text-faint line-through' : 'text-fg'}`}
              >
                {it.text}
              </span>
            )}
            {it.d && !it.done && (
              <DueChip due={it.d} repeat={it.r} today={today} onClick={proOn ? () => setDating(it.id) : undefined} />
            )}
          </div>
          {proOn && !it.done && (
            <button
              onClick={() => setDating((d) => (d === it.id ? null : it.id))}
              aria-label={`Set a date for "${it.text}"`}
              title="Due date and repeat"
              data-todo-due-button
              className={`mt-0.5 shrink-0 rounded text-faint hover:text-fg focus-visible:opacity-100 group-hover/todo:opacity-100 ${
                dating === it.id ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(it.id)}
            aria-label={`Delete "${it.text}"`}
            data-todo-delete
            className="mt-0.5 shrink-0 rounded text-faint opacity-0 hover:text-danger focus-visible:opacity-100 group-hover/todo:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {proOn && dating === it.id && (
            <DueMenu
              due={it.d}
              repeat={it.r}
              today={today}
              onDue={(day) => void change('set the date', (l) => setDue(l, it.id, day))}
              onRepeat={(r) => void change('set the repeat', (l) => setRepeat(l, it.id, r, localDay()))}
              onClose={() => setDating(null)}
            />
          )}
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
