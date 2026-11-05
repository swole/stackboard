import { useState } from 'react'
import { X } from 'lucide-react'
import { useSchedule } from '../lib/spaceSchedule'
import { DAY_SETS, MAX_RULES, WEEK, daysPreset, newRule, spaceFor, type DaysPreset, type SpaceRule } from '../lib/schedulePlan'
import { useStackableStore } from '../store/useStackableStore'

const NO_SPACES: never[] = []

const FIELD = 'rounded-md border border-line-strong bg-card px-2 py-1 text-xs text-fg focus:border-focus focus:outline-none'

const PRESETS: { value: DaysPreset; label: string }[] = [
  { value: 'every', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'pick', label: 'Pick days' },
]

/**
 * Settings > Stackboard Pro > Open a space by time (0.9.0). Shown while Pro or the trial is on.
 * Up to three rules; the first that fits the day and time picks the space a new tab opens on.
 */
export function ScheduleSetting() {
  const ready = useSchedule((s) => s.ready)
  const rules = useSchedule((s) => s.rules)
  const save = useSchedule((s) => s.save)
  const tree = useStackableStore((s) => s.tree)
  const spaces = tree?.spaces ?? NO_SPACES
  if (!ready) return null

  const update = (i: number, patch: Partial<SpaceRule>) => void save(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div data-schedule-setting className="mt-3">
      <div className="mb-1 text-xs font-medium text-soft">Open a space by time</div>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        A new tab opens on the first rule that fits the day and time. The rest of the time, your last space opens as usual.
      </p>
      <div className="grid gap-2">
        {rules.map((rule, i) => (
          <RuleRow
            key={i}
            rule={rule}
            spaces={spaces}
            onChange={(patch) => update(i, patch)}
            onRemove={() => void save(rules.filter((_, k) => k !== i))}
          />
        ))}
      </div>
      {rules.length < MAX_RULES && spaces.length > 0 && (
        <button
          type="button"
          data-schedule-add
          onClick={() => void save([...rules, newRule(spaces)])}
          className="mt-2 text-xs text-accent-text underline-offset-2 hover:underline"
        >
          {rules.length ? 'Add another rule' : 'Add a rule'}
        </button>
      )}
    </div>
  )
}

function RuleRow({
  rule,
  spaces,
  onChange,
  onRemove,
}: {
  rule: SpaceRule
  spaces: { id: string; name: string; emoji: string }[]
  onChange: (patch: Partial<SpaceRule>) => void
  onRemove: () => void
}) {
  const preset = daysPreset(rule.days)
  // "Pick days" stays open while someone picks, even when the days happen to match a preset.
  const [picking, setPicking] = useState(preset === 'pick')
  const missing = !spaceFor(rule, spaces)
  const shownPreset: DaysPreset = picking ? 'pick' : preset

  const toggleDay = (day: number) => {
    const on = rule.days.includes(day)
    if (on && rule.days.length === 1) return // a rule needs at least one day
    onChange({ days: on ? rule.days.filter((d) => d !== day) : [...rule.days, day].sort() })
  }

  return (
    <div data-schedule-rule className="rounded-lg border border-line bg-sunken p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <select
          aria-label="Space"
          data-schedule-space
          value={missing ? '' : spaceFor(rule, spaces)!.name}
          onChange={(e) => onChange({ space: e.target.value })}
          className={FIELD}
        >
          {missing && <option value="">{rule.space} (gone)</option>}
          {spaces.map((s) => (
            <option key={s.id} value={s.name}>
              {s.emoji} {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Days"
          data-schedule-days
          value={shownPreset}
          onChange={(e) => {
            const v = e.target.value as DaysPreset
            setPicking(v === 'pick')
            if (v !== 'pick') onChange({ days: [...DAY_SETS[v]] })
          }}
          className={FIELD}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <span>from</span>
        <input
          type="time"
          aria-label="From"
          data-schedule-from
          value={rule.from}
          onChange={(e) => e.target.value && onChange({ from: e.target.value })}
          className={FIELD}
        />
        <span>to</span>
        <input
          type="time"
          aria-label="To"
          data-schedule-to
          value={rule.to}
          onChange={(e) => e.target.value && onChange({ to: e.target.value })}
          className={FIELD}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this rule"
          data-schedule-remove
          className="ml-auto rounded p-1 text-faint hover:bg-hover hover:text-fg"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {shownPreset === 'pick' && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Days">
          {WEEK.map(({ day, short }) => {
            const on = rule.days.includes(day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                data-schedule-day={day}
                onClick={() => toggleDay(day)}
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${
                  on ? 'bg-card text-strong ring-line-strong' : 'text-muted ring-line hover:text-fg'
                }`}
              >
                {short}
              </button>
            )
          })}
        </div>
      )}
      {missing && (
        <p data-schedule-missing className="mt-1.5 text-xs text-danger">
          There's no space called {rule.space} any more. Pick another, or remove the rule.
        </p>
      )}
      {rule.from === rule.to && <p className="mt-1.5 text-xs text-muted">The same start and end means all day.</p>}
    </div>
  )
}
