// What's-new notes (0.7.0 Pro, 0.8.0): which one a new tab shows, and what the 0.8.0 one says.
// Pure, so tests/unit.test.ts covers who sees what. The cards live in components/WhatsNew.tsx.
//
// Each note shows on at most WHATS_NEW_SHOWS new tabs and retires when answered (its counter goes
// to -1). The 0.7.0 Pro note comes first while it is still pending; the 0.8.0 note waits for a
// later tab, so the two never share a tab.

export const WHATS_NEW_SHOWS = 3

export type WhatsNewCard = '070' | '080' | '090'

/** A note that hasn't been answered and hasn't used up its new tabs. */
export function stillPending(shows: number): boolean {
  return shows >= 0 && shows < WHATS_NEW_SHOWS
}

/**
 * The note for this new tab, if any. The 0.7.0 note is for people who had Stackboard before Pro
 * (`early`); the 0.8.0 note for people who updated to 0.8.0 from an older version.
 */
export function pickWhatsNew(p: {
  early: boolean
  shows070: number
  updated080: boolean
  shows080: number
  paid?: boolean
  /** 0.9.0: updated from a version before 0.9.0. Its note takes the place of the 0.8.0 one. */
  updated090?: boolean
  shows090?: number
  /** School mode: the company hides Pro, so the Pro note never comes. */
  lockPro?: boolean
}): WhatsNewCard | null {
  // The 0.7.0 card announces Pro, so someone who already bought it skips to the next one.
  if (p.early && !p.paid && !p.lockPro && stillPending(p.shows070)) return '070'
  if (p.updated090 && stillPending(p.shows090 ?? 0)) return '090'
  if (p.updated080 && !p.updated090 && stillPending(p.shows080)) return '080'
  return null
}

/** The Pro line goes to people with Pro or the trial, and to early users (they saw the Pro note). */
export function showProLine(p: { hasPro: boolean; early: boolean }): boolean {
  return p.hasPro || p.early
}

/** "a", "a and b", "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/** Offered in the notes while the person can still start it (say there's a free trial). */
const TRIAL_LINE = 'Try it free for 14 days, no card needed.'

/**
 * What the Pro note (0.7.0, early users) says. Since 0.8.0 to-do lists are part of Pro for early
 * users too, unless they already had a list (`keepsTodo`); the trial line shows while it's open.
 */
export function proNoteText(p: { keepsTodo: boolean; trialOpen: boolean }): string {
  const lead = p.keepsTodo
    ? 'An optional upgrade: idle tabs archive themselves, your board gets a daily snapshot, to-do lists get due dates, and there are more looks.'
    : 'An optional upgrade with to-do lists, idle tabs that archive themselves, a daily snapshot of your board, and more looks.'
  return [lead, p.trialOpen ? TRIAL_LINE : '', p.keepsTodo ? 'Your to-do lists stay free either way.' : ''].filter(Boolean).join(' ')
}

export interface WhatsNew080 {
  lead: string
  pro: string | null
  /** Offer "Try Packed": the layout isn't Packed yet and the company doesn't manage appearance. */
  tryPacked: boolean
}

/**
 * What the 0.8.0 note says. Features a company switched off (Teams locks) aren't mentioned: with
 * appearance locked there's no Packed line, layout hint or button, and with import and export
 * locked no share line. School mode: the pro lock drops the Pro line, the ai lock drops AI tidy.
 */
export function whatsNew080(p: {
  lockAppearance: boolean
  lockImportExport: boolean
  layout: 'packed' | 'rows'
  proLine: boolean
  /** An early user without a list: to-do lists moved into Pro for them in 0.8.0. */
  todoMoved?: boolean
  /** The trial can still be started. */
  trialOpen?: boolean
  lockPro?: boolean
  lockAi?: boolean
}): WhatsNew080 {
  const items = ['folders inside stacks']
  if (!p.lockAppearance) items.push('a Packed layout that closes the gaps under short stacks (Settings > Appearance > Layout)')
  if (!p.lockImportExport) items.push('share a stack as a link')
  const adds = p.lockAi ? 'due dates, a Today list and clean-up' : 'due dates and a Today list, clean-up and AI tidy'
  return {
    lead: `New in Stackboard 0.8.0: ${joinList(items)}.`,
    pro: p.proLine && !p.lockPro
      ? [
          p.todoMoved ? `To-do lists now come with Pro, along with ${adds}.` : `Pro adds ${adds}.`,
          p.trialOpen ? TRIAL_LINE : '',
        ]
          .filter(Boolean)
          .join(' ')
      : null,
    tryPacked: !p.lockAppearance && p.layout !== 'packed',
  }
}

/** What 0.9.0 brings to Pro, in the 0.9.0 note. */
const PRO_090 = 'a Today strip, stack colours, a command bar (Ctrl+K) and looks that follow the time of day'

/**
 * What the 0.9.0 note says. Someone whose 0.8.0 note never had its turn (they came from before
 * 0.8.0) also hears the 0.8.0 items, since this note takes its place, and an early user without a
 * to-do list hears that lists moved into Pro. The Pro line goes to everyone and names the trial
 * while it can start (convert free users without nagging), unless the company hides
 * Pro (school mode).
 */
export function whatsNew090(p: {
  lockAppearance: boolean
  lockImportExport: boolean
  layout: 'packed' | 'rows'
  missed080: boolean
  todoMoved: boolean
  trialOpen: boolean
  lockPro?: boolean
}): WhatsNew080 {
  const items: string[] = []
  if (p.missed080) {
    items.push('folders inside stacks')
    if (!p.lockAppearance) items.push('a Packed layout that closes the gaps under short stacks (Settings > Appearance > Layout)')
    if (!p.lockImportExport) items.push('share a stack as a link')
  }
  items.push('saving a page suggests the right stack')
  const pro = p.todoMoved && p.missed080 ? `To-do lists now come with Stackboard Pro, along with ${PRO_090}.` : `Stackboard Pro adds ${PRO_090}.`
  return {
    lead: `New in Stackboard 0.9.0: ${joinList(items)}.`,
    pro: p.lockPro ? null : [pro, p.trialOpen ? TRIAL_LINE : ''].filter(Boolean).join(' '),
    tryPacked: p.missed080 && !p.lockAppearance && p.layout !== 'packed',
  }
}
