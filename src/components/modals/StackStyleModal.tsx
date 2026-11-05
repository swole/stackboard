import { lazy, Suspense, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { Theme } from 'emoji-picker-react'
import { Modal, PrimaryButton, SecondaryButton, Label } from './Modal'
import { renameStack } from '../../lib/bookmarks'
import { usePro } from '../../lib/pro'
import { hasPro } from '../../lib/proPlan'
import { previewStackColor, setStackColor } from '../../lib/stackStyle'
import { QUICK_ICONS, STACK_COLORS, buildStackTitle, chipColors, splitStackTitle, type StackColor } from '../../lib/stackStylePlan'
import { useAppearance } from '../../store/useAppearance'
import { useStackableStore } from '../../store/useStackableStore'
import { KeepWithPro } from '../KeepWithPro'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

interface Props {
  stackId: string
  title: string
  color: StackColor | null
}

const proNow = () => {
  const p = usePro.getState()
  return p.ready && hasPro(p.state)
}

/**
 * A stack's colour and icon (0.9.0). The icon is the emoji at the start of the title, so picking
 * one edits the title and works for everyone. Colours are Pro: the stack shows the one picked
 * while this is open, which for a free user is a try-on with the trial one click away. School
 * mode: under the company's pro lock, colours show only with Pro on, so it's the icon alone.
 */
export function StackStyleModal({ stackId, title, color: savedColor }: Props) {
  const close = useStackableStore((s) => s.closeModal)
  const refresh = useStackableStore((s) => s.refresh)
  const reportError = useStackableStore((s) => s.reportError)
  // The picker's own light/dark set picks its category icons; index.css maps its colours.
  const scheme = useAppearance((s) => s.scheme)
  const proOn = usePro((s) => s.ready && hasPro(s.state))
  const lockPro = useStackableStore((s) => !!s.tree?.company?.lock.pro)
  const colours = proOn || !lockPro
  const parts = splitStackTitle(title)
  const [icon, setIcon] = useState<string | null>(parts.icon)
  const [color, setColor] = useState<StackColor | null>(savedColor)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  // The stack shows the colour picked while the dialog is open, and its own again after.
  useEffect(() => previewStackColor(stackId, colours ? color : null), [stackId, color, colours])
  useEffect(() => () => previewStackColor(null), [])

  const keepColor = async () => {
    if (proNow() && color !== savedColor) await setStackColor(stackId, color)
  }

  const onSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const next = buildStackTitle(icon, parts.name)
      if (next && next !== title) await renameStack(stackId, next)
      // Without Pro or the trial the colour was a try-on and stays unsaved.
      await keepColor()
      await refresh()
      close()
    } catch (err) {
      reportError('save the stack', err)
    } finally {
      setBusy(false)
    }
  }

  const iconButton = (value: string | null, label: string, content: React.ReactNode) => {
    const on = icon === value
    return (
      <button
        key={label}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={label}
        title={label}
        data-stack-icon-option={value ?? 'none'}
        onClick={() => setIcon(value)}
        className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
          on ? 'bg-card ring-2 ring-focus' : 'ring-1 ring-line hover:ring-line-strong'
        }`}
      >
        {content}
      </button>
    )
  }

  return (
    <Modal
      title={colours ? 'Colour and icon' : 'Icon'}
      onClose={close}
      footer={
        <>
          <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSave} disabled={busy}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={onSave} className="flex flex-col gap-4" data-stack-style-dialog>
        <div>
          <Label>Icon</Label>
          <div role="radiogroup" aria-label="Icon" className="flex flex-wrap items-center gap-1.5">
            {iconButton(null, 'No icon', <span className="text-xs text-muted">None</span>)}
            {QUICK_ICONS.map((e) => iconButton(e, e, e))}
            {icon && !QUICK_ICONS.includes(icon) && iconButton(icon, icon, icon)}
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              className="h-8 rounded-md px-2 text-xs text-muted ring-1 ring-line hover:text-fg hover:ring-line-strong"
            >
              {picker ? 'Fewer' : 'More…'}
            </button>
          </div>
          {picker && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-xs text-muted">Loading…</div>}>
                <EmojiPicker
                  onEmojiClick={(d) => {
                    setIcon(d.emoji)
                    setPicker(false)
                  }}
                  width="100%"
                  height={300}
                  theme={scheme as Theme}
                />
              </Suspense>
            </div>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-muted">It goes before the name, in Chrome&rsquo;s bookmarks too.</p>
        </div>

        {colours && (
        <div>
          <Label>Colour</Label>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={color === null}
              data-stack-color-option="none"
              onClick={() => setColor(null)}
              className={`h-7 rounded-full px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                color === null ? 'bg-card text-strong ring-2 ring-focus' : 'text-muted ring-1 ring-line hover:text-fg hover:ring-line-strong'
              }`}
            >
              None
            </button>
            {STACK_COLORS.map((c) => {
              const on = color === c.id
              const chip = chipColors(c.id, scheme)
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c.name}
                  title={c.name}
                  data-stack-color-option={c.id}
                  onClick={() => setColor(c.id)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    on ? 'ring-2 ring-focus ring-offset-2 ring-offset-raised' : 'ring-1 ring-line'
                  }`}
                  style={{ background: chip.bg }}
                >
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3.5} style={{ color: chip.fg }} />}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">Chrome&rsquo;s tab group colours. Opening the stack as tabs uses it too.</p>
          {!proOn && color !== null && (
            <div className="mt-2">
              <KeepWithPro data-stack-color-try="" text="Colours are part of Stackboard Pro. Keep this colour:" onTrial={keepColor} />
            </div>
          )}
        </div>
        )}
      </form>
    </Modal>
  )
}
