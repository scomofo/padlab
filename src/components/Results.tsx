import { useEffect, useRef, useState } from 'react'
import type { ScoreSummary } from '../engine/scoring'
import type { Lesson } from '../engine/types'
import type { RunAward } from '../store/profile'
import { BADGE_LABEL, DAILY_XP_GOAL } from '../store/profile'
import { rankForXp } from '../lib/ranks'
import { nearMissHook, timingBuckets, timingLean } from '../lib/insight'
import type { DailyModifier } from '../lib/daily'
import { FOCUS_REPEATS, focusTempo, phraseLabel, type FocusPhrase } from '../lib/focus'
import type { PerformanceRun } from '../store/history'
import { PerformanceTrail } from './PerformanceTrail'

interface ResultsProps {
  summary: ScoreSummary
  newBest: boolean
  lessonTitle: string
  stepName: string
  /** Whether this run counted toward saved progress (Perform step). */
  scored: boolean
  /** Perform played below full tempo: shown as practice, nothing saved. */
  slowed?: boolean
  focusPractice?: boolean
  focusPhrase?: FocusPhrase | null
  onFocus?: (phrase: FocusPhrase) => void
  onReturnFromFocus?: () => void
  returnStepName?: string
  performances?: PerformanceRun[]
  /** Practice step finished at one star or better, so its checkmark is saved. */
  stepCleared?: boolean
  stepNumber?: number
  stepCount?: number
  /** Tempo the run was played at; shown when it is not 100. */
  tempoPct?: number
  /** Tempo-ladder rung this run cleared, if any. */
  newRung?: number | null
  /** Next rung still open after this run, for the nudge line. */
  nextRung?: number | null
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
    if (typeof requestAnimationFrame !== 'function' || from === to
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
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
  summary, newBest, lessonTitle, stepName, scored, slowed = false, stepCleared = false, stepNumber, stepCount, tempoPct = 100,
  focusPractice = false, focusPhrase = null, onFocus, onReturnFromFocus, returnStepName, performances = [],
  newRung = null, nextRung = null, award, daily = null, nextLesson, onRetry, onNext, onExit,
}: ResultsProps) {
  const title =
    focusPractice ? (summary.stars >= 3 ? 'Phrase locked in' : 'Finding the feel')
    : summary.stars >= 3 ? 'Clean'
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
  const previousRun = performances.at(-2)
  const improvement = previousRun ? summary.accuracy - previousRun.accuracy : null
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title" ref={dialog} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onExit() }
        if (event.key !== 'Tab') return
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!buttons?.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
          event.preventDefault(); first.focus()
        }
      }}>
      <div className="results-card">
        <span className="muted">{lessonTitle} — {stepName}{tempoPct !== 100 ? ` · ${tempoPct}%` : ''}</span>
        <h2 id="results-title" className="results-title">{title}</h2>
        <div className="stars big">
          {[1, 2, 3].map((s) => (
            <span key={s} className={summary.stars >= s ? 'star on pop' : 'star'}>★</span>
          ))}
        </div>
        <div className="accuracy">{summary.accuracy}%</div>
        {newBest && <div className="new-best">New best!</div>}
        {newRung && <div className="new-best">⚡ {newRung}% mastered{nextRung ? ` — next rung ${nextRung}%` : ' — full speed, ladder topped out'}</div>}
        {!newRung && scored && summary.stars >= 3 && nextRung && (
          <div className="results-hook ladder-nudge">Mastered. Try the ladder: 3 stars at {nextRung}%</div>
        )}
        {daily && scored && (
          <div className={daily.cleared ? 'daily-result cleared' : 'daily-result'}>
            {daily.cleared
              ? `Daily groove cleared${daily.modifier.id === 'standard' ? '' : ` · ${daily.modifier.name}`}`
              : `Daily not cleared — ${daily.modifier.rule}`}
          </div>
        )}
        {hook && <div className="results-hook">{hook}</div>}

        {performances.length > 0 && (
          <div className="performance-comparison">
            <strong>{improvement === null ? 'Your first recorded run'
              : improvement > 0 ? `+${improvement} points since last time`
              : improvement === 0 ? 'Matched your last run'
              : `Last time ${previousRun!.accuracy}% · this time ${summary.accuracy}%`}</strong>
            <span>{improvement === null ? 'Replay this groove to see your progress.' : `Same groove · ${tempoPct}% tempo · same challenge rules`}</span>
            <PerformanceTrail runs={performances} />
          </div>
        )}

        {focusPhrase && onFocus && (
          <div className="focus-suggestion">
            <strong>A smaller part to work on</strong>
            <p>{phraseLabel(focusPhrase)} · {focusPhrase.misses > 0 ? `${focusPhrase.misses} of ${focusPhrase.total} notes missed` : `${focusPhrase.offTime} hits to tighten up`}</p>
            <p>{FOCUS_REPEATS} repeats at {focusTempo(tempoPct)}% tempo. Then try the full step again.</p>
            <button className="btn primary" onClick={() => onFocus(focusPhrase)}>Practice {phraseLabel(focusPhrase).toLowerCase()} ›</button>
          </div>
        )}

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
        {slowed && (
          <div className="muted">Played at {tempoPct}% — stars, streak and the daily need full tempo. Set 100% and go again.</div>
        )}
        {focusPractice && <div className="focus-note">Practice XP earned. Take this feel back to the full groove. Complete Perform for stars and daily credit.</div>}
        {!focusPractice && !scored && !slowed && stepCleared && (
          <div className="step-cleared">✓ Step {stepNumber}{stepCount ? ` of ${stepCount}` : ''} done — Perform is where the stars are</div>
        )}
        {!focusPractice && !scored && !slowed && !stepCleared && (
          <div className="muted">One star ticks this step off. Stars, streak and the daily come from Perform.</div>
        )}
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
          <button className="btn" onClick={onRetry}>{focusPractice ? 'Repeat phrase' : 'Retry'}</button>
          {focusPractice && onReturnFromFocus && (
            <button className="btn primary" onClick={onReturnFromFocus}>Back to {returnStepName ?? 'full groove'} ›</button>
          )}
          {onNext && (
            <button className="btn primary" onClick={onNext}>
              {nextLesson ? `Next: ${nextLesson.title} ›` : 'Next step ›'}
            </button>
          )}
          {!onNext && !focusPractice && <button className="btn primary" onClick={onExit}>Studio</button>}
        </div>
        {(focusPractice || onNext) && (
          <button className="btn ghost" onClick={onExit}>Back to studio</button>
        )}
      </div>
    </div>
  )
}
