import { Repeat as RepeatIcon } from 'lucide-react'
import { dueLabel, isOverdue, repeatLabel, spokenDue, type Repeat } from '../lib/duePlan'

interface Props {
  due: string
  repeat?: Repeat
  today: string
  /** With Pro the date opens its menu; without, it's only shown. */
  onClick?: () => void
}

/** A to-do's due date (0.7.1): red when overdue, accent when due today, a loop icon when it repeats. */
export function DueChip({ due, repeat, today, onClick }: Props) {
  const tone = isOverdue(due, today) ? 'text-danger' : due === today ? 'text-accent-text' : 'text-muted'
  const label = dueLabel(due, today)
  const title = `Due ${spokenDue(due, today)}${repeat ? `, repeats ${repeatLabel(repeat).toLowerCase()}` : ''}`
  const body = (
    <>
      {repeat && <RepeatIcon className="h-3 w-3" aria-hidden />}
      {label}
    </>
  )
  const cls = `inline-flex w-fit items-center gap-1 text-xs leading-4 ${tone}`
  if (!onClick) {
    return (
      <span data-todo-due={due} data-todo-repeat={repeat ?? ''} title={title} className={cls}>
        {body}
      </span>
    )
  }
  return (
    <button
      type="button"
      data-todo-due={due}
      data-todo-repeat={repeat ?? ''}
      title={`${title}. Click to change.`}
      onClick={onClick}
      className={`${cls} rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
    >
      {body}
    </button>
  )
}
