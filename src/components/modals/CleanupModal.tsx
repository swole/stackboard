import { useEffect, useMemo, useRef, useState } from 'react'
import { useStackableStore } from '../../store/useStackableStore'
import { usePro } from '../../lib/pro'
import { hasPro } from '../../lib/proPlan'
import { plural } from '../../lib/importPlan'
import { parseBookmarkTitle } from '../../lib/icon'
import { displayTitle } from '../../lib/title'
import { checkLinks, readBoardLinks, removeLinks } from '../../lib/cleanup'
import { loadOpens } from '../../lib/opens'
import {
  CHECK_WORDS,
  UNUSED_MS,
  checkTargets,
  countingNote,
  duplicatesSummary,
  extraCopies,
  findDuplicates,
  findUnused,
  lastOpened,
  locationLabel,
  looksOffline,
  normalizeUrl,
  openedWords,
  removeButtonLabel,
  skippedNote,
  stillCounting,
  unreachableLinks,
  unusedSummary,
  type CheckResult,
  type CleanLink,
} from '../../lib/cleanupPlan'
import { BookmarkIcon } from '../BookmarkIcon'
import { Modal, Segmented, SecondaryButton } from './Modal'

type Tab = 'dupes' | 'unused' | 'dead'

interface CheckState {
  running: boolean
  done: number
  total: number
  /** per normalised link */
  results: Map<string, CheckResult> | null
  /** per site: each site is asked once */
  sites: Map<string, CheckResult> | null
}

/**
 * "Clean up your board" (Pro, 0.7.1): duplicates, links nobody opens, links that no longer load.
 * Nothing goes without a tick; removing takes one click and comes back with Undo.
 */
export function CleanupModal() {
  const close = useStackableStore((s) => s.closeModal)
  const tree = useStackableStore((s) => s.tree)
  const proOn = usePro((s) => s.ready && hasPro(s.state))
  const [links, setLinks] = useState<CleanLink[] | null>(null)
  const [opens, setOpens] = useState<{ opens: Map<string, number>; since: number } | null>(null)
  const [tab, setTab] = useState<Tab>('dupes')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<CheckState>({ running: false, done: 0, total: 0, results: null, sites: null })
  const firstLoad = useRef(true)
  const abort = useRef<AbortController | null>(null)

  // Read the board again whenever it changes (a removal, an undo, another tab).
  useEffect(() => {
    let live = true
    void Promise.all([readBoardLinks(), loadOpens()]).then(([l, o]) => {
      if (!live) return
      setLinks(l)
      setOpens(o)
      const ids = new Set(l.map((x) => x.id))
      // Read the flag now: React runs the updater later, after this function has returned.
      const first = firstLoad.current
      firstLoad.current = false
      setSelected((prev) => {
        const kept = new Set([...prev].filter((id) => ids.has(id)))
        if (first) for (const id of extraCopies(findDuplicates(l))) kept.add(id)
        return kept
      })
    })
    return () => {
      live = false
    }
  }, [tree])

  useEffect(() => () => abort.current?.abort(), [])

  const now = Date.now()
  const dupes = useMemo(() => (links ? findDuplicates(links) : []), [links])
  const unused = useMemo(() => (links && opens ? findUnused(links, opens.opens, now, UNUSED_MS, opens.since) : []), [links, opens])
  const dead = useMemo(() => (links && check.results ? unreachableLinks(links, check.results) : []), [links, check.results])
  // Remove acts on the open tab's ticks only: ticks left on another tab never go unseen.
  const shown = useMemo(() => {
    const on = tab === 'dupes' ? dupes.flatMap((g) => g.links) : tab === 'unused' ? unused : dead
    return new Set(on.map((l) => l.id))
  }, [tab, dupes, unused, dead])
  const picked = [...selected].filter((id) => shown.has(id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const runCheck = async () => {
    if (!links) return
    const urls = checkTargets(links)
    const ctrl = new AbortController()
    abort.current = ctrl
    setCheck({ running: true, done: 0, total: 0, results: null, sites: null })
    const { results, sites } = await checkLinks(urls, {
      signal: ctrl.signal,
      onProgress: (done, total) => setCheck((c) => ({ ...c, done, total })),
    })
    if (ctrl.signal.aborted) return
    setCheck({ running: false, done: sites.size, total: sites.size, results, sites })
  }

  const cancelCheck = () => {
    abort.current?.abort()
    setCheck({ running: false, done: 0, total: 0, results: null, sites: null })
  }

  const onRemove = async () => {
    if (!picked.length || busy) return
    const store = useStackableStore.getState()
    setBusy(true)
    try {
      const { removed, skipped, restore } = await removeLinks(picked)
      setSelected((prev) => new Set([...prev].filter((id) => !picked.includes(id))))
      await store.refresh()
      store.showToast({
        verb: 'Removed',
        title: plural(removed, 'link'),
        detail: skippedNote(skipped),
        duration: 10000,
        undo: async () => {
          const back = await restore()
          const s = useStackableStore.getState()
          await s.refresh()
          s.showToast({ verb: 'Restored', title: plural(back, 'link'), duration: 2200 })
        },
      })
    } catch (err) {
      store.reportError('remove those links', err)
    } finally {
      setBusy(false)
    }
  }

  const failed = check.sites ? [...check.sites.values()].filter((r) => r !== 'ok').length : 0
  const offline = check.sites ? looksOffline(check.sites.size, failed) : false

  return (
    <Modal
      title="Clean up your board"
      onClose={close}
      width="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-muted">Removed links come back with Undo, or from a daily snapshot.</span>
          <SecondaryButton onClick={close}>Close</SecondaryButton>
          <button
            type="button"
            data-cleanup-remove
            onClick={() => void onRemove()}
            disabled={!picked.length || busy || !proOn}
            className="rounded-md bg-danger-fill px-3 py-1.5 text-sm font-medium text-on-danger hover:bg-danger-fill-hover disabled:opacity-50"
          >
            {busy ? 'Removing…' : removeButtonLabel(picked.length)}
          </button>
        </>
      }
    >
      {!proOn ? (
        <p className="text-sm text-muted">Clean-up is part of Stackboard Pro. Start the free trial in Settings to use it.</p>
      ) : !links || !opens ? (
        <p className="text-sm text-muted">Reading your board…</p>
      ) : (
        <div data-cleanup className="flex flex-col gap-3">
          <Segmented<Tab>
            label="Clean-up lists"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'dupes', label: `Duplicates${dupes.length ? ` (${dupes.length})` : ''}` },
              { value: 'unused', label: `Unused${unused.length ? ` (${unused.length})` : ''}` },
              { value: 'dead', label: `Can't be reached${dead.length ? ` (${dead.length})` : ''}` },
            ]}
          />

          {tab === 'dupes' && (
            <section data-cleanup-section="dupes">
              <p className="mb-2 text-xs text-muted">{duplicatesSummary(dupes)} Every copy after the first is ticked.</p>
              <div className="flex flex-col gap-2.5">
                {dupes.map((g) => (
                  <div key={g.key} className="rounded-md border border-line bg-card p-1.5">
                    {g.links.map((l, i) => (
                      <Row key={l.id} link={l} checked={selected.has(l.id)} onToggle={toggle} note={i === 0 ? 'First copy' : undefined} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'unused' && (
            <section data-cleanup-section="unused">
              <p className="mb-2 text-xs leading-relaxed text-muted" data-cleanup-counting={stillCounting(opens.since, now) ? 'yes' : 'no'}>
                {stillCounting(opens.since, now) ? countingNote(opens.since, now) : `${unusedSummary(unused.length)} ${countingNote(opens.since, now)}`}
              </p>
              <div className="flex flex-col gap-0.5">
                {unused.map((l) => (
                  <Row key={l.id} link={l} checked={selected.has(l.id)} onToggle={toggle} note={openedWords(lastOpened(l, opens.opens))} />
                ))}
              </div>
            </section>
          )}

          {tab === 'dead' && (
            <section data-cleanup-section="dead">
              <p className="mb-2 text-xs leading-relaxed text-muted">
                This asks each site in your board for its home page, quietly from your browser, to see which ones no longer answer.
              </p>
              {check.running ? (
                <div className="mb-2 flex items-center gap-3" data-cleanup-progress>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${check.total ? (check.done / check.total) * 100 : 0}%` }} />
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {check.done} of {check.total}
                  </span>
                  <SecondaryButton onClick={cancelCheck}>Cancel</SecondaryButton>
                </div>
              ) : (
                <div className="mb-2 flex items-center gap-2">
                  <SecondaryButton onClick={() => void runCheck()} data-cleanup-check>
                    {check.results ? 'Check again' : 'Check links'}
                  </SecondaryButton>
                  {check.sites && (
                    <span className="text-xs text-muted" data-cleanup-checked>
                      {plural(check.sites.size, 'site')} checked, {dead.length ? `${plural(dead.length, 'link')} didn't answer.` : 'every one answered.'}
                    </span>
                  )}
                </div>
              )}
              {offline && (
                <p className="mb-2 text-xs text-danger">Most sites didn't answer, so your connection may be down. Check it, then try again.</p>
              )}
              {dead.length > 0 && !offline && (
                <p className="mb-2 text-xs text-muted">A few live sites refuse checks like this, so open a link to be sure before you remove it.</p>
              )}
              <div className="flex flex-col gap-0.5">
                {dead.map((l) => {
                  const r = check.results?.get(normalizeUrl(l.url))
                  return (
                    <Row
                      key={l.id}
                      link={l}
                      checked={selected.has(l.id)}
                      onToggle={toggle}
                      note={r && r !== 'ok' ? CHECK_WORDS[r] : undefined}
                      openable
                    />
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}

function Row(props: { link: CleanLink; checked: boolean; onToggle: (id: string) => void; note?: string; openable?: boolean }) {
  const { link, checked, onToggle, note, openable } = props
  const { emoji, text } = parseBookmarkTitle(link.title)
  const shown = displayTitle(text, link.url)
  return (
    <label
      data-cleanup-row={link.id}
      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-hover"
      title={`${link.title}\n${link.url}`}
    >
      <input type="checkbox" checked={checked} onChange={() => onToggle(link.id)} className="h-3.5 w-3.5 shrink-0 accent-accent" />
      <BookmarkIcon emoji={emoji} title={shown} url={link.url} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg">{shown}</span>
        <span className="block truncate text-[11px] text-muted">{locationLabel(link)}</span>
      </span>
      {note && <span className="shrink-0 text-[11px] text-faint">{note}</span>}
      {openable && (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-text hover:bg-selected"
        >
          Open
        </a>
      )}
    </label>
  )
}
