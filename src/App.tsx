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
import { setMasterVolume, unlockAudio } from './audio/audio'
import {
  loadGuideProgress, loadProgress, loadSettings, saveSettings, type Settings,
} from './store/progress'

export default function App() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [progress, setProgress] = useState(() => loadProgress())
  const [guideProgress, setGuideProgress] = useState(() => loadGuideProgress())

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

  const updateSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }

  return (
    <div className="app">
      {lesson ? (
        <LessonPlayer
          lesson={lesson}
          settings={settings}
          onExit={() => setLesson(null)}
          onProgressChange={() => setProgress(loadProgress())}
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
          onOpen={setLesson}
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
