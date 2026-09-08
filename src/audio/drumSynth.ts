// Fully synthesized drum kit — no samples, everything built from oscillators and noise.
import { getAudioContext, getMaster } from './audio'
import type { SoundName } from '../engine/types'

let noiseBuffer: AudioBuffer | null = null

function getNoise(): AudioBuffer {
  const ctx = getAudioContext()
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

function noiseSource(): AudioBufferSourceNode {
  const ctx = getAudioContext()
  const src = ctx.createBufferSource()
  src.buffer = getNoise()
  src.loop = true
  return src
}

function env(node: GainNode, t: number, peak: number, decay: number, attack = 0.001): void {
  const g = node.gain
  g.setValueAtTime(0.0001, t)
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + attack)
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

interface Voice {
  (t: number, g: number, destination: AudioNode): void
}

function osc(type: OscillatorType, freq: number): OscillatorNode {
  const o = getAudioContext().createOscillator()
  o.type = type
  o.frequency.value = freq
  return o
}

function chain(destination: AudioNode, ...nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
  nodes[nodes.length - 1].connect(destination)
}

function tone(destination: AudioNode, t: number, g: number, type: OscillatorType, f0: number, f1: number, pitchDecay: number, decay: number, peak: number): void {
  const ctx = getAudioContext()
  const o = osc(type, f0)
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + pitchDecay)
  const amp = ctx.createGain()
  env(amp, t, peak * g, decay)
  chain(destination, o, amp)
  o.start(t)
  o.stop(t + decay + 0.1)
}

function noiseHit(destination: AudioNode, t: number, g: number, filterType: BiquadFilterType, freq: number, q: number, decay: number, peak: number, attack = 0.001): void {
  const ctx = getAudioContext()
  const n = noiseSource()
  const f = ctx.createBiquadFilter()
  f.type = filterType
  f.frequency.value = freq
  f.Q.value = q
  const amp = ctx.createGain()
  env(amp, t, peak * g, decay, attack)
  chain(destination, n, f, amp)
  n.start(t)
  n.stop(t + attack + decay + 0.1)
}

const voices: Record<SoundName, Voice> = {
  kick(t, g, destination) {
    tone(destination, t, g, 'sine', 160, 44, 0.09, 0.28, 1.0)
    noiseHit(destination, t, g, 'highpass', 1200, 0.7, 0.02, 0.35) // beater click
  },
  snare(t, g, destination) {
    tone(destination, t, g, 'triangle', 210, 150, 0.04, 0.12, 0.5)
    noiseHit(destination, t, g, 'bandpass', 1800, 0.6, 0.17, 0.75)
  },
  clap(t, g, destination) {
    for (let i = 0; i < 3; i++) {
      noiseHit(destination, t + i * 0.011, g, 'bandpass', 1300, 1.6, i === 2 ? 0.16 : 0.025, 0.6)
    }
  },
  rimshot(t, g, destination) {
    tone(destination, t, g, 'square', 1700, 1400, 0.005, 0.035, 0.25)
    noiseHit(destination, t, g, 'bandpass', 3600, 2, 0.03, 0.35)
  },
  hatClosed(t, g, destination) {
    noiseHit(destination, t, g, 'highpass', 7500, 0.8, 0.045, 0.5)
  },
  hatOpen(t, g, destination) {
    noiseHit(destination, t, g, 'highpass', 7000, 0.8, 0.32, 0.45)
  },
  shaker(t, g, destination) {
    noiseHit(destination, t, g, 'bandpass', 5200, 1.4, 0.09, 0.45, 0.02)
  },
  crash(t, g, destination) {
    noiseHit(destination, t, g, 'highpass', 4200, 0.5, 1.1, 0.55)
    noiseHit(destination, t, g, 'bandpass', 9000, 1.2, 0.8, 0.3)
  },
  ride(t, g, destination) {
    tone(destination, t, g, 'square', 5200, 5000, 0.01, 0.5, 0.05)
    noiseHit(destination, t, g, 'highpass', 6500, 1.5, 0.55, 0.25)
  },
  tomLow(t, g, destination) {
    tone(destination, t, g, 'sine', 130, 75, 0.12, 0.3, 0.9)
  },
  tomMid(t, g, destination) {
    tone(destination, t, g, 'sine', 180, 105, 0.1, 0.26, 0.85)
  },
  tomHigh(t, g, destination) {
    tone(destination, t, g, 'sine', 240, 150, 0.09, 0.22, 0.8)
  },
  cowbell(t, g, destination) {
    tone(destination, t, g, 'square', 555, 555, 0.01, 0.14, 0.2)
    tone(destination, t, g, 'square', 835, 835, 0.01, 0.11, 0.2)
  },
  perc(t, g, destination) {
    tone(destination, t, g, 'sine', 900, 500, 0.03, 0.07, 0.5)
    noiseHit(destination, t, g, 'bandpass', 2600, 2.5, 0.05, 0.3)
  },
  stab(t, g, destination) {
    // minor 7th synth stab
    const ctx = getAudioContext()
    for (const f of [220, 261.6, 329.6, 392]) {
      const o = osc('sawtooth', f)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(3200, t)
      lp.frequency.exponentialRampToValueAtTime(400, t + 0.22)
      const amp = ctx.createGain()
      env(amp, t, 0.14 * g, 0.24)
      chain(destination, o, lp, amp)
      o.start(t)
      o.stop(t + 0.35)
    }
  },
  bass(t, g, destination) {
    tone(destination, t, g, 'triangle', 62, 55, 0.05, 0.3, 0.9)
    tone(destination, t, g, 'sine', 55, 55, 0.01, 0.3, 0.6)
  },
}

/** Play at AudioContext time `time` (0/undefined = now), optionally through a private output. */
export function playSound(name: SoundName, time?: number, velocity = 100, destination: AudioNode = getMaster()): void {
  const ctx = getAudioContext()
  const t = Math.max(time ?? ctx.currentTime, ctx.currentTime)
  const g = Math.pow(Math.max(1, Math.min(127, velocity)) / 127, 1.3)
  voices[name](t, g, destination)
}

/** Metronome click, optionally through an independently mutable output. */
export function playClick(time: number, accent: boolean, destination: AudioNode = getMaster()): void {
  const ctx = getAudioContext()
  const t = Math.max(time, ctx.currentTime)
  const o = osc('square', accent ? 1800 : 1250)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = accent ? 1800 : 1250
  bp.Q.value = 4
  const amp = ctx.createGain()
  env(amp, t, accent ? 0.5 : 0.32, 0.05)
  chain(destination, o, bp, amp)
  o.start(t)
  o.stop(t + 0.1)
}
