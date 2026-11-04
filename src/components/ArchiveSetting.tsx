import { ARCHIVE_AFTER } from '../lib/archivePlan'
import { useArchive } from '../lib/autoArchive'
import { Segmented } from './modals/Modal'

/** Settings > Stackboard Pro > Auto-archive (0.7.0). Shown while Pro or the trial is on. */
export function ArchiveSetting() {
  const ready = useArchive((s) => s.ready)
  const afterMs = useArchive((s) => s.afterMs)
  const set = useArchive((s) => s.set)
  if (!ready) return null

  const value = afterMs ? String(afterMs) : 'off'
  return (
    <div data-archive-setting className="mt-3">
      <div className="mb-1.5 text-xs font-medium text-soft">Auto-archive idle tabs</div>
      <Segmented<string>
        label="Auto-archive idle tabs"
        value={value}
        onChange={(v) => void set(v === 'off' ? null : Number(v))}
        options={[{ value: 'off', label: 'Off' }, ...ARCHIVE_AFTER.map((c) => ({ value: String(c.ms), label: c.label }))]}
      />
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {afterMs
          ? "Tabs you haven't looked at for this long move into a dated stack in your Stash space whenever you open a new tab. Pinned tabs, tab groups and tabs playing sound stay open."
          : "Pick a time and tabs you haven't looked at for that long move into a dated stack in your Stash space."}
      </p>
    </div>
  )
}
