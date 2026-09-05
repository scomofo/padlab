import type { Lesson } from '../engine/types'
import { estimateSessionMinutes, type PracticeSession } from '../lib/session'

export function SessionCard({ session, suggestion, lessons, onStart }: {
  session: PracticeSession | null
  suggestion: PracticeSession | null
  lessons: Lesson[]
  onStart: () => void
}) {
  const plan = session ?? suggestion
  const lesson = plan && lessons.find((l) => l.id === plan.lessonId)
  if (!plan || !lesson) return null
  const complete = plan.results.length === plan.rounds.length
  const notes = plan.results.reduce((sum, result) => sum + result.notesHit, 0)
  return (
    <section className={`session-card${complete ? ' complete' : ''}`} aria-labelledby="session-title">
      <div className="session-card-head">
        <div>
          <span className="session-kicker">{complete ? 'Time well spent' : 'One groove · three rounds'}</span>
          <h2 id="session-title">{complete ? 'Session complete' : session ? 'Your practice session' : 'Start a quick session'}</h2>
          <p>{lesson.title} · {complete ? `${notes} notes landed across three rounds` : `About ${estimateSessionMinutes(lesson, plan.rounds)} min of playing`}</p>
        </div>
        <span className="session-count">{plan.results.length}/{plan.rounds.length} rounds</span>
      </div>
      <ol className="session-rounds">
        {plan.rounds.map((round, index) => {
          const result = plan.results[index]
          return (
            <li key={index} className={result ? 'done' : index === plan.results.length ? 'current' : ''}
              aria-current={!complete && index === plan.results.length ? 'step' : undefined}>
              <span className="session-number" aria-hidden="true">{result ? '✓' : index + 1}</span>
              <div><strong>{round.label}</strong>
                <span>{round.label !== lesson.steps[round.stepIndex].name ? `${lesson.steps[round.stepIndex].name} · ` : ''}{Math.round(lesson.bpm * (lesson.steps[round.stepIndex].tempoScale ?? 1) * round.tempoPct / 100)} BPM</span>
                {result && <span className="session-round-result">{result.mode === 'practice' ? 'Practice completed' : `${result.accuracy}% accuracy`}</span>}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="session-card-foot">
        <p>{complete ? 'Good place to stop. Your progress is saved.' : session ? 'Finished rounds are saved. Pick up the next one when you’re ready.' : 'A short warmup, a little progress, and a clear finish. Pause whenever you need.'}</p>
        <button className="btn primary" onClick={onStart}>{complete ? 'Start another session ›' : session ? 'Resume session ›' : 'Start 3 rounds ›'}</button>
      </div>
    </section>
  )
}
