import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
  /** 'light' keeps the board visible behind the dialog (Settings, where changes preview live). */
  scrim?: 'normal' | 'light'
}

export function Modal({ title, onClose, children, footer, width = 'sm', scrim = 'normal' }: Props) {
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
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-4 ${
        scrim === 'light' ? 'bg-scrim/40' : 'bg-scrim'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`flex max-h-full w-full ${widthClass} flex-col overflow-hidden rounded-xl bg-raised text-fg shadow-2xl ring-1 ring-line`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-strong">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-faint hover:bg-hover hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 py-4 no-scrollbar">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-sunken px-4 py-3">
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
      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
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
      className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm text-fg hover:bg-hover"
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
      className="rounded-md bg-danger-fill px-3 py-1.5 text-sm font-medium text-on-danger hover:bg-danger-fill-hover"
    >
      {children}
    </button>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:border-focus focus:outline-none ${props.className ?? ''}`}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-soft">{children}</label>
}
