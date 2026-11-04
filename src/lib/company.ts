import { IS_EXTENSION } from './bookmarks'
import type { FolderNode } from './importPlan'
import {
  EMPTY_CONFIG,
  addDismissed,
  arrangeOnboarding,
  companyLabel,
  companySpaces,
  isEmptyConfig,
  managedFolderSpace,
  onboardingActive,
  parseDismissed,
  parseManagedConfig,
  type ManagedConfig,
} from './managedPlan'
import type { StackableTree } from './types'

// Teams (0.8.0): reads the company board from Chrome policy. The rules are in managedPlan.ts.
// Nothing here needs a permission: chrome.storage.managed comes with "storage" plus the
// manifest's managed_schema, and the ManagedBookmarks folder is an ordinary bookmark node.

/** Unpacked builds only (tests): JSON here stands in for chrome.storage.managed. */
const OVERRIDE = 'stackable:managedOverride'
/** Outside the extension (vite preview): JSON here plays the policy. */
const PREVIEW = 'stackable:managedPreview'
const DISMISSED = 'stackable:announcementsDismissed'
/** When this device first showed company spaces (ms): the onboarding space's 30 days count from it. */
const COMPANY_SEEN = 'stackable:companySeen'

type Node = chrome.bookmarks.BookmarkTreeNode & { folderType?: string; unmodifiable?: string }

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function json(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Store builds always carry an update_url; a build loaded unpacked (the e2e suite) doesn't. */
function unpacked(): boolean {
  try {
    return !('update_url' in chrome.runtime.getManifest())
  } catch {
    return false
  }
}

/** The board never waits on policy: managed storage that doesn't answer counts as no policy. */
const POLICY_WAIT_MS = 1500

/** Managed storage is read once per page and again only when Chrome reports a policy change. */
let policyRead: Promise<unknown> | null = null
/** Set by watchCompany: a policy that answers after the wait still reaches the board. */
let lateAnswer: (() => void) | null = null

/**
 * The test override, unpacked builds only. Pages read it from localStorage; the service worker
 * (go links) has no localStorage, so it reads the same key from chrome.storage.local.
 */
async function readOverride(): Promise<string | null> {
  if (!unpacked()) return null
  if (typeof localStorage !== 'undefined') return readLocal(OVERRIDE)
  try {
    const v = (await chrome.storage.local.get(OVERRIDE))[OVERRIDE]
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

async function readPolicy(): Promise<unknown> {
  if (!IS_EXTENSION) return json(readLocal(PREVIEW))
  const override = await readOverride()
  if (override) return json(override)
  policyRead ??= readManaged()
  return policyRead
}

async function readManaged(): Promise<unknown> {
  if (!chrome.storage?.managed) return null
  // no policy, or managed storage unavailable: Chrome treats both as empty
  const got: Promise<unknown> = chrome.storage.managed.get(null).then((v) => v ?? null, () => null)
  const late = Symbol('late')
  let timer: ReturnType<typeof setTimeout> | undefined
  const first = await Promise.race([
    got,
    new Promise<typeof late>((resolve) => {
      timer = setTimeout(() => resolve(late), POLICY_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
  if (first !== late) return first
  // Too slow for this paint: show the board now, then the company spaces when Chrome answers.
  void got.then((v) => {
    if (!v || !Object.keys(v as object).length) return
    policyRead = Promise.resolve(v)
    lateAnswer?.()
  })
  return null
}

/** Chrome's ManagedBookmarks folder, if the admin set that policy. */
async function managedFolder(): Promise<FolderNode | null> {
  if (!IS_EXTENSION) return null
  try {
    const [root] = (await chrome.bookmarks.getTree()) as Node[]
    // folderType arrived in Chrome 134; older versions only mark the node unmodifiable.
    const folder = ((root?.children ?? []) as Node[]).find(
      (n) => !n.url && (n.folderType === 'managed' || n.unmodifiable === 'managed'),
    )
    return (folder as FolderNode | undefined) ?? null
  } catch {
    return null
  }
}

export interface CompanyBoard {
  config: ManagedConfig
  spaces: StackableTree['spaces']
  info: NonNullable<StackableTree['company']> | null
  /** The onboarding space to open on, when this is the first time this device shows company spaces. */
  startHereId: string | null
}

/**
 * When this device first showed company spaces, stamped now if never (pages only: the service
 * worker has no localStorage and never needs the order). `fresh` is true on the stamping call.
 */
function companySeen(now: number): { at: number | null; fresh: boolean } {
  if (typeof localStorage === 'undefined') return { at: null, fresh: false }
  const at = Number(readLocal(COMPANY_SEEN))
  if (at > 0) return { at, fresh: false }
  try {
    localStorage.setItem(COMPANY_SEEN, String(now))
  } catch {
    return { at: null, fresh: false }
  }
  return { at: now, fresh: true }
}

/** The company spaces and announcement, or nothing when no policy applies. Never throws. */
export async function readCompany(now = Date.now()): Promise<CompanyBoard> {
  let config = EMPTY_CONFIG
  try {
    config = parseManagedConfig(await readPolicy())
  } catch {
    // a malformed policy shows nothing rather than breaking the board
  }
  let spaces = companySpaces(config)
  if (config.showManagedBookmarks) {
    const folder = await managedFolder()
    const extra = folder ? managedFolderSpace(folder) : null
    if (extra) spaces.push(extra)
  }
  let startHereId: string | null = null
  if (spaces.length) {
    const seen = companySeen(now)
    spaces = arrangeOnboarding(spaces, onboardingActive(seen.at, now))
    if (seen.fresh) startHereId = spaces.find((s) => s.startHere)?.id ?? null
  }
  const info =
    spaces.length || !isEmptyConfig(config)
      ? { name: companyLabel(config), announcement: config.announcement, brand: config.brand, lock: config.lock }
      : null
  return { config, spaces, info, startHereId }
}

/** Calls back when the admin's Stackboard policy changes (ManagedBookmarks changes arrive as bookmark events). */
export function watchCompany(onChange: () => void): () => void {
  if (!IS_EXTENSION || !chrome.storage?.onChanged) return () => {}
  const listener = (_changes: unknown, area: string) => {
    if (area !== 'managed') return
    policyRead = null
    onChange()
  }
  lateAnswer = onChange
  chrome.storage.onChanged.addListener(listener)
  return () => {
    if (lateAnswer === onChange) lateAnswer = null
    chrome.storage.onChanged.removeListener(listener)
  }
}

/** Merges the company board into a freshly read tree: company spaces first. */
export function withCompany(tree: StackableTree, company: CompanyBoard | null): StackableTree {
  if (!company || (!company.spaces.length && !company.info)) return tree
  return { ...tree, spaces: [...company.spaces, ...tree.spaces], company: company.info ?? undefined }
}

export function dismissedAnnouncements(): string[] {
  return parseDismissed(readLocal(DISMISSED))
}

export function dismissAnnouncement(id: string): void {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify(addDismissed(dismissedAnnouncements(), id)))
  } catch {
    // storage blocked: the line comes back on the next new tab
  }
}
