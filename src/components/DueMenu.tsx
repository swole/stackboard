import { useEffect, useRef } from 'react'
import { CalendarX } from 'lucide-react'
import { REPEATS, quickDay, shortDate, type Repeat } from '../lib/duePlan'

interface Props {
  due?: string
  repeat?: Repeat
  today: string
  onDue: (day: string | null) => void
  onRepeat: (r: Repeat | null) => void
  onClose: () => void
}

const PICKS = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['next-week', 'Next week'],
] as const

/**
 * A to-do's date menu (Pro, 0.7.1): quick picks, any date, a repeat rule, clear. Opens from the
 * calendar button or the date on an item; Escape or a click outside closes it.
 */
export function DueMenu({ due, repeat, today, onDue, onRepeat, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const pick = (day: string | null) => {
    onDue(day)
    onClose()
  }

  return (
    <div
      ref={ref}
      role="menu"
      data-due-menu
      className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-line bg-raised p-1 text-sm shadow-md"
    >
      {PICKS.map(([id, label]) => {
        const day = quickDay(id, today)
        return (
          <button
            key={id}
            role="menuitem"
            data-due-pick={id}
            onClick={() => pick(day)}
            className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left hover:bg-hover ${
              due === day ? 'font-medium text-strong' : 'text-fg'
            }`}
          >
            <span>{label}</span>
            <span className="text-xs text-muted">{shortDate(day, today)}</span>
          </button>
        )
      })}

      <label className="flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-fg">
        <span className="whitespace-nowrap">Pick a date</span>
        <input
          type="date"
          data-due-date
          value={due ?? ''}
          onChange={(e) => e.target.value && onDue(e.target.value)}
          className="w-[8.25rem] min-w-0 rounded border border-line bg-card px-1.5 py-0.5 text-xs text-fg focus:border-focus focus:outline-none"
        />
      </label>

      <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2">
        <div className="mb-1.5 text-xs text-muted">Repeat</div>
        <div role="radiogroup" aria-label="Repeat" className="flex flex-wrap gap-1">
          {[{ id: null, label: 'Off' }, ...REPEATS].map((r) => {
            const on = (repeat ?? null) === r.id
            return (
              <button
                key={r.label}
                role="radio"
                aria-checked={on}
                data-due-repeat={r.id ?? 'off'}
                onClick={() => onRepeat(r.id)}
                className={`rounded-md px-2 py-0.5 text-xs ring-1 ${
                  on ? 'bg-selected text-strong ring-line-strong' : 'text-soft ring-line hover:bg-hover'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>

      {due && (
        <button
          role="menuitem"
          data-due-clear
          onClick={() => pick(null)}
          className="mt-1 flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-muted hover:bg-hover hover:text-fg"
        >
          <CalendarX className="h-3.5 w-3.5" />
          Clear date
        </button>
      )}
    </div>
  )
}
