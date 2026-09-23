import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lesson } from '../engine/types'
import type { ScoreSummary } from '../engine/scoring'
import { PlayerRuntime, type PlayMode } from '../engine/player'
import { playSound } from '../audio/drumSynth'
import { unlockAudio } from '../audio/audio'
import { padSoundFor } from '../engine/kits'
import { padBus } from '../input/inputBus'
import { usePadKeyboard } from '../input/usePadKeyboard'
import { autoFlashBus } from '../input/flashBus'
import { RunStatus } from './RunStatus'
import { Highway } from './Highway'
import { PadGrid } from './PadGrid'
import { Results } from './Results'
import type { Settings } from '../store/progress'
import { loadProgress, saveLessonResult, saveStepDone } from '../store/progress'
import { applyRun, saveProfile, type Profile, type RunAward } from '../store/profile'
import { nextInCourse, performScored, resumeStep, stepDone } from '../lib/curriculum'
import { dailyCleared, dailyModifier, type DailyModifier } from '../lib/daily'
import { LADDER_RUNGS, bestRung, ladderUnlocked, nextRung, rungCleared, tempoChoices } from '../lib/ladder'
import { LESSONS } from '../lessons'
import { createFocusLesson, findFocusPhrase, focusTempo, FOCUS_REPEATS, phraseLabel, type FocusPhrase } from '../lib/focus'
import { comparableRuns, savePerformance, type PerformanceRun } from '../store/history'
import type { SessionResult } from '../lib/session'
import { createGroovePlan, readGroove, type GrooveSnapshot } from '../lib/groove'
import { personalBestTarget, type GrooveTarget } from '../lib/grooveTarget'

interface LessonPlayerProps {
  lesson: Lesson
  settings: Settings
  profile: Profile
  isDaily?: boolean
  autoStart?: boolean
  startAtPerform?: boolean
  initialTempoPct?: number
  initialStepIndex?: number
  sessionRound?: { number: number; total: number; completed: boolean; label: string }
  onSessionResult?: (result: SessionResult) => void
  onSessionNext?: () => void
  /** Passed from App to avoid localStorage reads every render; falls back to load. */
  progress?: Record<string, import('../engine/types').LessonProgress>
  history: PerformanceRun[]
  onHistory: (history: PerformanceRun[]) => void
  onExit: () => void
  onProgressChange: () => void
  onProfile: (p: Profile) => void
  onOpenLesson: (lesson: Lesson) => void
}

const MODES: { id: PlayMode; label: string }[] = [
  { id: 'listen', label: 'Listen' },
  { id: 'practice', label: 'Practice' },
  { id: 'play', label: 'Play' },
]

export function LessonPlayer({
  lesson,
  settings,
  profile,
  isDaily,
  autoStart = false,
  startAtPerform = false,
  initialTempoPct = 100,
  initialStepIndex,
  sessionRound,
  onSessionResult,
  onSessionNext,
  progress,
  history,
  onHistory,
  onExit,
  onProgressChange,
  onProfile,
  onOpenLesson,
}: LessonPlayerProps) {
  // Fixed for the visit: progress changes mid-session must not swap the twist.
  const [modifier] = useState<DailyModifier | null>(
    () => (isDaily ? dailyModifier(progress ?? loadProgress()) : null),
  )
  // Open on the first step not yet done, so a card's checkmarks pick up where they left off.
  const [stepIndex, setStepIndex] = useState(() => initialStepIndex ?? (startAtPerform ? lesson.steps.length - 1 : resumeStep(lesson, (progress ?? loadProgress())[lesson.id])))
  const [mode, setMode] = useState<PlayMode>(autoStart ? 'play' : 'listen')
  const [tempoPct, setTempoPct] = useState(modifier?.tempoPct ?? initialTempoPct)
  const [focus, setFocus] = useState<{ phrase: FocusPhrase; lesson: Lesson; returnTempo: number } | null>(null)
  const [pendingStart, setPendingStart] = useState(false)
  const [metronome, setMetronome] = useState(settings.metronome)
  const [playing, setPlaying] = useState(false)
  const [results, setResults] = useState<{
    summary: ScoreSummary | null; practiceNotes?: number; newBest: boolean; award: RunAward | null; dailyMet: boolean
    stepCleared: boolean; newRung: number | null; phrase: FocusPhrase | null
    performances: PerformanceRun[]
    groove?: GrooveSnapshot; grooveTarget?: GrooveTarget | null
  } | null>(null)
  const [runTarget, setRunTarget] = useState<GrooveTarget | null>(null)
  const runtimeRef = useRef<PlayerRuntime | null>(null)
  const startedAt = useRef(0)
  // re-render trigger so Highway gets the fresh runtime reference
  const [, bump] = useState(0)

  const activeLesson = focus?.lesson ?? lesson
  const activeStepIndex = focus ? 0 : stepIndex
  const step = activeLesson.steps[activeStepIndex]
  const isLastStep = stepIndex === lesson.steps.length - 1
  // A slowed-down Perform is practice: it shows results but saves nothing.
  const scored = mode === 'play' && !focus && performScored(isLastStep, tempoPct)
  const chartedPads = useMemo(() => step.playerPads === 'all' ? new Set(activeLesson.events.map((e) => e.pad)) : new Set(step.playerPads), [activeLesson, step])
  const groovePlan = useMemo(() => createGroovePlan(activeLesson.events.filter((event) => chartedPads.has(event.pad)), activeLesson.bars), [activeLesson, chartedPads])
  const target = useMemo(() => scored ? personalBestTarget(history, {
    lessonId: lesson.id, tempoPct, variant: modifier?.id ?? 'standard', total: groovePlan.total,
  }) : null, [scored, history, lesson.id, tempoPct, modifier, groovePlan.total])
  const nextLesson = nextInCourse(LESSONS, lesson, progress ?? loadProgress())
  const lessonProgress = (progress ?? loadProgress())[lesson.id]
  const ladderOn = !focus && !sessionRound && isLastStep && ladderUnlocked(lessonProgress)
  const rungNext = nextRung(lessonProgress)

  const stopRun = useCallback(() => {
    runtimeRef.current?.stop()
    runtimeRef.current = null
    setPlaying(false)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    bump((n) => n + 1)
  }, [])

  const startRun = useCallback(() => {
    // Consume a pending auto-start request (no-op when starting directly).
    setPendingStart(false)
    unlockAudio()
    // Space-to-start focus trap: Start button keeps focus, so Space would
    // hit the button instead of toggling. Blur so the window handler owns Space.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    runtimeRef.current?.stop()
    setResults(null)
    setRunTarget(target)
    startedAt.current = performance.now()
    const rt = new PlayerRuntime({
      lesson: activeLesson,
      stepIndex: activeStepIndex,
      mode,
      tempoPct,
      metronome,
      latencyMs: settings.latencyMs,
      onAutoPlay: (pad) => autoFlashBus.emit(pad),
      onFinish: (summary) => {
        runtimeRef.current = null
        setPlaying(false)
        if (!summary && mode === 'practice') {
          const practiceNotes = rt.playerEvents.length
          const stepCleared = !isLastStep && !focus && practiceNotes > 0
          if (stepCleared) {
            // Wait mode only finishes after every note has been answered.
            saveStepDone(lesson.id, stepIndex)
            onProgressChange()
          }
          if (practiceNotes > 0) {
            // Remember the learning path even when timing was not scored.
            const nextProfile = { ...profile, lastLessonId: lesson.id }
            saveProfile(nextProfile)
            onProfile(nextProfile)
          }
          if (!focus && practiceNotes > 0) onSessionResult?.({ accuracy: null, notesHit: practiceNotes, mode: 'practice' })
          setResults({ summary: null, practiceNotes, newBest: false, award: null, dailyMet: false,
            stepCleared, newRung: null, phrase: null, performances: [] })
        }
        if (summary) {
          let newBest = false
          const prev = (progress ?? loadProgress())[lesson.id]
          const firstClear = scored && summary.stars >= 1 && (prev?.stars ?? 0) === 0
          // A practice step is done at one star or better; Perform is tracked by stars.
          const stepCleared = !focus && !isLastStep && summary.stars >= 1
          const newRung = rungCleared(prev, { tempoPct, stars: summary.stars, isLastStep: scored })
          let performances: PerformanceRun[] = []
          if (scored) {
            newBest = summary.accuracy > (prev?.bestAccuracy ?? 0)
            saveLessonResult(lesson.id, summary.accuracy, summary.stars, tempoPct)
            onProgressChange()
            const run: PerformanceRun = {
              lessonId: lesson.id, completedAt: new Date().toISOString(), tempoPct,
              variant: modifier?.id ?? 'standard', accuracy: summary.accuracy,
              maxCombo: summary.maxCombo, misses: summary.miss, total: summary.total,
            }
            const nextHistory = savePerformance(run, history)
            performances = comparableRuns(nextHistory, run)
            onHistory(nextHistory)
          } else if (stepCleared) {
            saveStepDone(lesson.id, stepIndex)
            onProgressChange()
          }
          const dailyMet = modifier ? dailyCleared(modifier, summary, { isLastStep: scored, tempoPct }) : false
          const award = applyRun({
            profile,
            lessonId: lesson.id,
            summary,
            scored,
            firstClear,
            dailyBonusXp: dailyMet && modifier ? modifier.bonusXp : 0,
            tempoPct,
            newRung,
            durationSec: (performance.now() - startedAt.current) / 1000,
            prevXp: profile.xp,
          })
          onProfile(award.profile)
          const notesHit = summary.perfect + summary.great + summary.good
          if (!focus && notesHit > 0) onSessionResult?.({ accuracy: summary.accuracy, notesHit, mode: 'play' })
          const phrase = focus ? null : findFocusPhrase(lesson, rt.score?.events ?? [])
          setResults({ summary, newBest, award, dailyMet, stepCleared, newRung, phrase, performances,
            groove: readGroove(groovePlan, rt.score?.events ?? [], activeLesson.bars * 4), grooveTarget: target })
        }
        bump((n) => n + 1)
      },
    })
    runtimeRef.current = rt
    rt.start()
    setPlaying(true)
    bump((n) => n + 1)
  }, [lesson, stepIndex, activeLesson, activeStepIndex, focus, mode, tempoPct, metronome, settings.latencyMs, isLastStep, onProgressChange, profile, modifier, onProfile, progress, scored, history, onHistory, onSessionResult, groovePlan, target])

  const startFocus = (phrase: FocusPhrase) => {
    stopRun()
    setResults(null)
    setFocus({ phrase, lesson: createFocusLesson(lesson, stepIndex, phrase), returnTempo: tempoPct })
    setTempoPct(focusTempo(tempoPct))
    setMode('play')
    setPendingStart(true)
  }

  const returnFromFocus = () => {
    if (!focus) return
    stopRun()
    setResults(null)
    setTempoPct(focus.returnTempo)
    setFocus(null)
    setMode('play')
    setPendingStart(true)
  }

  const skipInitialStop = useRef(true)
  useEffect(() => {
    if (skipInitialStop.current) {
      skipInitialStop.current = false
      return
    }
    stopRun()
  }, [stepIndex, mode, tempoPct, focus, stopRun])
  // Configuration must commit before constructing a new runtime. This also
  // handles a drill launched while already at the minimum practice tempo.
  // The pendingStart flag is consumed inside startRun. Calling startRun here
  // intentionally sets run state after the config commit — that is this
  // effect's job.
  useEffect(() => {
    if (!pendingStart) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startRun()
  }, [pendingStart, startRun])
  useEffect(() => {
    if (!autoStart) return
    // Mount-only: Continue / Daily / next-lesson should roll immediately.
    // startRun intentionally sets state on mount (fresh run, results cleared).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => runtimeRef.current?.stop(), [])

  // Pad input: always audible, and routed into the active run.
  useEffect(() => {
    return padBus.subscribe((e) => {
      const sound = padSoundFor(lesson, lesson.padCount, e.pad)
      if (!sound) return
      runtimeRef.current?.handlePad(e.pad, e.timeStamp)
      playSound(sound, undefined, e.velocity)
    })
  }, [lesson])

  usePadKeyboard(lesson.padCount)

  // Space toggles the run.
  useEffect(() => {
    if (results) return
    const down = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.key !== ' ') return
      const target = ev.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
      ev.preventDefault()
      if (runtimeRef.current) stopRun()
      else startRun()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [startRun, stopRun, results])

  return (
    <div className="player">
      <header className="player-bar">
        <button className="btn ghost" onClick={() => { stopRun(); onExit() }}>{sessionRound ? '‹ Pause session' : '‹ Studio'}</button>
        <div className="player-title">
          <h1>{lesson.title}</h1>
          <span className="muted">
            {lesson.genre} · {lesson.bpm} BPM · Level {lesson.level} · {lesson.padCount} pads
            {!focus && modifier ? ` · Daily${modifier.id === 'standard' ? '' : `: ${modifier.name}`}` : ''}
          </span>
          {!focus && modifier && modifier.id !== 'standard' && (
            <span className="daily-rule">{modifier.rule}</span>
          )}
        </div>
        <div className="player-controls">
          <div className="segmented" role="group" aria-label="Playback mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={mode === m.id ? 'seg on' : 'seg'}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            className="tempo-select" aria-label="Tempo"
            value={tempoPct}
            disabled={Boolean(sessionRound) && !focus}
            onChange={(e) => setTempoPct(Number(e.target.value))}
            title={sessionRound && !focus ? 'Tempo is set for this round. Practice mode waits for each note.' : 'Tempo'}
          >
            {(sessionRound && !focus ? [tempoPct] : tempoChoices(ladderOn ? lessonProgress : undefined, !focus && modifier && modifier.tempoPct > 100 ? [modifier.tempoPct, 100, 90, 80, 70, 60, 50] : [100, 90, 80, 70, 60, 50])).map((p) => (
              <option key={p} value={p}>{p}%</option>
            ))}
          </select>
          <button
            className={metronome ? 'btn small on' : 'btn small'}
            onClick={() => {
              const next = !metronome
              setMetronome(next)
              runtimeRef.current?.setMetronome(next)
            }}
            title="Metronome" aria-pressed={metronome}
          >
            Click
          </button>
          <button className={playing ? 'btn primary stop' : 'btn primary'} onClick={playing ? stopRun : startRun}>
            {playing ? '■ Stop' : '▶ Start'}
          </button>
        </div>
      </header>

      {sessionRound && (
        <div className="session-banner">
          <strong>Quick session · Round {sessionRound.number} of {sessionRound.total}</strong>
          <span>{sessionRound.label} · {sessionRound.completed ? 'Round saved' : 'Pause anytime; finished rounds are saved'}</span>
        </div>
      )}

      {focus ? (
        <div className="focus-banner" role="status">
          <div><strong>Focus practice · {phraseLabel(focus.phrase)}</strong>
            <span>{FOCUS_REPEATS} repeats · {Math.round(lesson.bpm * (step.tempoScale ?? 1) * tempoPct / 100)} BPM · Stars and daily clears come from the full groove.</span>
          </div>
          <button className="btn" onClick={returnFromFocus}>Back to {lesson.steps[stepIndex].name} ›</button>
        </div>
      ) : <div className="step-strip">
        {lesson.steps.map((s, i) => {
          const done = stepDone(lesson, (progress ?? loadProgress())[lesson.id], i)
          return (
            <button
              key={i}
              className={`step-pill${i === stepIndex ? ' on' : ''}${done ? ' done' : ''}`}
              onClick={() => setStepIndex(i)}
              title={done ? `${s.name} — done` : s.name}
              disabled={Boolean(sessionRound)}
            >
              <span className="step-n">{done ? '✓' : i + 1}</span> {s.name}
            </button>
          )
        })}
        <span className="step-desc muted">{step.description ?? ''}</span>
      </div>}

      {ladderOn && (
        <div className="ladder" aria-label="Tempo ladder">
          <span className="ladder-title">⚡ Tempo ladder</span>
          {LADDER_RUNGS.map((r) => {
            const done = r <= bestRung(lessonProgress)
            return (
              <button
                key={r}
                className={`rung${done ? ' done' : ''}${tempoPct === r ? ' on' : ''}${r === rungNext ? ' next' : ''}`}
                onClick={() => setTempoPct(r)}
                title={done ? `${r}% mastered` : `Play Perform at ${r}% for 3 stars`}
              >
                {done ? '✓ ' : ''}{r}%
              </button>
            )
          })}
          <span className="muted ladder-hint">
            {rungNext ? `Next rung: 3 stars at ${rungNext}%` : 'Topped out — full speed mastered'}
          </span>
        </div>
      )}

      {/* runtimeRef is read during render below. This is safe because every
          mutation of the ref is paired with a state update (setPlaying/bump)
          that re-renders immediately — the prop never goes stale. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      <RunStatus runtime={runtimeRef.current} lesson={activeLesson} stepIndex={activeStepIndex} tempoPct={tempoPct} mode={mode}
        groovePlan={mode === 'play' && !results ? groovePlan : undefined} grooveTarget={playing ? runTarget : target} />
      <div className="player-stage">
        {/* eslint-disable-next-line react-hooks/refs */}
        <Highway lesson={activeLesson} stepIndex={activeStepIndex} tempoPct={tempoPct} runtime={runtimeRef.current} fadeBeats={focus ? 0 : modifier?.fadeBeats ?? 0} />
        {!playing && !results && (
          <button className="play-curtain" onClick={startRun}>
            <span className="play-orb">▶</span>
            <span className="curtain-eyebrow">{step.name}</span>
            <strong>{mode === 'listen' ? 'Listen first' : mode === 'practice' ? 'Practice at your pace' : 'Find your groove'}</strong>
            <span className="muted">{mode === 'listen' ? 'Hear the pattern and watch the pads light up.' : mode === 'practice' ? 'The groove waits until you hit each note.' : 'Hit the bright notes at the line. Dim lanes play for you.'} · Space to start</span>
          </button>
        )}
      </div>

      <PadGrid padCount={lesson.padCount} lesson={lesson} activePads={chartedPads} />

      {results && (
        <Results
          summary={results.summary}
          groove={results.groove}
          grooveTarget={results.grooveTarget}
          practiceNotes={results.practiceNotes}
          newBest={results.newBest}
          lessonTitle={lesson.title}
          stepName={step.name}
          scored={scored}
          slowed={!focus && isLastStep && !scored}
          focusPractice={Boolean(focus)}
          focusPhrase={results.phrase}
          onFocus={startFocus}
          onReturnFromFocus={returnFromFocus}
          returnStepName={lesson.steps[stepIndex].name}
          performances={results.performances}
          sessionRound={!focus ? sessionRound : undefined}
          nextLabel={sessionRound ? (sessionRound.number === sessionRound.total ? 'Finish session ›' : 'Next round ›') : undefined}
          stepCleared={results.stepCleared}
          stepNumber={stepIndex + 1}
          stepCount={lesson.steps.length}
          tempoPct={tempoPct}
          newRung={results.newRung}
          nextRung={nextRung((progress ?? loadProgress())[lesson.id])}
          award={results.award}
          daily={!focus && modifier ? { modifier, cleared: results.dailyMet } : null}
          nextLesson={!focus && !sessionRound && isLastStep ? nextLesson : null}
          onRetry={() => { setResults(null); startRun() }}
          onNext={
            focus ? undefined : sessionRound ? (sessionRound.completed ? onSessionNext : undefined) : !isLastStep
              ? () => { setResults(null); setStepIndex(stepIndex + 1); setPendingStart(true) }
              : nextLesson
                ? () => { setResults(null); onOpenLesson(nextLesson) }
                : undefined
          }
          onExit={() => { setResults(null); onExit() }}
        />
      )}
    </div>
  )
}
