import { IS_EXTENSION, createBookmark, createSpace, createStack, ensureRoot, rootTitles } from './bookmarks'
import { planFolder, type FolderNode, type Plan, type PlannedSpace } from './importPlan'

// Chrome's own top-level folders as import sources for the welcome screen and Settings.
// Everything is copied: the originals are never moved or changed.

export type SourceKind = 'bar' | 'other' | 'mobile' | 'folder'

export interface ImportSource {
  id: string
  kind: SourceKind
  label: string
  plan: Plan
}

const EMOJI: Record<SourceKind, string> = { bar: '⭐', other: '🗂️', mobile: '📱', folder: '📁' }

type ChromeNode = chrome.bookmarks.BookmarkTreeNode & { folderType?: string; syncing?: boolean }

// folderType arrived in Chrome 134; before that the permanent folders had fixed ids.
function kindOf(n: ChromeNode): SourceKind {
  const t = n.folderType
  if (t === 'bookmarks-bar' || (!t && n.id === '1')) return 'bar'
  if (t === 'other' || (!t && n.id === '2')) return 'other'
  if (t === 'mobile' || (!t && n.id === '3')) return 'mobile'
  return 'folder'
}

const DEMO_SOURCES: ImportSource[] = [
  {
    id: 'demo-bar',
    kind: 'bar',
    label: 'Bookmarks bar',
    plan: planFolder(
      {
        id: 'demo-bar',
        title: 'Bookmarks bar',
        children: [
          { id: 'a', title: 'Gmail', url: 'https://mail.google.com/' },
          { id: 'b', title: 'Calendar', url: 'https://calendar.google.com/' },
          {
            id: 'c',
            title: 'Work',
            children: [
              { id: 'd', title: 'Jira', url: 'https://www.atlassian.com/software/jira' },
              { id: 'e', title: 'Figma', url: 'https://www.figma.com/' },
            ],
          },
        ],
      },
      { name: 'Bookmarks bar', emoji: EMOJI.bar, looseTitle: 'On the bar' },
    ),
  },
]

/** Top-level Chrome folders that hold at least one link, each with a preview of its space. */
export async function listSources(): Promise<ImportSource[]> {
  if (!IS_EXTENSION) return DEMO_SOURCES
  const rootId = await ensureRoot()
  const [tree] = (await chrome.bookmarks.getTree()) as ChromeNode[]
  const top = (tree.children ?? []) as ChromeNode[]

  // Never copy Stackboard into itself: skip our root and any stray Stackboard/Stackable folder.
  const exclude = new Set<string>([rootId])
  for (const folder of top) {
    for (const child of folder.children ?? []) {
      if (!child.url && rootTitles.includes(child.title)) exclude.add(child.id)
    }
  }

  const sources = top.map((n) => {
    const kind = kindOf(n)
    const label = n.title || 'Bookmarks'
    const plan = planFolder(n as FolderNode, {
      name: label,
      emoji: EMOJI[kind],
      looseTitle: kind === 'bar' ? 'On the bar' : 'Links',
      exclude,
    })
    return { id: n.id, kind, label, plan, syncing: n.syncing }
  })

  // Signed-in Chrome can show two "Bookmarks bar" folders (account and this device).
  const seen = new Map<string, number>()
  for (const s of sources) seen.set(s.label, (seen.get(s.label) ?? 0) + 1)
  for (const s of sources) {
    if ((seen.get(s.label) ?? 0) > 1 && s.syncing === false) s.label = `${s.label} (this device)`
  }

  return sources
    .filter((s) => s.plan.links > 0)
    .map(({ id, kind, label, plan }) => ({ id, kind, label, plan: { ...plan, space: { ...plan.space, name: label } } }))
}

/** Writes a planned space into the Stackboard folder and returns the new space id. */
export async function createPlannedSpace(
  space: PlannedSpace,
  onProgress?: (done: number) => void,
): Promise<string> {
  const spaceId = await createSpace(space.name, space.emoji)
  let done = 0
  for (const stack of space.stacks) {
    const stackId = await createStack(spaceId, stack.title)
    for (const link of stack.links) {
      await createBookmark(stackId, link.title, link.url)
      onProgress?.(++done)
    }
  }
  return spaceId
}
