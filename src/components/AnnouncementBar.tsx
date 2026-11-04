import { useState } from 'react'
import { ExternalLink, Megaphone, X } from 'lucide-react'
import { useStackableStore } from '../store/useStackableStore'
import { dismissAnnouncement, dismissedAnnouncements } from '../lib/company'
import { showAnnouncement } from '../lib/managedPlan'

/**
 * Teams T5 (0.8.0): one line from the company's IT team across the top of every new tab, set in
 * Chrome policy. Dismissing hides that announcement on this device; a new one shows again. IT can
 * pin a line with "dismissible": false.
 */
export function AnnouncementBar() {
  const a = useStackableStore((s) => s.tree?.company?.announcement ?? null)
  const [dismissed, setDismissed] = useState(dismissedAnnouncements)

  if (!a || !showAnnouncement(a, dismissed)) return null

  const dismiss = () => {
    dismissAnnouncement(a.id)
    setDismissed(dismissedAnnouncements())
  }

  return (
    <div
      role="status"
      data-announcement={a.id}
      className="flex shrink-0 items-center gap-2.5 border-b border-accent-line bg-accent-soft px-8 py-2 text-sm text-fg compact:px-6 compact:py-1.5"
    >
      <Megaphone className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={a.text}>
        {a.text}
      </span>
      {a.url && (
        <a
          href={a.url}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-accent-text hover:bg-card/60"
        >
          Open
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
      {a.dismissible && (
        <button
          onClick={dismiss}
          className="shrink-0 rounded p-1 text-muted hover:bg-card/60 hover:text-fg"
          aria-label="Dismiss announcement"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
