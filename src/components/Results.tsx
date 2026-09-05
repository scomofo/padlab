import { useEffect, useRef, useState } from 'react'
import type { ScoreSummary } from '../engine/scoring'
import type { Lesson } from '../engine/types'
import type { RunAward } from '../store/profile'
import { BADGE_LABEL, DAILY_XP_GOAL } from '../store/profile'
import { rankForXp } from '../lib/ranks'
import { nearMissHook, timingBuckets, timingLean } from '../lib/insight'
import type { DailyModifier } from '../lib/daily'

interface ResultsProps {
  summary: ScoreSummary
  newBest: boolean
  lessonTitle: string
  stepName: string
  /** Whether this run counted toward saved progress (Perform step). */
  scored: boolean
  award: RunAward | null
  /** Set when this visit is the daily groove: which twist, and whether this run cleared it. */
  daily?: { modifier: DailyModifier; cleared: boolean } | null
  nextLesson: Lesson | null
  onRetry: () => void
  onNext?: () => void
  onExit: () => void
}

const COUNT_MS = 900

/** Counts from `from` up to `to` over COUNT_MS; jumps straight there without rAF. */
function useCountUp(from: number, to: number): number {
  const [value, setValue] = useState(from)
  const frame = useRef(0)
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function' || from === to) {
      setValue(to)
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / COUNT_MS)
      const eased = 1 - (1 - k) * (1 - k) * (1 - k)
      setValue(Math.round(from + (to - from) * eased))
      if (k < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [from, to])
  return value
}

const BUCKET_LABEL: Record<string, string> = {
  'early-miss': 'Early',
  early: '',
  on: 'On',
  late: '',
  'late-miss': 'Late',
}

export function Results({
  summary, newBest, lessonTitle, stepName, scored, award, daily = null, nextLesson, onRetry, onNext, onExit,
}: ResultsProps) {
  const title =
    summary.stars >= 3 ? 'Clean'
    : summary.stars === 2 ? 'In the pocket'
    : summary.stars === 1 ? 'Keep digging'
    : 'Again'

  const xpBefore = award ? award.profile.xp - award.xpGained : 0
  const xpNow = useCountUp(xpBefore, award ? award.profile.xp : 0)
  const rank = rankForXp(xpNow)
  const hook = nearMissHook(summary)
  const buckets = timingBuckets(summary.deltas)
  const judged = summary.deltas.length
  const lean = timingLean(summary.deltas)
  const dailyXp = award?.profile.dailyXp ?? 0
  const dailyBefore = Math.max(0, dailyXp - (award?.xpGained ?? 0))
  const dailyShown = Math.min(DAILY_XP_GOAL, dailyBefore + (xpNow - xpBefore))

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
        {daily && scored && (
          <div className={daily.cleared ? 'daily-result cleared' : 'daily-result'}>
            {daily.cleared
              ? `Daily groove cleared${daily.modifier.id === 'standard' ? '' : ` · ${daily.modifier.name}`}`
              : `Daily not cleared — ${daily.modifier.rule}`}
          </div>
        )}
        {hook && <div className="results-hook">{hook}</div>}

        {judged > 0 && (
          <div className="timing" aria-label="Timing distribution">
            <div className="timing-bars">
              {buckets.map((b) => (
                <div key={b.id} className={`timing-col ${b.id}`}>
                  <span
                    className="timing-bar"
                    style={{ height: `${Math.max(b.count > 0 ? 8 : 2, Math.round((b.count / judged) * 100))}%` }}
                    title={`${b.count} ${b.id.replace('-miss', '')}`}
                  />
                  <span className="timing-label">{BUCKET_LABEL[b.id]}</span>
                </div>
              ))}
            </div>
            <div className="muted timing-caption">
              {lean.direction
                ? `Average ${Math.abs(lean.meanMs)} ms ${lean.direction}`
                : `Average ${Math.abs(lean.meanMs)} ms off · centred`}
            </div>
          </div>
        )}

        {award && (
          <div className="results-award">
            <div className="results-xp">
              +{award.xpGained} XP
              {award.streakGrew ? ` · ${award.profile.streak} day streak` : ''}
              {award.freezeUsed ? ' · Freeze used' : ''}
              {award.rankedUp ? ' · Rank up' : ''}
            </div>
            <div className="rank-row">
              <span className="rank-name">{rank.current.name}</span>
              <div className="stat-bar rank-bar"><span style={{ width: `${Math.round(rank.into * 100)}%` }} /></div>
              <span className="muted rank-next">
                {rank.next ? `${Math.max(0, rank.next.xp - xpNow)} to ${rank.next.name}` : 'Max rank'}
              </span>
            </div>
            <div className={award.profile.dailyXp >= DAILY_XP_GOAL ? 'daily-goal met' : 'daily-goal'}>
              <div className="stat-bar goal-bar"><span style={{ width: `${Math.round((dailyShown / DAILY_XP_GOAL) * 100)}%` }} /></div>
              <span>
                {award.dailyGoalHit
                  ? 'Daily goal hit 🎯'
                  : award.profile.dailyXp >= DAILY_XP_GOAL
                    ? 'Daily goal done — every run is a bonus now'
                    : `${DAILY_XP_GOAL - award.profile.dailyXp} XP to today’s goal`}
              </span>
            </div>
            {award.freezesEarned > 0 && (
              <div className="results-badges">❄ Streak freeze earned — one missed day won’t break your streak</div>
            )}
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
