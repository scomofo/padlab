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
import { loadProgress, saveLessonResult } from '../store/progress'

interface LessonPlayerProps {
  lesson: Lesson
  settings: Settings
  onExit: () => void
  onProgressChange: () => void
}

const MODES: { id: PlayMode; label: string }[] = [
  { id: 'listen', label: 'Listen' },
  { id: 'practice', label: 'Practice' },
  { id: 'play', label: 'Play' },
]

export function LessonPlayer({ lesson, settings, onExit, onProgressChange }: LessonPlayerProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [mode, setMode] = useState<PlayMode>('listen')
  const [tempoPct, setTempoPct] = useState(100)
  const [metronome, setMetronome] = useState(settings.metronome)
  const [playing, setPlaying] = useState(false)
  const [results, setResults] = useState<{ summary: ScoreSummary; newBest: boolean } | null>(null)
  const runtimeRef = useRef<PlayerRuntime | null>(null)
  // re-render trigger so Highway gets the fresh runtime reference
  const [, bump] = useState(0)

  const step = lesson.steps[stepIndex]
  const isLastStep = stepIndex === lesson.steps.length - 1
  const chartedPads = useMemo(() => new Set(lesson.events.map((e) => e.pad)), [lesson])

  const stopRun = useCallback(() => {
    runtimeRef.current?.stop()
    runtimeRef.current = null
    setPlaying(false)
    bump((n) => n + 1)
  }, [])

  const startRun = useCallback(() => {
    unlockAudio()
    runtimeRef.current?.stop()
    setResults(null)
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
        if (summary) {
          let newBest = false
          if (isLastStep) {
            const prev = loadProgress()[lesson.id]
            newBest = summary.accuracy > (prev?.bestAccuracy ?? 0)
            saveLessonResult(lesson.id, summary.accuracy, summary.stars)
            onProgressChange()
          }
          setResults({ summary, newBest })
        }
        bump((n) => n + 1)
      },
    })
    runtimeRef.current = rt
    rt.start()
    setPlaying(true)
    bump((n) => n + 1)
  }, [lesson, stepIndex, mode, tempoPct, metronome, settings.latencyMs, isLastStep, onProgressChange])

  // Any config change stops the current run.
  useEffect(() => stopRun, [stepIndex, mode, tempoPct, stopRun])
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
        <button className="btn ghost" onClick={() => { stopRun(); onExit() }}>‹ Lessons</button>
        <div className="player-title">
          <h1>{lesson.title}</h1>
          <span className="muted">
            {lesson.genre} · {lesson.bpm} BPM · Level {lesson.level} · {lesson.padCount} pads
          </span>
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
            {[100, 90, 80, 70, 60, 50].map((p) => (
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
        {lesson.steps.map((s, i) => (
          <button
            key={i}
            className={i === stepIndex ? 'step-pill on' : 'step-pill'}
            onClick={() => setStepIndex(i)}
          >
            <span className="step-n">{i + 1}</span> {s.name}
          </button>
        ))}
        <span className="step-desc muted">{step.description ?? ''}</span>
      </div>

      <Highway lesson={lesson} stepIndex={stepIndex} tempoPct={tempoPct} runtime={runtimeRef.current} />

      <PadGrid padCount={lesson.padCount} lesson={lesson} activePads={chartedPads} />

      {results && (
        <Results
          summary={results.summary}
          newBest={results.newBest}
          lessonTitle={lesson.title}
          stepName={step.name}
          scored={isLastStep}
          onRetry={() => { setResults(null); startRun() }}
          onNext={!isLastStep ? () => { setResults(null); setStepIndex(stepIndex + 1) } : undefined}
          onExit={() => { setResults(null); onExit() }}
        />
      )}
    </div>
  )
}
