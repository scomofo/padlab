import { useMemo } from 'react'
import { padColor } from '../engine/kits'
import type { Lesson } from '../engine/types'

/** A compact, sixteenth-note overview of the chart's opening bars. */
export function RhythmPreview({ lesson }: { lesson: Lesson }) {
  const bars = Math.min(2, lesson.bars)
  const columns = useMemo(() => {
    const bins = Array.from({ length: bars * 16 }, () => new Set<number>())
    for (const event of lesson.events) {
      if (event.t >= 0 && event.t < bars * 4) bins[Math.floor(event.t * 4)].add(event.pad)
    }
    return bins.map((pads) => [...pads].sort((a, b) => a - b))
  }, [lesson.events, bars])

  return (
    <div className="rhythm-preview" aria-hidden="true">
      <div className="rhythm-preview-label"><span>Opening {bars === 1 ? 'bar' : `${bars} bars`}</span><span>01 — {String(bars).padStart(2, '0')}</span></div>
      <svg viewBox={`0 0 ${columns.length * 8} 34`} preserveAspectRatio="none">
        {columns.map((pads, i) => {
          const height = 8 + Math.min(4, pads.length) * 5
          return <g key={i}>
            {i % 4 === 0 && <path d={`M${i * 8 + 2.5} 0v3`} className="rhythm-beat" />}
            {pads.length === 0 ? <rect x={i * 8} y={30} width={5} height={2} rx={1} className="rhythm-rest" />
              : pads.map((pad, j) => <rect key={pad} x={i * 8} y={32 - height + j * height / pads.length}
                width={5} height={Math.max(1, height / pads.length - 1)} rx={1} fill={padColor(pad)} />)}
          </g>
        })}
      </svg>
    </div>
  )
}
