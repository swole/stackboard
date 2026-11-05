import { useMemo, useRef, useState } from 'react'
import { CalendarCheck, Check } from 'lucide-react'
import { useAllTodos } from '../lib/allTodos'
import { dueToday, isOverdue } from '../lib/duePlan'
import { usePro } from '../lib/pro'
import { hasPro } from '../lib/proPlan'
import type { TodoItem } from '../lib/todoPlan'
import { useToday } from '../lib/today'
import { useFocus, useTodayStrip } from '../lib/todayStrip'
import { FOCUS_MAX, stripShown } from '../lib/todayStripPlan'
import { useStackableStore } from '../store/useStackableStore'
import { TICK_GUARD_MS } from './TodoItems'
import { tickDue } from './tickDue'

/** A ticked to-do stays in the strip, ticked, this long before it leaves. */
const LINGER_MS = 1000

interface Lingering {
  listId: string
  item: TodoItem
  index: number
}

/**
 * The Today strip (Pro, 0.9.0): one line above the board on every space while it's switched on in
 * Settings. A focus for the day, written in place, then the to-dos due today or earlier from every
 * list on the board, earliest first; ticking one is the same as ticking it in its stack. "+N more"
 * opens the Today list.
 */
export function TodayStrip() {
  const proOn = usePro((s) => s.ready && hasPro(s.state))
  const on = useTodayStrip((s) => s.on)
  const setFocus = useTodayStrip((s) => s.setFocus)
  const today = useToday((s) => s.day)
  const focus = useFocus(today)
  const tree = useStackableStore((s) => s.tree)
  const showToday = useStackableStore((s) => s.showToday)
  const lists = useAllTodos((s) => s.lists)
  const [draft, setDraft] = useState<string | null>(null)
  const [lingering, setLingering] = useState<Record<string, Lingering>>({})
  const ticking = useRef(new Set<string>())

  // Board order, then earliest date first (dueToday), so the strip agrees with the Today list.
  const entries = useMemo(() => {
    const boardLists = (tree?.spaces ?? []).flatMap((sp) =>
      sp.stacks.flatMap((st) => (st.todo ? [{ listId: st.todo.id, list: lists[st.todo.id] ?? null }] : [])),
    )
    const due = dueToday(boardLists, today).map((e) => ({ ...e, ticked: !!lingering[e.item.id] }))
    for (const l of Object.values(lingering)) {
      if (due.some((d) => d.item.id === l.item.id)) continue
      due.splice(Math.min(l.index, due.length), 0, { listId: l.listId, item: l.item, ticked: true })
    }
    return due
  }, [tree, lists, today, lingering])

  if (!proOn || !on) return null
  const { shown, more } = stripShown(entries)

  const commit = () => {
    if (draft !== null && draft.trim() !== focus) void setFocus(draft)
    setDraft(null)
  }

  const tick = async (listId: string, item: TodoItem, index: number) => {
    if (ticking.current.has(item.id)) return
    ticking.current.add(item.id)
    setLingering((s) => ({ ...s, [item.id]: { listId, item, index } }))
    setTimeout(() => setLingering(({ [item.id]: _gone, ...rest }) => rest), LINGER_MS)
    try {
      await tickDue(listId, item)
    } finally {
      setTimeout(() => ticking.current.delete(item.id), TICK_GUARD_MS)
    }
  }

  return (
    <div data-today-strip className="px-8 pb-4 compact:px-6 compact:pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-well px-3 py-2 text-sm compact:py-1.5 wallpaper:bg-panel/55 wallpaper:backdrop-blur-xl">
        <span className="flex shrink-0 items-center gap-1.5 font-semibold text-strong">
          <CalendarCheck className="h-4 w-4 text-accent-text" />
          Today
        </span>
        <input
          data-today-focus
          value={draft ?? focus}
          maxLength={FOCUS_MAX}
          onFocus={() => setDraft(focus)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraft(null)
              // Blur after the value goes back, so the blur doesn't save the edit.
              const el = e.currentTarget
              setTimeout(() => el.blur(), 0)
            }
          }}
          placeholder="What's your focus today?"
          aria-label="Your focus today"
          className="min-w-48 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-fg placeholder:text-faint hover:border-line focus:border-focus focus:bg-card focus:outline-none"
        />
        {shown.map(({ listId, item, ticked }, index) => (
          <span
            key={item.id}
            data-today-strip-item={ticked ? 'ticked' : 'open'}
            title={item.text}
            className={`flex max-w-64 items-center gap-1.5 rounded-full bg-card px-2 py-0.5 transition-opacity wallpaper:bg-card/70 ${ticked ? 'opacity-60' : ''}`}
          >
            <button
              role="checkbox"
              aria-checked={ticked}
              aria-label={`Mark "${item.text}" as done`}
              data-today-strip-toggle
              disabled={ticked}
              onClick={() => void tick(listId, item, index)}
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                ticked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong hover:border-accent'
              }`}
            >
              {ticked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </button>
            <span className={`truncate text-xs ${ticked ? 'text-faint line-through' : isOverdue(item.d, today) ? 'text-danger' : 'text-fg'}`}>
              {item.text}
            </span>
          </span>
        ))}
        {more > 0 && (
          <button
            onClick={showToday}
            data-today-more
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg"
          >
            +{more} more
          </button>
        )}
      </div>
    </div>
  )
}
