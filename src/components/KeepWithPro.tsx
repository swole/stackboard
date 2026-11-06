import { openCheckout, usePro } from '../lib/pro'
import { useStackableStore } from '../store/useStackableStore'

/**
 * The line under a Pro try-on (0.9.0): what's being tried, and one button to keep it. The trial
 * while it's unused, Get Pro after. `onTrial` runs once the trial has started. Never under the
 * company's pro lock (school mode), where there are no try-ons to keep.
 */
export function KeepWithPro({ text, onTrial, ...rest }: { text: string; onTrial?: () => void | Promise<void>; [data: `data-${string}`]: string }) {
  const trialUsed = usePro((s) => !!s.trialStartedAt)
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro)
  const startTrial = async () => {
    await usePro.getState().startTrial()
    await onTrial?.()
  }
  const buy = () => openCheckout('keep-look')
  if (lockPro) return null
  return (
    <p {...rest} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-fg">
      <span>{text}</span>
      <button
        type="button"
        onClick={() => (trialUsed ? buy() : void startTrial())}
        className="rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
      >
        {trialUsed ? 'Get Pro' : 'Start free trial'}
      </button>
    </p>
  )
}
