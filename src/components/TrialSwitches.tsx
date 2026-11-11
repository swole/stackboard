import { useState } from 'react'
import { Check } from 'lucide-react'
import { DEFAULT_ARCHIVE_AFTER } from '../lib/archivePlan'
import { useArchive } from '../lib/autoArchive'
import { trialSwitches, type TrialSwitch, type TrialSwitchView } from '../lib/nudgePlan'
import { useTodayStrip } from '../lib/todayStrip'

/** The height of the corner card's main button, outlined. */
const SWITCH = 'rounded-lg border border-line-strong bg-card px-3 py-[5px] text-xs font-medium text-fg hover:bg-hover'

/**
 * The one-tap switches (0.9.4) on the reverse-trial card and in Settings > Stackboard Pro during a
 * trial: auto-archive at 12 hours and the Today strip. They write through the settings' own setters,
 * so turning auto-archive on starts the service worker's tab record (lib/tabSeen.ts) just as Settings
 * does. Which show and what they say: trialSwitches in nudgePlan.ts. Nothing shows until both
 * settings have been read, so a feature that's on never gets offered.
 */
export function useTrialSwitches(): { views: TrialSwitchView[]; turnOn: (key: TrialSwitch) => void } {
  const archiveReady = useArchive((s) => s.ready)
  const archiveAfter = useArchive((s) => s.afterMs)
  const stripReady = useTodayStrip((s) => s.ready)
  const stripOn = useTodayStrip((s) => s.on)
  /** Switched on from here: their buttons stay, saying so. */
  const [switched, setSwitched] = useState<TrialSwitch[]>([])
  const views = archiveReady && stripReady ? trialSwitches({ archiveAfter, stripOn, switched }) : []
  const turnOn = (key: TrialSwitch) => {
    setSwitched((s) => (s.includes(key) ? s : [...s, key]))
    if (key === 'archive') void useArchive.getState().set(DEFAULT_ARCHIVE_AFTER)
    else void useTodayStrip.getState().setOn(true)
  }
  return { views, turnOn }
}

/**
 * One switch: an outlined button while its feature is off. Once it's on, the same button says so,
 * can't be pressed again and moves to a line of its own after the others (turning it off is in
 * Settings).
 */
export function TrialSwitchButton({ view, onTurnOn }: { view: TrialSwitchView; onTurnOn: (key: TrialSwitch) => void }) {
  if (view.on) {
    return (
      <button type="button" disabled data-trial-switch={view.key} data-on="" className="order-last flex basis-full items-start gap-1.5 text-left text-xs text-fg">
        <Check className="mt-px h-3.5 w-3.5 shrink-0 text-accent-text" />
        {view.label}
      </button>
    )
  }
  return (
    <button type="button" onClick={() => onTurnOn(view.key)} className={SWITCH} data-trial-switch={view.key}>
      {view.label}
    </button>
  )
}
