import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Copy, Check, X } from 'lucide-react'
import { certificateText, type Bankruptcy } from '../lib/stashPlan'

// "Tab bankruptcy" (0.5.1, G2): the certificate a new tab shows after every tab was stashed.
// Drawn on a canvas so the same picture can be saved as a PNG and shared. Nothing leaves the
// browser: the download and the copy happen locally.

const W = 1200
const H = 675

function draw(canvas: HTMLCanvasElement, b: Bankruptcy, font: string) {
  const { headline, detail } = certificateText(b)
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  g.fillStyle = '#f7f1e3'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#2b2a27'
  g.lineWidth = 6
  g.strokeRect(36, 36, W - 72, H - 72)
  g.lineWidth = 2
  g.strokeRect(52, 52, W - 104, H - 104)
  g.textAlign = 'center'
  g.fillStyle = '#6b6457'
  g.font = `600 26px ${font}`
  g.fillText('CERTIFICATE OF TAB BANKRUPTCY', W / 2, 150)
  g.fillStyle = '#2b2a27'
  g.font = `700 92px ${font}`
  g.fillText(headline, W / 2, 300, W - 180)
  g.fillStyle = '#4a463e'
  g.font = `400 30px ${font}`
  g.fillText(detail, W / 2, 380, W - 180)
  g.font = `italic 400 26px ${font}`
  g.fillText('The debtor is hereby released from every "I\'ll read it later".', W / 2, 450, W - 180)
  // seal
  g.beginPath()
  g.arc(W - 200, H - 140, 58, 0, Math.PI * 2)
  g.fillStyle = '#c0392b'
  g.fill()
  g.fillStyle = '#f7f1e3'
  g.font = `700 22px ${font}`
  g.fillText('PAID', W - 200, H - 146)
  g.font = `600 14px ${font}`
  g.fillText('IN FULL', W - 200, H - 124)
  g.textAlign = 'left'
  g.fillStyle = '#6b6457'
  g.font = `600 22px ${font}`
  g.fillText('Stackboard', 110, H - 110)
}

export function Certificate({ bankruptcy, onClose }: { bankruptcy: Bankruptcy; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => certificateText(bankruptcy), [bankruptcy])

  useEffect(() => {
    if (ref.current) draw(ref.current, bankruptcy, getComputedStyle(document.body).fontFamily || 'sans-serif')
  }, [bankruptcy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = () => {
    const a = document.createElement('a')
    a.href = ref.current!.toDataURL('image/png')
    a.download = 'tab-bankruptcy.png'
    a.click()
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text.share).catch(() => {})
    setCopied(true)
  }

  return (
    <div data-certificate className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="pop-in w-full max-w-[720px] rounded-2xl border border-line bg-raised p-4 shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-sm font-semibold text-strong">{text.headline}</h2>
          <button onClick={onClose} className="rounded p-1 text-faint hover:bg-hover hover:text-soft" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <canvas ref={ref} className="w-full rounded-lg" role="img" aria-label={text.share} />
        <p className="mt-3 text-xs text-muted">{text.detail} They're in your Stash space.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={download} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover">
            <Download className="h-4 w-4" /> Save image
          </button>
          <button onClick={() => void copy()} className="flex items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm text-fg hover:bg-hover">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy text'}
          </button>
        </div>
      </div>
    </div>
  )
}
