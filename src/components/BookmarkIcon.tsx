import { useEffect, useState } from 'react'
import { faviconUrl, monogram, peekFavicon, resolveFavicon, type ResolvedIcon } from '../lib/favicon'

interface Props {
  /** Leading emoji from the title; wins over the favicon. */
  emoji: string | null
  /** Display title, for the monogram letter. */
  title: string
  url: string
}

export function BookmarkIcon({ emoji, title, url }: Props) {
  if (emoji) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none">
        {emoji}
      </span>
    )
  }
  const src = faviconUrl(url, 32)
  // Keyed by src so an edited URL starts a fresh check.
  return <Favicon key={src} src={src} title={title} url={url} />
}

function Favicon({ src, title, url }: { src: string; title: string; url: string }) {
  const [icon, setIcon] = useState<ResolvedIcon | undefined>(() => peekFavicon(src))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (icon) return
    let live = true
    void resolveFavicon(src).then((r) => live && setIcon(r))
    return () => {
      live = false
    }
  }, [src, icon])

  // Until resolved, hold the space so the title doesn't shift; a site with no icon never
  // flashes Chrome's grey globe on its way to the monogram.
  if (!icon) return <span aria-hidden className="h-4 w-4 shrink-0" />

  if (icon.generic || failed) {
    const m = monogram(title, url)
    return (
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 select-none items-center justify-center rounded-[4px] text-[10px] font-bold leading-none"
        style={{ backgroundColor: m.bg, color: m.fg }}
      >
        {m.letter}
      </span>
    )
  }

  return (
    <img
      src={icon.src}
      alt=""
      width={16}
      height={16}
      draggable={false}
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  )
}
