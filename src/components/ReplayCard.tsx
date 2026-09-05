import type { Lesson } from '../engine/types'
import { comparableRuns, type PerformanceRun } from '../store/history'
import { PerformanceTrail } from './PerformanceTrail'

export function ReplayCard({ lessons, history, onReplay }: {
  lessons: Lesson[]
  history: PerformanceRun[]
  onReplay: (lesson: Lesson, tempoPct: number) => void
}) {
  // A daily twist has different rules; offer an ordinary, repeatable performance here.
  const latest = [...history].reverse().find((r) => r.variant === 'standard' && lessons.some((l) => l.id === r.lessonId))
  const lesson = latest && lessons.find((l) => l.id === latest.lessonId)
  if (!latest || !lesson) return null
  const runs = comparableRuns(history, latest)
  const best = Math.max(...runs.map((r) => r.accuracy))
  const target = best < 55 ? 'Aim for 55% and your first star.'
    : best < 75 ? 'Aim for 75% and two stars.'
    : best < 90 ? 'Aim for 90% and three stars.'
    : best < 100 ? `Your recent best is ${best}%. Can you beat it?`
    : '100% in the bank. Make it feel effortless.'
  return (
    <section className="replay-card" aria-labelledby="replay-title">
      <div className="replay-copy">
        <span className="replay-kicker">Your last groove</span>
        <h2 id="replay-title">{lesson.title}</h2>
        <p>Last run {latest.accuracy}% · Perform at {latest.tempoPct}% tempo</p>
        <p>{target}</p>
      </div>
      <PerformanceTrail runs={runs} />
      <button className="btn" onClick={() => onReplay(lesson, latest.tempoPct)}>Replay Perform ›</button>
    </section>
  )
}
