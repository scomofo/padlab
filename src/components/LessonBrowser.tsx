import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Lesson, LessonProgress } from '../engine/types'
import type { Guide } from '../guides/types'
import type { GuideProgress } from '../store/progress'
import type { Profile } from '../store/profile'
import { DAILY_XP_GOAL, displayStreak, streakStatus } from '../store/profile'
import { COURSES } from '../lessons/courses'
import { courseProgress, totalStars } from '../lessons/courseProgress'
import { midi } from '../midi/midiManager'
import { dailyLesson, recommendLesson, resumeStep, stepDone, stepsDoneCount, weekDots } from '../lib/curriculum'
import { dailyBlurb, dailyModifier } from '../lib/daily'
import { ladderLabel } from '../lib/ladder'
import { rankForXp } from '../lib/ranks'
import { PadGrid } from './PadGrid'
import { usePadKeyboard } from '../input/usePadKeyboard'
import { padBus } from '../input/inputBus'
import { unlockAudio } from '../audio/audio'
import type { PerformanceRun } from '../store/history'
import { ReplayCard } from './ReplayCard'
import { SessionCard } from './SessionCard'
import { buildSession, type PracticeSession } from '../lib/session'
import { useLocalDay } from '../lib/useLocalDay'

interface LessonBrowserProps {
  lessons: Lesson[]
  guides: Guide[]
  progress: Record<string, LessonProgress>
  guideProgress: Record<string, GuideProgress>
  profile: Profile
  history: PerformanceRun[]
  session: PracticeSession | null
  onStartSession: () => void
  onOpen: (lesson: Lesson, opts?: { daily?: boolean; autoStart?: boolean; perform?: boolean; tempoPct?: number }) => void
  onOpenGuide: (guide: Guide) => void
  onOpenSetup: () => void
  /** False while DeviceSetup overlay is open — its own 16-pad listener owns keys. */
  keyboardEnabled?: boolean
}

type Filter = 'all' | 8 | 16

export function LessonBrowser({
  lessons, guides, progress, guideProgress, profile, history, session, onStartSession, onOpen, onOpenGuide, onOpenSetup,
  keyboardEnabled = true,
}: LessonBrowserProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [, bump] = useState(0)
  const [jammed, setJammed] = useState(false)
  const today = useLocalDay()

  useEffect(() => midi.onStatusChange(() => bump((n) => n + 1)), [])
  useEffect(() => padBus.subscribe(() => setJammed(true)), [])
  usePadKeyboard(8, keyboardEnabled)

  const filtered = useMemo(
    () => lessons.filter((l) => filter === 'all' || l.padCount === filter),
    [lessons, filter],
  )

  const filteredGuides = useMemo(
    () => guides.filter((g) => filter === 'all' || g.padCount === filter),
    [guides, filter],
  )

  const byCourse = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const l of filtered) {
      const list = map.get(l.course)
      if (list) list.push(l)
      else map.set(l.course, [l])
    }
    return map
  }, [filtered])

  const guidesByCourse = useMemo(() => {
    const map = new Map<string, Guide[]>()
    for (const g of filteredGuides) {
      const list = map.get(g.course)
      if (list) list.push(g)
      else map.set(g.course, [g])
    }
    return map
  }, [filteredGuides])

  const next = recommendLesson(lessons, progress, profile.lastLessonId)
  const daily = dailyLesson(lessons, progress)
  const twist = dailyModifier(progress)
  const fresh = profile.xp === 0 && Object.keys(progress).length === 0
  const startLesson = fresh ? lessons.find((l) => l.id === 'first-taps') ?? next : next
  const rank = rankForXp(profile.xp)
  const stars = totalStars(lessons, progress)
  const status = streakStatus(profile)
  const shownStreak = displayStreak(profile)
  const dailyXp = profile.dailyXpDate === today ? profile.dailyXp : 0
  const dailyDone = profile.dailyChallengeDate === today && profile.dailyChallengeDone
  const dailyPct = Math.min(100, Math.round((dailyXp / DAILY_XP_GOAL) * 100))
  const dots = weekDots(profile.week)
  const minutes = Math.round(profile.secondsPracticed / 60)

  const device = midi.inputs[0]
  const extraInputs = midi.inputs.length - 1
  const deviceLabel =
    midi.status === 'unsupported' ? 'Web MIDI unavailable — use Chrome/Edge (keys still work)'
    : midi.status === 'denied' ? 'MIDI access blocked — keys & pads still work'
    : device
      ? `${device.name}${extraInputs > 0 ? ` +${extraInputs}` : ''} — ${midi.customMap ? 'custom mapping' : device.profile.label}`
    : 'No MIDI device — keyboard & pads work'

  return (
    <div className="browser">
      <header className="browser-head">
        <div>
          <div className="logo">Pad<span>Lab</span></div>
          <div className="muted tagline">Finger drumming. One groove at a time.</div>
        </div>
        <button className="device-chip" onClick={onOpenSetup}>
          <span className={device ? 'dot on' : 'dot'} />
          {deviceLabel}
          <span className="gear">⚙</span>
        </button>
      </header>

      <section className="hub-stats">
        <div className="stat-card">
          <div className="stat-label">
            {status === 'safe' ? '🔥 Streak' : status === 'at-risk' ? '⚠ Streak at risk' : status === 'frozen' ? '❄ Streak frozen' : 'Streak'}
          </div>
          <div className={status === 'at-risk' ? 'stat-value warn' : status === 'frozen' ? 'stat-value frost' : 'stat-value'}>
            {shownStreak > 0 ? `${shownStreak}d` : '—'}
          </div>
          <div className="muted">
            {status === 'safe' ? 'Goal done today'
              : status === 'at-risk' ? 'Perform today to keep it'
              : status === 'frozen' ? 'Perform today to save it'
              : status === 'broken' ? `Best: ${profile.longestStreak}d · start again`
              : 'Play a Perform step'}
          </div>
          {profile.freezes > 0 && (
            <div className="streak-freezes">{'❄'.repeat(profile.freezes)} {profile.freezes === 1 ? '1 freeze' : `${profile.freezes} freezes`}</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">{rank.current.name}</div>
          <div className="stat-value">{profile.xp} XP</div>
          <div className="muted">{rank.next ? `${rank.next.xp - profile.xp} to ${rank.next.name}` : 'Max rank'}</div>
          <div className="stat-bar"><span style={{ width: `${Math.round(rank.into * 100)}%` }} /></div>
        </div>
        <div className="stat-card goal">
          <div className="stat-label">Today</div>
          <div className="stat-value">{dailyXp}<span className="muted"> / {DAILY_XP_GOAL} XP</span></div>
          <div className="muted">{dailyPct >= 100 ? `Goal done · ${stars} ★ · ${minutes} min` : `${stars} ★ · ${minutes} min on pads`}</div>
          <div className="goal-ring" style={{ '--pct': `${dailyPct}%` } as CSSProperties} aria-label={`Daily goal ${dailyPct}%`}>
            <span>{dailyPct}%</span>
          </div>
        </div>
      </section>

      <div className="week-dots" aria-label="Last seven days">
        {dots.map((on, i) => (
          <span key={i} className={on ? (i === 6 ? 'week-dot on today' : 'week-dot on') : (i === 6 ? 'week-dot today' : 'week-dot')} />
        ))}
      </div>

      <SessionCard lessons={lessons} session={session}
        suggestion={buildSession(lessons, progress, profile.lastLessonId)} onStart={onStartSession} />

      <section className="hub-actions">
        <button
          className="continue-card"
          onClick={() => {
            void unlockAudio()
            onOpen(startLesson, { autoStart: true })
          }}
        >
          <span className="muted kicker">{fresh ? 'Start here' : 'Continue'}</span>
          <h2>{fresh ? 'First Taps' : next.title}</h2>
          <p className="muted">
            {fresh
              ? 'One kick. Four beats. Land on the click.'
              : `${next.genre} · ${next.bpm} BPM · LV ${next.level} · Step ${resumeStep(next, progress[next.id]) + 1} of ${next.steps.length}: ${next.steps[resumeStep(next, progress[next.id])].name}`}
          </p>
          <span className="btn primary play-now">{fresh ? 'Play now ›' : 'Keep going ›'}</span>
        </button>
        <button
          className="daily-card"
          onClick={() => {
            void unlockAudio()
            onOpen(daily, { daily: true, autoStart: true })
          }}
        >
          <span className="muted kicker">Daily groove{twist.id !== 'standard' ? ` · ${twist.name}` : ''}</span>
          <h2>{daily.title}</h2>
          <p className="muted">{dailyBlurb(daily, twist)}</p>
          {twist.id !== 'standard' && <p className="muted daily-rule">{twist.rule}</p>}
          <span className={dailyDone ? 'daily-status done' : 'daily-status'}>
            {dailyDone ? 'Cleared today' : 'Take it on ›'}
          </span>
        </button>
      </section>

      <ReplayCard lessons={lessons} history={history} onReplay={(lesson, tempoPct) => {
        void unlockAudio()
        onOpen(lesson, { autoStart: true, perform: true, tempoPct })
      }} />

      <div className="filter-row">
        {([['all', 'All lessons'], [8, '8 pads · MPK Mini'], [16, '16 pads · SP-404']] as [Filter, string][]).map(
          ([f, label]) => (
            <button key={String(f)} className={filter === f ? 'chip-btn on' : 'chip-btn'} onClick={() => setFilter(f)}>
              {label}
            </button>
          ),
        )}
      </div>

      {COURSES.map((course) => {
        const courseLessons = byCourse.get(course.id) ?? []
        const courseGuides = guidesByCourse.get(course.id) ?? []
        if (!courseLessons.length && !courseGuides.length) return null
        const cp = courseProgress(courseLessons, courseGuides, progress, guideProgress)
        return (
          <section className="course" key={course.id}>
            <div className="course-head">
              <div>
                <h2 className="course-title">{course.title}</h2>
                <div className="muted">{course.blurb}</div>
              </div>
              <span className="course-count muted">
                {cp.done}/{cp.total} {cp.noun}
              </span>
            </div>
            <div className="course-progress">
              <div className={cp.pct === 100 ? 'course-progress-fill maxed' : 'course-progress-fill'} style={{ width: `${cp.pct}%` }} />
            </div>
            <div className="lesson-grid">
              {courseGuides.map((g) => {
                const gp = guideProgress[g.id]
                return (
                  <button key={g.id} className="lesson-card guide-card" onClick={() => onOpenGuide(g)}>
                    <div className="card-top">
                      <span className="guide-chip">WALKTHROUGH</span>
                      <span className="pads-chip">{g.minutes} MIN</span>
                    </div>
                    <h3>{g.title}</h3>
                    <div className="muted">{g.blurb}</div>
                    <div className="card-bottom">
                      <span className="muted">{g.steps.length} steps</span>
                      {gp?.completed ? (
                        <span className="done-badge">✓ Done</span>
                      ) : gp ? (
                        <span className="muted">step {gp.lastStep + 1}</span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
              {courseLessons.map((l) => {
                const p = progress[l.id]
                return (
                  <button key={l.id} className="lesson-card" onClick={() => onOpen(l)}>
                    <div className="card-top">
                      <span className={`level-chip lv${l.level}`}>LV {l.level}</span>
                      <span className="pads-chip">{l.padCount} PADS</span>
                    </div>
                    <h3>{l.title}</h3>
                    <div className="muted">{l.genre} · {l.bpm} BPM · {l.bars} bars</div>
                    <div className="step-dots" aria-label={`${stepsDoneCount(l, p)} of ${l.steps.length} steps done`}>
                      {l.steps.map((st, i) => (
                        <span
                          key={i}
                          className={stepDone(l, p, i) ? 'step-dot on' : i === resumeStep(l, p) && stepsDoneCount(l, p) > 0 ? 'step-dot next' : 'step-dot'}
                          title={st.name}
                        />
                      ))}
                      {stepsDoneCount(l, p) > 0 && (p?.stars ?? 0) === 0 && (
                        <span className="muted step-dots-label">{l.steps[resumeStep(l, p)]?.name}</span>
                      )}
                    </div>
                    <div className="card-bottom">
                      <span className={(p?.stars ?? 0) >= 3 ? 'stars maxed' : 'stars'}>
                        {[1, 2, 3].map((s) => (
                          <span key={s} className={(p?.stars ?? 0) >= s ? 'star on' : 'star'}>★</span>
                        ))}
                      </span>
                      {ladderLabel(l, p) && <span className="ladder-chip" title="Tempo ladder: fastest 3-star Perform">{ladderLabel(l, p)}</span>}
                      {p && p.bestAccuracy > 0 && <span className="best muted">best {p.bestAccuracy}%</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 && filteredGuides.length === 0 && (
        <div className="muted empty">No lessons for this filter yet.</div>
      )}

      <section className="warmup">
        <div className="warmup-head">
          <div>
            <h2>Warm up</h2>
            <p className="muted">
              {jammed ? 'Keep going — Z X C V / A S D F' : 'Tap a pad. Keyboard works too.'}
            </p>
          </div>
        </div>
        <PadGrid padCount={8} compact />
      </section>
    </div>
  )
}
