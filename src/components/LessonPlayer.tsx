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
  const [hud, setHud] = useState({ combo: 0, acc: 0, judged: 0 })
  const [results, setResults] = useState<{
    summary: ScoreSummary | null; practiceNotes?: number; newBest: boolean; award: RunAward | null; dailyMet: boolean
    stepCleared: boolean; newRung: number | null; phrase: FocusPhrase | null
    performances: PerformanceRun[]
  } | null>(null)
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
  const chartedPads = useMemo(() => new Set(lesson.events.map((e) => e.pad)), [lesson])
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
    unlockAudio()
    // Space-to-start focus trap: Start button keeps focus, so Space would
    // hit the button instead of toggling. Blur so the window handler owns Space.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    runtimeRef.current?.stop()
    setResults(null)
    setHud({ combo: 0, acc: 0, judged: 0 })
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
          setResults({ summary, newBest, award, dailyMet, stepCleared, newRung, phrase, performances })
        }
        bump((n) => n + 1)
      },
    })
    runtimeRef.current = rt
    rt.start()
    setPlaying(true)
    bump((n) => n + 1)
  }, [lesson, stepIndex, activeLesson, activeStepIndex, focus, mode, tempoPct, metronome, settings.latencyMs, isLastStep, onProgressChange, profile, modifier, onProfile, progress, scored, history, onHistory, onSessionResult])

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
  useEffect(() => {
    if (!pendingStart) return
    setPendingStart(false)
    startRun()
  }, [pendingStart, startRun])
  useEffect(() => {
    if (!autoStart) return
    startRun()
    // Mount-only: Continue / Daily / next-lesson should roll immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => runtimeRef.current?.stop(), [])

  // Pad input: always audible, and routed into the active run.
  useEffect(() => {
    return padBus.subscribe((e) => {
      const sound = padSoundFor(lesson, lesson.padCount, e.pad)
      if (!sound) return
      playSound(sound, undefined, e.velocity)
      runtimeRef.current?.handlePad(e.pad)
    })
  }, [lesson])

  usePadKeyboard(lesson.padCount)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let lastHud = { combo: -1, acc: -1, judged: -1 }
    let lastPush = 0
    const tick = () => {
      const rt = runtimeRef.current
      if (rt?.score) {
        const s = rt.score.summary()
        const next = { combo: rt.score.combo, acc: s.accuracy, judged: s.perfect + s.great + s.good + s.miss }
        const now = performance.now()
        // HUD at most ~10Hz and only on change — summary() is O(n).
        if ((next.combo !== lastHud.combo || next.acc !== lastHud.acc || next.judged !== lastHud.judged) && now - lastPush > 100) {
          lastHud = next
          lastPush = now
          setHud(next)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

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
          <div className="segmented">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={mode === m.id ? 'seg on' : 'seg'}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            className="tempo-select"
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
            title="Metronome"
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

      <div className="player-stage">
        <Highway lesson={activeLesson} stepIndex={activeStepIndex} tempoPct={tempoPct} runtime={runtimeRef.current} fadeBeats={focus ? 0 : modifier?.fadeBeats ?? 0} />
        {playing && mode === 'play' && hud.judged > 0 && (
          <div className="play-hud">
            <span>{hud.acc}%</span>
            {hud.combo >= 2 && <span className="combo">{hud.combo}x</span>}
          </div>
        )}
        {!playing && !results && (
          <button className="play-curtain" onClick={startRun}>
            <span className="play-orb">▶</span>
            <strong>Play</strong>
            <span className="muted">Hit the pads as notes reach the line · space to start</span>
          </button>
        )}
      </div>

      <PadGrid padCount={lesson.padCount} lesson={lesson} activePads={chartedPads} />

      {results && (
        <Results
          summary={results.summary}
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
