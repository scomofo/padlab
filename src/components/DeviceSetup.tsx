import { useEffect, useRef, useState } from 'react'
import { midi } from '../midi/midiManager'
import { setMasterVolume, unlockAudio } from '../audio/audio'
import { playSound } from '../audio/drumSynth'
import { padSoundFor } from '../engine/kits'
import { padBus } from '../input/inputBus'
import { usePadKeyboard } from '../input/usePadKeyboard'
import { PadGrid } from './PadGrid'
import type { Settings } from '../store/progress'

interface DeviceSetupProps {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
}

interface LearnState {
  padCount: 8 | 16
  current: number // pad being learned (1-based)
  map: Record<number, number>
}

export function DeviceSetup({ settings, onChange, onClose }: DeviceSetupProps) {
  const [, bump] = useState(0)
  const [learn, setLearn] = useState<LearnState | null>(null)
  // MIDI events arrive faster than React renders, so the ref — not the state —
  // is the authoritative learn progress; state only drives the display.
  const learnRef = useRef<LearnState | null>(null)

  useEffect(() => midi.onStatusChange(() => bump((n) => n + 1)), [])

  const beginLearn = (padCount: 8 | 16) => {
    const st: LearnState = { padCount, current: 1, map: {} }
    learnRef.current = st
    setLearn(st)
  }

  const cancelLearn = () => {
    learnRef.current = null
    setLearn(null)
  }

  // MIDI Learn: capture raw note-ons, one pad at a time.
  useEffect(() => {
    return midi.onRaw((note) => {
      const st = learnRef.current
      if (!st) return
      if (st.map[note] !== undefined) return // pad chatter / already assigned
      const map = { ...st.map, [note]: st.current }
      if (st.current >= st.padCount) {
        learnRef.current = null
        midi.setCustomMap(map)
        setLearn(null)
      } else {
        const next: LearnState = { padCount: st.padCount, current: st.current + 1, map }
        learnRef.current = next
        setLearn(next)
      }
    })
  }, [])

  usePadKeyboard(16)

  // Test area: audible pads with the default kit.
  useEffect(() => {
    return padBus.subscribe((e) => {
      const sound = padSoundFor(null, 16, e.pad)
      if (sound) playSound(sound, undefined, e.velocity)
    })
  }, [])

  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="setup-card">
        <div className="setup-head">
          <h2>Device &amp; settings</h2>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        <section>
          <h3>MIDI devices</h3>
          {midi.status === 'unsupported' && (
            <p className="muted">This browser has no Web MIDI. Use Chrome or Edge — until then, keyboard keys and clicking pads work everywhere.</p>
          )}
          {midi.status === 'denied' && <p className="muted">MIDI access was blocked. Allow it in the browser’s site permissions, then reload.</p>}
          {midi.status === 'ready' && midi.inputs.length === 0 && (
            <p className="muted">No devices detected. Plug in your MPK Mini or SP-404 MKII (put the SP-404 in MIDI controller use — pads send notes over USB).</p>
          )}
          {midi.inputs.map((i) => (
            <div key={i.id} className="input-row">
              <span className="dot on" />
              <span>{i.name}</span>
              <span className="muted">{midi.customMap ? 'custom mapping' : i.profile.label}</span>
            </div>
          ))}
        </section>

        <section>
          <h3>Pad mapping</h3>
          {learn ? (
            <div className="learn-box">
              <strong>Tap pad {learn.current} of {learn.padCount} on your controller</strong>
              <p className="muted">Pad 1 is bottom-left. Going row by row, left to right, bottom to top.</p>
              <button className="btn" onClick={cancelLearn}>Cancel</button>
            </div>
          ) : (
            <div className="row gap">
              <button className="btn" onClick={() => beginLearn(8)}>
                Learn 8 pads (MPK Mini)
              </button>
              <button className="btn" onClick={() => beginLearn(16)}>
                Learn 16 pads (SP-404)
              </button>
              {midi.customMap && (
                <button className="btn ghost" onClick={() => midi.setCustomMap(null)}>
                  Clear custom mapping
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <h3>Timing calibration</h3>
          <label className="slider-row">
            <span>Input latency compensation: <strong>{settings.latencyMs} ms</strong></span>
            <input
              type="range" min={-50} max={150} step={5}
              value={settings.latencyMs}
              onChange={(e) => onChange({ ...settings, latencyMs: Number(e.target.value) })}
            />
          </label>
          <p className="muted">If your hits feel judged “late” even when you’re on the beat, raise this.</p>
        </section>

        <section>
          <h3>Sound</h3>
          <label className="slider-row">
            <span>Volume</span>
            <input
              type="range" min={0} max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100
                setMasterVolume(v)
                onChange({ ...settings, volume: v })
              }}
            />
          </label>
          <label className="row gap">
            <input
              type="checkbox"
              checked={settings.metronome}
              onChange={(e) => onChange({ ...settings, metronome: e.target.checked })}
            />
            Metronome on by default
          </label>
        </section>

        <section>
          <h3>Test your pads</h3>
          <p className="muted">Hit your controller (or keys Z-V / A-F / Q-R / 1-4) — pads should light and sound.</p>
          <div onPointerDown={() => unlockAudio()}>
            <PadGrid padCount={16} />
          </div>
        </section>
      </div>
    </div>
  )
}
