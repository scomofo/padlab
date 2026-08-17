import { useMemo } from 'react'
import { padColor } from '../engine/kits'

interface PadDiagramProps {
  padCount: 8 | 16
  /** Pads to highlight, with a short caption each. */
  highlight: { pad: number; label: string }[]
}

/** Non-interactive pad map used by the hardware guides. */
export function PadDiagram({ padCount, highlight }: PadDiagramProps) {
  const labels = useMemo(
    () => new Map(highlight.map((h) => [h.pad, h.label])),
    [highlight],
  )

  const rows = useMemo(() => {
    const r: number[][] = []
    for (let row = padCount / 4 - 1; row >= 0; row--) {
      r.push([1, 2, 3, 4].map((c) => row * 4 + c))
    }
    return r
  }, [padCount])

  return (
    <div className="pad-diagram" aria-hidden="true">
      {rows.map((row, ri) => (
        <div className="diagram-row" key={ri}>
          {row.map((pad) => {
            const label = labels.get(pad)
            return (
              <div
                key={pad}
                className={label ? 'diagram-pad on' : 'diagram-pad'}
                style={{ ['--pad-color' as string]: padColor(pad) }}
              >
                <span className="diagram-num">{pad}</span>
                {label && <span className="diagram-label">{label}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
