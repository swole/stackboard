import type { PaletteId, Scheme } from '../lib/appearance'

/** A thumbnail board drawn with the real tokens of one palette variant. */
export function MiniBoard({ palette, scheme }: { palette: PaletteId; scheme: Scheme }) {
  const stacks = [3, 4, 2]
  return (
    <span
      aria-hidden
      data-palette={palette}
      data-scheme={scheme}
      className="absolute inset-0 overflow-hidden rounded-lg bg-canvas"
    >
      <span className="absolute inset-y-0 left-0 w-[22%] border-r border-line bg-panel">
        <span className="absolute left-[20%] top-[13%] h-[5px] w-[42%] rounded-full bg-accent" />
        <span className="absolute left-[20%] top-[32%] h-[4px] w-[60%] rounded-full bg-selected" />
        <span className="absolute left-[20%] top-[45%] h-[4px] w-[48%] rounded-full bg-line-strong" />
        <span className="absolute left-[20%] top-[58%] h-[4px] w-[54%] rounded-full bg-line-strong" />
      </span>
      <span className="absolute left-[28%] right-[6%] top-[15%] grid grid-cols-3 items-start gap-[6%]">
        {stacks.map((n, c) => (
          <span key={c} className="flex flex-col gap-[3px] rounded-[3px] bg-well p-[2px]">
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className="flex h-[7px] items-center gap-[2px] rounded-[2px] bg-card px-[2px]">
                <span className={`h-[3px] w-[3px] shrink-0 rounded-full ${c === 0 && i === 0 ? 'bg-accent' : 'bg-faint'}`} />
                <span className="h-[2px] flex-1 rounded-full bg-muted opacity-60" />
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}
