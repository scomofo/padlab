import { useEffect, useMemo, useRef } from 'react'
import type { Lesson } from '../engine/types'
import { SOUND_LABELS } from '../engine/types'
import { padColor, padSoundFor } from '../engine/kits'
import { keyLabelForPad, padBus } from '../input/inputBus'
import { unlockAudio } from '../audio/audio'
import { autoFlashBus } from '../input/flashBus'

interface PadGridProps {
  padCount: 8 | 16
  lesson?: Lesson | null
  /** Pads charted in the current lesson (get their lane color); others render dim. */
  activePads?: Set<number>
  /** Smaller pads for the home warmup strip. */
  compact?: boolean
}

export function PadGrid({ padCount, lesson = null, activePads, compact = false }: PadGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const timeouts = useRef<Map<number, number>>(new Map())

  const rows = useMemo(() => {
    const r: number[][] = []
    const rowCount = padCount / 4
    for (let row = rowCount - 1; row >= 0; row--) {
      r.push([1, 2, 3, 4].map((c) => row * 4 + c))
    }
    return r
  }, [padCount])

  useEffect(() => {
    const flash = (pad: number, cls: string) => {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-pad="${pad}"]`)
      if (!el) return
      el.classList.remove('hit', 'auto')
      // force reflow so re-adding the class restarts the animation
      void el.offsetWidth
      el.classList.add(cls)
      const prev = timeouts.current.get(pad)
      if (prev) window.clearTimeout(prev)
      timeouts.current.set(
        pad,
        window.setTimeout(() => el.classList.remove('hit', 'auto'), 160),
      )
    }
    const un1 = padBus.subscribe((e) => flash(e.pad, 'hit'))
    const un2 = autoFlashBus.subscribe((pad) => flash(pad, 'auto'))
    return () => {
      un1()
      un2()
      for (const id of timeouts.current.values()) window.clearTimeout(id)
    }
  }, [])

  return (
    <div ref={gridRef} className={`pad-grid pads-${padCount}${compact ? ' compact' : ''}`}>
      {rows.map((row, ri) => (
        <div className="pad-row" key={ri}>
          {row.map((pad) => {
            const sound = padSoundFor(lesson, padCount, pad)
            const active = activePads ? activePads.has(pad) : true
            const key = keyLabelForPad(pad)
            return (
              <button
                key={pad}
                type="button"
                data-pad={pad}
                className={`pad ${active ? 'active' : 'inactive'}`}
                style={{ ['--pad-color' as string]: padColor(pad) }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  unlockAudio()
                  padBus.emit({ pad, velocity: 100, source: 'pointer' })
                }}
              >
                <span className="pad-num">{pad}</span>
                {key && <span className="pad-key">{key}</span>}
                <span className="pad-sound">{sound ? SOUND_LABELS[sound] : ''}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
