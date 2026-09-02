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

export default function App() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [daily, setDaily] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [progress, setProgress] = useState(() => loadProgress())
  const [guideProgress, setGuideProgress] = useState(() => loadGuideProgress())
  const [profile, setProfile] = useState<Profile>(() => loadProfile())

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
  useEffect(() => {
    if (lesson || guide) return
    return padBus.subscribe((e) => {
      const sound = padSoundFor(null, 8, e.pad)
      if (sound) playSound(sound, undefined, e.velocity)
    })
  }, [lesson, guide])

  const updateSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }

  const openLesson = (next: Lesson, opts?: { daily?: boolean; autoStart?: boolean }) => {
    setDaily(Boolean(opts?.daily))
    setAutoStart(Boolean(opts?.autoStart))
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
          isDaily={daily}
          autoStart={autoStart}
          onExit={() => {
            setLesson(null)
            setDaily(false)
            setAutoStart(false)
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
          onOpen={openLesson}
          onOpenGuide={setGuide}
          onOpenSetup={() => setShowSetup(true)}
        />
      )}
      {showSetup && (
        <DeviceSetup settings={settings} onChange={updateSettings} onClose={() => setShowSetup(false)} />
      )}
    </div>
  )
}
