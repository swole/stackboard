import { shortDay } from './snapshotPlan'

// Back up to a folder (Pro, 0.9.0): the pure half, unit-tested. Each day's snapshot is also written
// as stackboard-YYYY-MM-DD.json into a folder the person picked (their Google Drive, OneDrive or
// Dropbox folder), the newest 30 kept. Only files with that exact name are ever deleted.
// The file system calls are in lib/backupFolder.ts.

export const BACKUP_KEEP = 30

const NAME = /^stackboard-\d{4}-\d{2}-\d{2}\.json$/

export function backupFileName(day: string): string {
  return `stackboard-${day}.json`
}

/** Our own backup files past the newest `keep`, to delete. Anything else in the folder is never listed. */
export function backupsToPrune(names: string[], keep = BACKUP_KEEP): string[] {
  // The day sorts as text, so newest first is a reverse sort.
  return names.filter((n) => NAME.test(n)).sort().reverse().slice(keep)
}

/** "Last backup: today", "Last backup: 2 Nov", or "No backup yet". */
export function lastBackupText(last: { day: string } | null, today: string): string {
  if (!last) return 'No backup yet'
  return `Last backup: ${last.day === today ? 'today' : shortDay(last.day)}`
}
