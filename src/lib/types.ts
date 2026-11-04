export interface Bookmark {
  id: string
  title: string
  url: string
  /** The folder it sits in: its stack, or a folder inside the stack (0.8.0). */
  parentStackId: string
  /** Its position among every child of that folder, folders included: what chrome.bookmarks.move counts (0.8.0). */
  index?: number
  /** ms since epoch, straight from chrome.bookmarks. Drives the "new" accent. */
  dateAdded?: number
  /** Added together with other links in its stack (an import, a pack, an undo): no accent. */
  batch?: boolean
  /** From the company's Chrome policy (Teams, 0.8.0): opens like any link, never edited or moved. */
  readOnly?: boolean
}

/**
 * A folder inside a stack folder, at any depth (nested folders, 0.8.0): a foldable section in the
 * stack card, its links first, then its own folders.
 */
export interface Folder {
  id: string
  title: string
  /** The stack or folder it sits in. */
  parentId: string
  bookmarks: Bookmark[]
  folders: Folder[]
  /** From the company's Chrome policy (Teams, 0.8.0). */
  readOnly?: boolean
}

export interface Stack {
  id: string
  title: string
  parentSpaceId: string
  bookmarks: Bookmark[]
  /** Folders inside the stack folder, in bookmark order, shown after its links (0.8.0). */
  folders?: Folder[]
  /** Set on a to-do stack (0.6.0): `id` keys its items in chrome.storage.sync, `anchorId` is the marker bookmark. */
  todo?: { id: string; anchorId: string }
  /** From the company's Chrome policy (Teams, 0.8.0). */
  readOnly?: boolean
  /** Its position among every child of its space folder, loose links included: what chrome.bookmarks.move counts (0.8.0). */
  index?: number
}

export interface Space {
  id: string
  rawTitle: string
  name: string
  emoji: string
  stacks: Stack[]
  /** A read-only space set by the company's IT admin through Chrome policy (Teams, 0.8.0). */
  company?: boolean
  /** The policy marks it as the place new people start (Teams T7, 0.8.0). */
  onboarding?: boolean
  /** Shows the "Start here" badge: an onboarding space within its first 30 days on this device. */
  startHere?: boolean
  /** Its position among every child of the Stackboard folder, loose links included (0.8.0). */
  index?: number
}

/** Settings a company's policy can switch off in Settings (Teams T8, 0.8.0). */
export interface CompanyLocks {
  appearance: boolean
  starterPacks: boolean
  importExport: boolean
}

/** The company's name for the sidebar header and its accent colour (Teams T8, 0.8.0). */
export interface CompanyBrand {
  name: string | null
  /** '#rrggbb' */
  accent: string | null
}

/** A line IT puts at the top of every new tab (Teams T5, 0.8.0). */
export interface Announcement {
  /** Dismissals are remembered per id; without one in the policy, a hash of the text and link. */
  id: string
  text: string
  url?: string
  dismissible: boolean
}

export interface StackableTree {
  rootId: string
  /** When the Stackboard bookmarks folder was created: the best guess at install age (0.4.1). */
  rootDateAdded?: number
  /** Company spaces come first, then the person's own (Teams, 0.8.0). */
  spaces: Space[]
  /**
   * Every to-do list whose marker sits anywhere under the Stackboard folder, including one moved
   * inside another stack, which the board doesn't show as a list (0.8.0). The orphan sweep keeps these.
   */
  todoIds?: string[]
  /** Set when Chrome policy configures Stackboard for a company (Teams, 0.8.0). */
  company?: { name: string; announcement: Announcement | null; brand: CompanyBrand | null; lock: CompanyLocks }
}

/** A folder inside a backed-up stack, with the folders inside it (0.8.0). */
export interface BackupFolder {
  name: string
  bookmarks: Array<{ title: string; url: string }>
  folders?: BackupFolder[]
}

export interface BookmarkBackup {
  version: 1
  exportedAt: string
  spaces: Array<{
    emoji: string
    name: string
    stacks: Array<{
      name: string
      bookmarks: Array<{ title: string; url: string }>
      /** Folders inside the stack, nested (0.8.0); older versions import only the stack's own links. */
      folders?: BackupFolder[]
      /** A to-do stack's items (0.6.0); older versions import it as an empty stack. 0.7.1 adds an
       *  optional due day ('YYYY-MM-DD') and repeat ('daily', 'weekdays', 'weekly', 'monthly'), which
       *  older versions ignore. */
      todo?: Array<{ text: string; done: boolean; due?: string; repeat?: string; monthDay?: number }>
    }>
  }>
}
