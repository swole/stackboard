import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Modal, PrimaryButton, SecondaryButton } from './modals/Modal'
import { useStackableStore } from '../store/useStackableStore'
import { prefs } from '../lib/prefs'
import type { TodoItem } from '../lib/todoPlan'
import { boardTodos, updateWrappedMarker } from '../lib/wrapped'
import { drawWrapped } from '../lib/wrappedArt'
import { WRAPPED_COPY, WRAPPED_YEAR, markRetired, markSaved, wrappedShareText, wrappedStats } from '../lib/wrappedPlan'

/**
 * "Your 2026 in Stackboard" (0.9.10, bet B1): the person's year on the board as a picture to share,
 * worked out on this computer (wrappedPlan.ts) and drawn on a canvas (wrappedArt.ts). Save image
 * downloads the PNG and Copy text puts its words on the clipboard; nothing is sent anywhere. The
 * picture shows counts and site names only; the busiest stack's name joins it when Show stack names
 * is ticked. Opening it retires the corner card, and saving or copying marks the picture saved.
 */
export function Wrapped() {
  const close = useStackableStore((s) => s.closeModal)
  const tree = useStackableStore((s) => s.tree)
  const ref = useRef<HTMLCanvasElement>(null)
  const [names, setNames] = useState(false)
  const [todos, setTodos] = useState<TodoItem[] | null>(null)
  const [copied, setCopied] = useState(false)
  const stashes = useMemo(() => prefs.stashesCounted(), [])

  useEffect(() => {
    updateWrappedMarker(markRetired)
  }, [])

  useEffect(() => {
    if (!tree) return
    let live = true
    void boardTodos(tree).then((items) => {
      if (live) setTodos(items)
    })
    return () => {
      live = false
    }
  }, [tree])

  const stats = useMemo(
    () => (tree ? wrappedStats({ spaces: tree.spaces, year: WRAPPED_YEAR, stashes, todos }) : null),
    [tree, stashes, todos],
  )
  const text = useMemo(() => (stats ? wrappedShareText(stats, names) : ''), [stats, names])

  useEffect(() => {
    if (ref.current && stats) drawWrapped(ref.current, stats, { names })
  }, [stats, names])

  const save = () => {
    ref.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = WRAPPED_COPY.file
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }, 'image/png')
    updateWrappedMarker(markSaved)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    updateWrappedMarker(markSaved)
  }

  return (
    <Modal title={WRAPPED_COPY.title} onClose={close} width="xl">
      <div data-wrapped className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <canvas
          ref={ref}
          role="img"
          aria-label={text}
          className="aspect-[4/5] w-full shrink-0 rounded-lg shadow-float sm:w-[300px]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">{WRAPPED_COPY.intro}</p>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={names}
              onChange={(e) => setNames(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-accent"
              data-wrapped-names
            />
            <span className="text-xs">
              <span className="block font-medium text-fg">{WRAPPED_COPY.names}</span>
              <span className="block text-muted">{WRAPPED_COPY.namesHint}</span>
            </span>
          </label>
          <p className="text-xs text-muted">{WRAPPED_COPY.privacy}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <PrimaryButton onClick={save} data-wrapped-save>
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {WRAPPED_COPY.save}
              </span>
            </PrimaryButton>
            <SecondaryButton onClick={() => void copy()} data-wrapped-copy>
              <span className="inline-flex items-center gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5 text-accent-text" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? WRAPPED_COPY.copied : WRAPPED_COPY.copy}
              </span>
            </SecondaryButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
