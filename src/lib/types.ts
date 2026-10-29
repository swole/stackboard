export interface Bookmark {
  id: string
  title: string
  url: string
  parentStackId: string
  /** ms since epoch, straight from chrome.bookmarks. Drives the "new" accent. */
  dateAdded?: number
  /** Added together with other links in its stack (an import, a pack, an undo): no accent. */
  batch?: boolean
}

export interface Stack {
  id: string
  title: string
  parentSpaceId: string
  bookmarks: Bookmark[]
  /** Set on a to-do stack (0.6.0): `id` keys its items in chrome.storage.sync, `anchorId` is the marker bookmark. */
  todo?: { id: string; anchorId: string }
}

export interface Space {
  id: string
  rawTitle: string
  name: string
  emoji: string
  stacks: Stack[]
}

export interface StackableTree {
  rootId: string
  /** When the Stackboard bookmarks folder was created: the best guess at install age (0.4.1). */
  rootDateAdded?: number
  spaces: Space[]
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
      /** A to-do stack's items (0.6.0); older versions import it as an empty stack. */
      todo?: Array<{ text: string; done: boolean }>
    }>
  }>
}
