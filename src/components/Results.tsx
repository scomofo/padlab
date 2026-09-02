import type { ScoreSummary } from '../engine/scoring'
import type { Lesson } from '../engine/types'
import type { RunAward } from '../store/profile'
import { BADGE_LABEL } from '../store/profile'

interface ResultsProps {
  summary: ScoreSummary
  newBest: boolean
  lessonTitle: string
  stepName: string
  /** Whether this run counted toward saved progress (Perform step). */
  scored: boolean
  award: RunAward | null
  nextLesson: Lesson | null
  onRetry: () => void
  onNext?: () => void
  onExit: () => void
}

export function Results({
  summary, newBest, lessonTitle, stepName, scored, award, nextLesson, onRetry, onNext, onExit,
}: ResultsProps) {
  const title =
    summary.stars >= 3 ? 'Clean'
    : summary.stars === 2 ? 'In the pocket'
    : summary.stars === 1 ? 'Keep digging'
    : 'Again'

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="results-card">
        <span className="muted">{lessonTitle} — {stepName}</span>
        <h2 id="results-title" className="results-title">{title}</h2>
        <div className="stars big">
          {[1, 2, 3].map((s) => (
            <span key={s} className={summary.stars >= s ? 'star on pop' : 'star'}>★</span>
          ))}
        </div>
        <div className="accuracy">{summary.accuracy}%</div>
        {newBest && <div className="new-best">New best!</div>}
        {award && (
          <div className="results-xp">
            +{award.xpGained} XP
            {award.streakGrew ? ` · ${award.profile.streak} day streak` : ''}
            {award.rankedUp ? ' · Rank up' : ''}
          </div>
        )}
        {!scored && <div className="muted">Practice steps aren’t scored toward progress — finish with Perform.</div>}
        <div className="judge-row">
          <span className="chip perfect">Perfect {summary.perfect}</span>
          <span className="chip great">Great {summary.great}</span>
          <span className="chip good">Good {summary.good}</span>
          <span className="chip miss">Miss {summary.miss}</span>
          {summary.stray > 0 && <span className="chip stray">Extra {summary.stray}</span>}
        </div>
        <div className="muted">Max combo: {summary.maxCombo}</div>
        {award && award.newBadges.length > 0 && (
          <div className="results-badges">
            {award.newBadges.map((b) => BADGE_LABEL[b] ?? b).join(' · ')}
          </div>
        )}
        <div className="results-actions">
          <button className="btn" onClick={onRetry}>Retry</button>
          {onNext && (
            <button className="btn primary" onClick={onNext}>
              {scored && nextLesson ? `Next: ${nextLesson.title} ›` : 'Next step ›'}
            </button>
          )}
          {!onNext && <button className="btn primary" onClick={onExit}>Studio</button>}
        </div>
        {onNext && scored && (
          <button className="btn ghost" onClick={onExit}>Back to studio</button>
        )}
      </div>
    </div>
  )
}
