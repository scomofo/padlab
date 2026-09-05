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

export default function App() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [launch, setLaunch] = useState<{ daily?: boolean; autoStart?: boolean; perform?: boolean; tempoPct?: number }>({})
  const [guide, setGuide] = useState<Guide | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [progress, setProgress] = useState(() => loadProgress())
  const [guideProgress, setGuideProgress] = useState(() => loadGuideProgress())
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [history, setHistory] = useState<PerformanceRun[]>(loadHistory)

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
    setLaunch(opts ?? {})
    setLesson(next)
  }

  return (
    <div className="app">
      {lesson ? (
        <LessonPlayer
          key={lesson.id}
          lesson={lesson}
          settings={settings}
          profile={profile}
          isDaily={launch.daily}
          autoStart={launch.autoStart}
          startAtPerform={launch.perform}
          initialTempoPct={launch.tempoPct}
          progress={progress}
          history={history}
          onHistory={setHistory}
          onExit={() => {
            setLesson(null)
            setLaunch({})
          }}
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
