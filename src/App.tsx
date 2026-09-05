import { useEffect, useState } from 'react'
import type { Lesson } from './engine/types'
import type { Guide } from './guides/types'
import { LESSONS } from './lessons'
import { GUIDES } from './guides'
import { LessonBrowser } from './components/LessonBrowser'
import { LessonPlayer } from './components/LessonPlayer'
import { GuideViewer } from './components/GuideViewer'
import { DeviceSetup } from './components/DeviceSetup'
import { midi } from './midi/midiManager'
import { padBus } from './input/inputBus'
import { playSound } from './audio/drumSynth'
import { padSoundFor } from './engine/kits'
import { setMasterVolume, unlockAudio } from './audio/audio'
import {
  loadGuideProgress, loadProgress, loadSettings, saveSettings, type Settings,
} from './store/progress'
import { loadProfile, type Profile } from './store/profile'
import { loadHistory, type PerformanceRun } from './store/history'
import { buildSession, completeSessionRound, type PracticeSession, type SessionResult } from './lib/session'
import { loadSession, saveSession } from './store/session'

export default function App() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [launch, setLaunch] = useState<{ daily?: boolean; autoStart?: boolean; perform?: boolean; tempoPct?: number; stepIndex?: number }>({})
  const [guide, setGuide] = useState<Guide | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [progress, setProgress] = useState(() => loadProgress())
  const [guideProgress, setGuideProgress] = useState(() => loadGuideProgress())
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [history, setHistory] = useState<PerformanceRun[]>(loadHistory)
  const [session, setSession] = useState<PracticeSession | null>(() => loadSession(LESSONS))
  const [sessionRound, setSessionRound] = useState<number | null>(null)

  useEffect(() => { if (session) saveSession(session) }, [session])

  useEffect(() => {
    void midi.init()
    setMasterVolume(settings.volume)
    // Hardware pads join the same bus as keyboard and pointer input.
    const offPad = midi.onPad((pad, velocity) => {
      unlockAudio()
      padBus.emit({ pad, velocity, source: 'midi' })
    })
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      offPad()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    // Deliberately mount-only: settings.volume is read once here; later changes
    // are applied live by DeviceSetup, and re-running would re-bind MIDI.
  }, [])

  // Home warmup pads share the kit so tapping them is immediately audible.
  // Paused while DeviceSetup is open — it owns its own 16-pad test audio,
  // otherwise one keydown would sound twice.
  useEffect(() => {
    if (lesson || guide || showSetup) return
    return padBus.subscribe((e) => {
      const sound = padSoundFor(null, 8, e.pad)
      if (sound) playSound(sound, undefined, e.velocity)
    })
  }, [lesson, guide, showSetup])

  const updateSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }

  const openLesson = (next: Lesson, opts?: typeof launch) => {
    setSessionRound(null)
    setLaunch(opts ?? {})
    setLesson(next)
  }

  const exitLesson = () => {
    setLesson(null)
    setLaunch({})
    setSessionRound(null)
  }

  const openSessionRound = (plan: PracticeSession, index: number) => {
    const next = LESSONS.find((l) => l.id === plan.lessonId)
    const round = plan.rounds[index]
    if (!next || !round) return
    void unlockAudio()
    setSessionRound(index)
    setLaunch({ autoStart: true, stepIndex: round.stepIndex, tempoPct: round.tempoPct })
    setLesson(next)
  }

  const startSession = () => {
    const next = session && session.results.length < session.rounds.length
      ? session : buildSession(LESSONS, progress, profile.lastLessonId)
    if (!next) return
    setSession(next)
    openSessionRound(next, next.results.length)
  }

  const finishSessionRound = (index: number, result: SessionResult) => {
    setSession((current) => current ? completeSessionRound(current, index, result) : current)
  }

  const nextSessionRound = () => {
    if (!session || sessionRound === null || session.results.length <= sessionRound) return
    if (session.results.length === session.rounds.length) exitLesson()
    else openSessionRound(session, session.results.length)
  }

  return (
    <div className="app">
      {lesson ? (
        <LessonPlayer
          key={`${lesson.id}:${sessionRound ?? 'free'}`}
          lesson={lesson}
          settings={settings}
          profile={profile}
          isDaily={launch.daily}
          autoStart={launch.autoStart}
          startAtPerform={launch.perform}
          initialTempoPct={launch.tempoPct}
          initialStepIndex={launch.stepIndex}
          sessionRound={session && sessionRound !== null ? {
            number: sessionRound + 1, total: session.rounds.length,
            completed: session.results.length > sessionRound,
            label: session.rounds[sessionRound].label,
          } : undefined}
          onSessionResult={sessionRound !== null ? (result) => finishSessionRound(sessionRound, result) : undefined}
          onSessionNext={nextSessionRound}
          progress={progress}
          history={history}
          onHistory={setHistory}
          onExit={exitLesson}
          onProgressChange={() => setProgress(loadProgress())}
          onProfile={setProfile}
          onOpenLesson={(l) => openLesson(l, { autoStart: true })}
        />
      ) : guide ? (
        <GuideViewer
          guide={guide}
          startStep={guideProgress[guide.id]?.completed ? 0 : guideProgress[guide.id]?.lastStep ?? 0}
          onExit={() => setGuide(null)}
          onProgressChange={() => setGuideProgress(loadGuideProgress())}
        />
      ) : (
        <LessonBrowser
          lessons={LESSONS}
          guides={GUIDES}
          progress={progress}
          guideProgress={guideProgress}
          profile={profile}
          history={history}
          session={session}
          onStartSession={startSession}
          onOpen={openLesson}
          onOpenGuide={setGuide}
          onOpenSetup={() => setShowSetup(true)}
          keyboardEnabled={!showSetup}
        />
      )}
      {showSetup && (
        <DeviceSetup settings={settings} onChange={updateSettings} onClose={() => setShowSetup(false)} />
      )}
    </div>
  )
}
