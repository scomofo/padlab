import { useEffect, useState } from 'react'
import { COUNT_IN_BEATS, type PlayerRuntime, type PlayMode } from '../engine/player'
import type { Lesson } from '../engine/types'

export function readRunStatus(runtime: PlayerRuntime | null) {
  const score = runtime?.score?.summary()
  // summary() treats future notes as misses for final-score accounting.
  // A live denominator must count only events actually judged so far.
  const judged = runtime?.score?.events.reduce((n, e) => n + (e.judgement ? 1 : 0), 0) ?? 0
  const accuracy = score && judged > 0 ? Math.max(0, Math.round(
    (score.perfect + score.great * 0.85 + score.good * 0.5) / judged * 100
    - Math.min(20, score.stray / judged * 100 * 0.5))) : null
  const recent = runtime?.feedback.filter((f) => f.deltaMs !== undefined && performance.now() - f.wall < 700).at(-1)
  return { beat: runtime?.transport.now() ?? 0, combo: runtime?.score?.combo ?? 0,
    accuracy, judged, deltaMs: recent?.deltaMs,
    waiting: runtime?.waitingPads ? [...runtime.waitingPads].join(' + ') : null }
}

export function RunStatus({ runtime, lesson, stepIndex, tempoPct, mode }: {
  runtime: PlayerRuntime | null; lesson: Lesson; stepIndex: number; tempoPct: number; mode: PlayMode
}) {
  const [status, setStatus] = useState(() => readRunStatus(runtime))
  useEffect(() => {
    setStatus(readRunStatus(runtime))
    if (!runtime) return
    // Both O(n) score aggregation and React updates are bounded to 10 Hz.
    const timer = window.setInterval(() => setStatus(readRunStatus(runtime)), 100)
    return () => window.clearInterval(timer)
  }, [runtime])
  const step = lesson.steps[stepIndex]
  const total = lesson.bars * 4
  const scale = Math.min(1.2, Math.max(0.25, (step.tempoScale ?? 1) * tempoPct / 100))
  const bpm = Math.round(lesson.bpm * scale)
  const position = Math.max(0, Math.min(total, status.beat))
  const phase = !runtime ? 'Ready' : status.waiting ? `Tap pads ${status.waiting}`
    : status.beat < 0 ? `Count-in · ${Math.min(COUNT_IN_BEATS, Math.ceil(-status.beat))}`
    : status.beat >= total ? 'Finishing' : `Bar ${Math.floor(status.beat / 4) + 1} of ${lesson.bars}`
  const timing = status.deltaMs === undefined ? (mode === 'listen' ? 'Listen and follow the pads' : 'Play the bright lanes')
    : Math.abs(status.deltaMs) <= 15 ? 'On time' : `${status.deltaMs < 0 ? 'Early' : 'Late'} ${Math.round(Math.abs(status.deltaMs))} ms`
  return <section className="run-status" aria-label="Run status">
    <div className="run-context"><span className={`mode-tag mode-${mode}`}>{mode}</span>
      <strong>{step.name}</strong><span className="muted">{bpm} BPM</span>
    </div>
    <div className="run-position"><span>{phase}</span>
      <progress aria-label="Lesson progress" value={position} max={total} />
    </div>
    <div className="run-metrics">
      {mode === 'play' && <><span><b>{status.accuracy === null ? '—' : `${status.accuracy}%`}</b><small>accuracy so far</small></span>
        <span><b>{status.combo}×</b><small>combo</small></span></>}
      <span className="run-timing">{timing}</span>
    </div>
  </section>
}
