import { useTodayStrip } from '../lib/todayStrip'
import { Segmented } from './modals/Modal'

/** Settings > Stackboard Pro > Today strip (0.9.0). Shown while Pro or the trial is on. */
export function TodayStripSetting() {
  const ready = useTodayStrip((s) => s.ready)
  const on = useTodayStrip((s) => s.on)
  const setOn = useTodayStrip((s) => s.setOn)
  if (!ready) return null

  return (
    <div data-today-strip-setting className="mt-3">
      <div className="mb-1.5 text-xs font-medium text-soft">Today strip</div>
      <Segmented<string>
        label="Today strip"
        value={on ? 'on' : 'off'}
        onChange={(v) => void setOn(v === 'on')}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
        ]}
      />
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        A line above the board with your focus for the day and the to-dos due today.
      </p>
    </div>
  )
}
