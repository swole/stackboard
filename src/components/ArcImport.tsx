import { useRef, useState } from 'react'
import { FileText, FileUp } from 'lucide-react'
import { ARC_COPY, ARC_FILE_MAX_BYTES, ARC_PATHS, ArcFileError, arcSummary, planArc, readArcFile, type ArcPlan } from '../lib/arcImport'
import type { ImportSource } from '../lib/importChrome'
import { ImportPanel } from './ImportPanel'

// Import from Arc (0.9.7): the person picks Arc's sidebar file or Arc's export, the page reads it
// (nothing is uploaded), and the import panel lists one row per Arc space, every one ticked. Copying
// goes through the same path as Chrome bookmarks (createPlannedSpace), so the batch quiet, the
// success toast with Undo and the Tidy pointer behave the same. Loaded on first use
// (ArcImportLazy.tsx), so the reader stays out of the new tab's main bundle.

interface Picked {
  name: string
  plan: ArcPlan
  sources: ImportSource[]
  /** A new pick starts the list over. */
  key: number
}

const onMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)

export function ArcImport({ variant, onDone }: { variant: 'welcome' | 'modal'; onDone?: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  const choose = () => inputRef.current?.click()

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // picking the same file again still counts as a change
    if (!f) return
    setError(null)
    if (f.size > ARC_FILE_MAX_BYTES) {
      setError(ARC_COPY.tooBig)
      return
    }
    setReading(true)
    try {
      const plan = planArc(readArcFile(await f.text()))
      if (!plan.spaces.length) throw new ArcFileError(ARC_COPY.noLinks)
      const sources: ImportSource[] = plan.spaces.map((s) => ({
        id: s.id,
        kind: 'arc',
        label: s.space.name,
        plan: { space: s.space, links: s.links, skipped: s.skipped },
      }))
      setFile({ name: f.name, plan, sources, key: Date.now() })
    } catch (err) {
      setFile(null)
      setError(err instanceof ArcFileError ? err.message : `Couldn't read ${f.name} (${err instanceof Error ? err.message : String(err)}).`)
    } finally {
      setReading(false)
    }
  }

  // The path for this computer first.
  const paths: Array<[string, string]> = onMac
    ? [['Mac', ARC_PATHS.mac], ['Windows', ARC_PATHS.windows]]
    : [['Windows', ARC_PATHS.windows], ['Mac', ARC_PATHS.mac]]

  return (
    <div data-arc-import>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain"
        hidden
        data-arc-file
        onChange={(e) => void onPick(e)}
      />
      {file ? (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span data-arc-file-name className="min-w-0 truncate">
              {file.name}
            </span>
            <button type="button" onClick={choose} className="ml-auto shrink-0 font-medium text-accent-text hover:underline">
              {ARC_COPY.another}
            </button>
          </div>
          <ImportPanel key={file.key} sources={file.sources} variant={variant} onDone={onDone} from="arc" lead={file.plan.favorites} describe={arcSummary} />
        </>
      ) : (
        <div data-arc-help>
          <p className="text-sm leading-relaxed text-fg">{ARC_COPY.intro}</p>
          <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg bg-sunken px-3 py-2.5 text-xs">
            {paths.map(([os, path]) => (
              <div key={os} className="contents">
                <dt className="font-medium text-muted">{os}</dt>
                <dd>
                  <code className="select-all break-all font-mono text-[11px] text-fg">{path}</code>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-xs leading-relaxed text-muted">{ARC_COPY.find}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{ARC_COPY.export}</p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <span className="mr-auto text-xs text-muted">{ARC_COPY.local}</span>
            <button
              type="button"
              onClick={choose}
              disabled={reading}
              data-arc-choose
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-cta transition hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
            >
              <FileUp className="h-4 w-4" />
              {reading ? 'Reading…' : ARC_COPY.choose}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p data-arc-error role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
