import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

export function Modal({ title, onClose, children, footer, width = 'sm' }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const widthClass =
    width === 'lg' ? 'max-w-xl' : width === 'md' ? 'max-w-md' : 'max-w-sm'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/30 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`w-full ${widthClass} overflow-hidden rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-cream-50 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-cream-50 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function PrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-md bg-peach-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-peach-600 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 hover:bg-cream-50"
    >
      {children}
    </button>
  )
}

export function DangerButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-md bg-peach-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-peach-800"
    >
      {children}
    </button>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-700 placeholder:text-ink-400 focus:border-peach-400 focus:outline-none ${props.className ?? ''}`}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-ink-600">{children}</label>
}
