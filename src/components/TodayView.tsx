import { useRef, useState } from 'react'
import { CalendarCheck, Check } from 'lucide-react'
import { useAllTodos } from '../lib/allTodos'
import { dueToday, shortDate } from '../lib/duePlan'
import type { TodoItem } from '../lib/todoPlan'
import { useToday } from '../lib/today'
import { useStackableStore } from '../store/useStackableStore'
import { DueChip } from './DueChip'
import { TICK_GUARD_MS } from './TodoItems'
import { tickDue } from './tickDue'

/** A ticked row stays in place, ticked, this long before it leaves the list. */
const LINGER_MS = 1000

interface Lingering {
  listId: string
  item: TodoItem
  /** where it sat in its list's due rows */
  index: number
}

/**
 * Today (Pro, 0.7.1): every open to-do due today or earlier, from every list on the board, grouped
 * by list in board order. Ticking one here is the same as ticking it in its stack: a repeating
 * item moves to its next date, anything else is done; both come back with Undo. A ticked row stays
 * a moment so the next click can't land on the row that slides up under the pointer.
 */
export function TodayView() {
  const tree = useStackableStore((s) => s.tree)
  const revealStack = useStackableStore((s) => s.revealStack)
  const lists = useAllTodos((s) => s.lists)
  const today = useToday((s) => s.day)
  const [lingering, setLingering] = useState<Record<string, Lingering>>({})
  const ticking = useRef(new Set<string>())

  const groups = (tree?.spaces ?? [])
    .flatMap((space) =>
      space.stacks.flatMap((stack) => (stack.todo ? [{ space, stack, listId: stack.todo.id }] : [])),
    )
    .map((g) => {
      const due: { item: TodoItem; ticked: boolean }[] = dueToday([{ listId: g.listId, list: lists[g.listId] ?? null }], today).map(
        ({ item }) => ({ item, ticked: !!lingering[item.id] }),
      )
      for (const l of Object.values(lingering)) {
        if (l.listId !== g.listId || due.some((d) => d.item.id === l.item.id)) continue
        due.splice(Math.min(l.index, due.length), 0, { item: l.item, ticked: true })
      }
      return { ...g, due }
    })
    .filter((g) => g.due.length > 0)

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
    <div data-today-view className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-4 px-8 py-5 compact:px-6 compact:py-3.5">
        <div className="on-wallpaper flex min-w-0 items-baseline gap-2.5">
          <CalendarCheck className="h-5 w-5 shrink-0 self-center text-accent-text" />
          <h1 className="text-2xl font-bold text-strong">Today</h1>
          <span className="text-sm text-muted">{shortDate(today, today)}</span>
        </div>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-8 pb-8 compact:px-6 compact:pb-6">
        {groups.length === 0 ? (
          <p data-today-empty className="on-wallpaper max-w-md text-sm leading-relaxed text-muted">
            Nothing due today. Give a to-do a date with the calendar button next to it, and it shows up here on the day.
          </p>
        ) : (
          <div className="grid max-w-2xl gap-6 compact:gap-4">
            {groups.map((g) => (
              <section key={g.listId} data-today-list={g.listId}>
                <div className="on-wallpaper mb-2 flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-fg">{g.stack.title}</h2>
                  <span className="truncate text-xs text-muted">
                    {g.space.emoji} {g.space.name}
                  </span>
                  <button
                    onClick={() => revealStack(g.space.id, g.stack.id)}
                    data-today-show
                    className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg"
                  >
                    Show in its stack
                  </button>
                </div>
                <div className="flex flex-col gap-1 rounded-xl bg-well p-1.5 compact:gap-0.5 compact:p-1 wallpaper:bg-panel/55 wallpaper:backdrop-blur-xl">
                  {g.due.map(({ item, ticked }, index) => (
                    <div
                      key={item.id}
                      data-today-item={ticked ? 'ticked' : 'open'}
                      className={`flex items-start gap-2 rounded-lg bg-card px-2.5 py-2 text-sm transition-opacity compact:py-1 wallpaper:bg-card/70 ${ticked ? 'opacity-60' : ''}`}
                    >
                      <button
                        role="checkbox"
                        aria-checked={ticked}
                        aria-label={`Mark "${item.text}" as done`}
                        data-today-toggle
                        disabled={ticked}
                        onClick={() => void tick(g.listId, item, index)}
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                          ticked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong hover:border-accent'
                        }`}
                      >
                        {ticked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={`[overflow-wrap:anywhere] ${ticked ? 'text-faint line-through' : 'text-fg'}`}>{item.text}</span>
                        <DueChip due={item.d!} repeat={item.r} today={today} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
