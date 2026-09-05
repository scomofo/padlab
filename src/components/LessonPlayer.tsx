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
import { applyRun, type Profile, type RunAward } from '../store/profile'
import { nextInCourse, resumeStep, stepDone } from '../lib/curriculum'
import { dailyCleared, dailyModifier, type DailyModifier } from '../lib/daily'
import { LADDER_RUNGS, bestRung, ladderUnlocked, nextRung, rungCleared, tempoChoices } from '../lib/ladder'
import { LESSONS } from '../lessons'

interface LessonPlayerProps {
  lesson: Lesson
  settings: Settings
  profile: Profile
  isDaily?: boolean
  autoStart?: boolean
  /** Passed from App to avoid localStorage reads every render; falls back to load. */
  progress?: Record<string, import('../engine/types').LessonProgress>
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
  progress,
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
  const [stepIndex, setStepIndex] = useState(() => resumeStep(lesson, (progress ?? loadProgress())[lesson.id]))
  const [mode, setMode] = useState<PlayMode>(autoStart ? 'play' : 'listen')
  const [tempoPct, setTempoPct] = useState(modifier?.tempoPct ?? 100)
  const [metronome, setMetronome] = useState(settings.metronome)
  const [playing, setPlaying] = useState(false)
  const [hud, setHud] = useState({ combo: 0, acc: 0, judged: 0 })
  const [results, setResults] = useState<{ summary: ScoreSummary; newBest: boolean; award: RunAward | null; dailyMet: boolean; stepCleared: boolean; newRung: number | null } | null>(null)
  const runtimeRef = useRef<PlayerRuntime | null>(null)
  const startedAt = useRef(0)
  // re-render trigger so Highway gets the fresh runtime reference
  const [, bump] = useState(0)

  const step = lesson.steps[stepIndex]
  const isLastStep = stepIndex === lesson.steps.length - 1
  const chartedPads = useMemo(() => new Set(lesson.events.map((e) => e.pad)), [lesson])
  const nextLesson = nextInCourse(LESSONS, lesson, progress ?? loadProgress())
  const lessonProgress = (progress ?? loadProgress())[lesson.id]
  const ladderOn = isLastStep && ladderUnlocked(lessonProgress)
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
    startedAt.current = performance.now()
    const rt = new PlayerRuntime({
      lesson,
      stepIndex,
      mode,
      tempoPct,
      metronome,
      latencyMs: settings.latencyMs,
      onAutoPlay: (pad) => autoFlashBus.emit(pad),
      onFinish: (summary) => {
        runtimeRef.current = null
        setPlaying(false)
        if (!summary && mode === 'practice' && !isLastStep) {
          // A finished Practice run means every note was hit: the step is done.
          saveStepDone(lesson.id, stepIndex)
          onProgressChange()
        }
        if (summary) {
          let newBest = false
          const prev = (progress ?? loadProgress())[lesson.id]
          const firstClear = isLastStep && (prev?.stars ?? 0) === 0
          // A practice step is done at one star or better; Perform is tracked by stars.
          const stepCleared = !isLastStep && summary.stars >= 1
          const newRung = rungCleared(prev, { tempoPct, stars: summary.stars, isLastStep })
          if (isLastStep) {
            newBest = summary.accuracy > (prev?.bestAccuracy ?? 0)
            saveLessonResult(lesson.id, summary.accuracy, summary.stars, tempoPct)
            onProgressChange()
          } else if (stepCleared) {
            saveStepDone(lesson.id, stepIndex)
            onProgressChange()
          }
          const dailyMet = modifier ? dailyCleared(modifier, summary, { isLastStep, tempoPct }) : false
          const award = applyRun({
            profile,
            lessonId: lesson.id,
            summary,
            scored: isLastStep,
            firstClear,
            dailyBonusXp: dailyMet && modifier ? modifier.bonusXp : 0,
            tempoPct,
            newRung,
            durationSec: (performance.now() - startedAt.current) / 1000,
            prevXp: profile.xp,
          })
          onProfile(award.profile)
          setResults({ summary, newBest, award, dailyMet, stepCleared, newRung })
        }
        bump((n) => n + 1)
      },
    })
    runtimeRef.current = rt
    rt.start()
    setPlaying(true)
    bump((n) => n + 1)
  }, [lesson, stepIndex, mode, tempoPct, metronome, settings.latencyMs, isLastStep, onProgressChange, profile, modifier, onProfile, progress])

  const skipInitialStop = useRef(true)
  useEffect(() => {
    if (skipInitialStop.current) {
      skipInitialStop.current = false
      return
    }
    stopRun()
  }, [stepIndex, mode, tempoPct, stopRun])
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
  }, [startRun, stopRun])

  return (
    <div className="player">
      <header className="player-bar">
        <button className="btn ghost" onClick={() => { stopRun(); onExit() }}>‹ Studio</button>
        <div className="player-title">
          <h1>{lesson.title}</h1>
          <span className="muted">
            {lesson.genre} · {lesson.bpm} BPM · Level {lesson.level} · {lesson.padCount} pads
            {modifier ? ` · Daily${modifier.id === 'standard' ? '' : `: ${modifier.name}`}` : ''}
          </span>
          {modifier && modifier.id !== 'standard' && (
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
            onChange={(e) => setTempoPct(Number(e.target.value))}
            title="Tempo"
          >
            {tempoChoices(ladderOn ? lessonProgress : undefined, modifier && modifier.tempoPct > 100 ? [modifier.tempoPct, 100, 90, 80, 70, 60, 50] : [100, 90, 80, 70, 60, 50]).map((p) => (
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

      <div className="step-strip">
        {lesson.steps.map((s, i) => {
          const done = stepDone(lesson, (progress ?? loadProgress())[lesson.id], i)
          return (
            <button
              key={i}
              className={`step-pill${i === stepIndex ? ' on' : ''}${done ? ' done' : ''}`}
              onClick={() => setStepIndex(i)}
              title={done ? `${s.name} — done` : s.name}
            >
              <span className="step-n">{done ? '✓' : i + 1}</span> {s.name}
            </button>
          )
        })}
        <span className="step-desc muted">{step.description ?? ''}</span>
      </div>

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
        <Highway lesson={lesson} stepIndex={stepIndex} tempoPct={tempoPct} runtime={runtimeRef.current} fadeBeats={modifier?.fadeBeats ?? 0} />
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
          newBest={results.newBest}
          lessonTitle={lesson.title}
          stepName={step.name}
          scored={isLastStep}
          stepCleared={results.stepCleared}
          stepNumber={stepIndex + 1}
          stepCount={lesson.steps.length}
          tempoPct={tempoPct}
          newRung={results.newRung}
          nextRung={nextRung((progress ?? loadProgress())[lesson.id])}
          award={results.award}
          daily={modifier ? { modifier, cleared: results.dailyMet } : null}
          nextLesson={isLastStep ? nextLesson : null}
          onRetry={() => { setResults(null); startRun() }}
          onNext={
            !isLastStep
              ? () => { setResults(null); setStepIndex(stepIndex + 1) }
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
