import type { ScoreSummary } from '../engine/scoring'

interface ResultsProps {
  summary: ScoreSummary
  newBest: boolean
  lessonTitle: string
  stepName: string
  /** Whether this run counted toward saved progress (Perform step). */
  scored: boolean
  onRetry: () => void
  onNext?: () => void
  onExit: () => void
}

export function Results({ summary, newBest, lessonTitle, stepName, scored, onRetry, onNext, onExit }: ResultsProps) {
  return (
    <div className="overlay">
      <div className="results-card">
        <span className="muted">{lessonTitle} — {stepName}</span>
        <div className="stars big">
          {[1, 2, 3].map((s) => (
            <span key={s} className={summary.stars >= s ? 'star on' : 'star'}>★</span>
          ))}
        </div>
        <div className="accuracy">{summary.accuracy}%</div>
        {newBest && <div className="new-best">New best!</div>}
        {!scored && <div className="muted">Practice steps aren’t scored toward progress — finish with Perform.</div>}
        <div className="judge-row">
          <span className="chip perfect">Perfect {summary.perfect}</span>
          <span className="chip great">Great {summary.great}</span>
          <span className="chip good">Good {summary.good}</span>
          <span className="chip miss">Miss {summary.miss}</span>
          {summary.stray > 0 && <span className="chip stray">Extra {summary.stray}</span>}
        </div>
        <div className="muted">Max combo: {summary.maxCombo}</div>
        <div className="results-actions">
          <button className="btn" onClick={onRetry}>Retry</button>
          {onNext && <button className="btn primary" onClick={onNext}>Next step ›</button>}
          {!onNext && <button className="btn primary" onClick={onExit}>Done</button>}
        </div>
      </div>
    </div>
  )
}
