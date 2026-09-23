import type { PlayerRuntime } from '../engine/player'

/** Snapshot of the live run for the status strip: beat, combo, accuracy, etc. */
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
    accuracy, judged, score: score?.accuracy ?? 0, deltaMs: recent?.deltaMs,
    waiting: runtime?.waitingPads ? [...runtime.waitingPads].join(' + ') : null }
}
