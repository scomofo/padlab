import { getAudioContext, getMaster } from '../audio/audio'
import { playClick, playSound } from '../audio/drumSynth'
import { captureInputTiming, eventAudioTime, INPUT_DELIVERY_GRACE_MS } from '../input/timing'
import { JAM_BEATS, MAX_JAM_NOTES, normalizeJamNotes, type JamNote } from '../lib/jam'
import { DEFAULT_KIT_16 } from './kits'
import { RETRIGGER_DEBOUNCE_MS } from './scoring'
import { Transport } from './transport'

export type JamPhase = 'idle' | 'count-in' | 'armed' | 'recording' | 'finishing' | 'playing'

export interface JamStatus {
  phase: JamPhase
  /** Absolute transport position; the count-in occupies negative beats. */
  beat: number
  recordStart: number | null
  /** One-based playback pass, or zero before the first downbeat. */
  pass: number
  pendingNotes: number
}

export interface JamRuntimeOptions {
  notes: JamNote[]
  bpm: number
  latencyMs: number
  snap: boolean
  mutedPads: number[]
  metronome: boolean
  onCommit: (notes: JamNote[]) => void
  onAutoPlay?: (pad: number) => void
}

const LOOKAHEAD_SEC = 0.12
const TICK_MS = 25
const COUNT_IN_BEATS = 4

/**
 * Four-bar overdub recorder. The audio clock owns playback and recording;
 * rendering only reads status. A take plays on the following pass, while its
 * final save waits briefly for timestamped MIDI events delivered after the seam.
 */
export class JamRuntime {
  readonly transport = new Transport()
  private committed: JamNote[]
  private pending: JamNote[] = []
  private recordStart: number | null = null
  private timer: number | null = null
  private schedBeat = 0
  private startedWallMs = 0
  private armedWallMs = 0
  private disposed = false
  private muted = new Set<number>()
  private metronome: boolean
  private readonly latencyMs: number
  private readonly snap: boolean
  private readonly onCommit: JamRuntimeOptions['onCommit']
  private readonly onAutoPlay: JamRuntimeOptions['onAutoPlay']
  private readonly hitTimes = new Map<number, number[]>()
  /** Absolute beat/pad keys for audio already queued in the lookahead. */
  private readonly scheduledNotes = new Map<string, number>()
  private readonly flashTimers = new Set<number>()
  private output: GainNode | null = null
  private clickOutput: GainNode | null = null
  private countInOutput: GainNode | null = null
  private padOutputs: GainNode[] = []
  private audioContext: AudioContext | null = null

  constructor(opts: JamRuntimeOptions) {
    this.committed = normalizeJamNotes(opts.notes)
    this.transport.setTempo(Number.isFinite(opts.bpm) ? Math.max(60, Math.min(180, Math.round(opts.bpm))) : 96)
    this.latencyMs = Number.isFinite(opts.latencyMs) ? opts.latencyMs : 0
    this.snap = opts.snap
    this.metronome = opts.metronome
    this.onCommit = opts.onCommit
    this.onAutoPlay = opts.onAutoPlay
    this.setMuted(opts.mutedPads)
  }

  /** The saved loop, without an unfinished take; callers receive their own copy. */
  get notes(): JamNote[] {
    return this.committed.map((note) => ({ ...note }))
  }

  start(mode: 'play' | 'record'): void {
    if (this.disposed || this.transport.state !== 'stopped') return
    const ctx = getAudioContext()
    // Audio must be resumed by the caller's user gesture before starting a run.
    if (ctx.state !== 'running') return
    this.startedWallMs = performance.now()
    this.armedWallMs = this.startedWallMs
    this.pending = []
    this.hitTimes.clear()
    this.scheduledNotes.clear()
    this.recordStart = mode === 'record' ? 0 : null
    this.schedBeat = mode === 'record' ? -COUNT_IN_BEATS : 0
    this.openOutputs(ctx)
    this.audioContext = ctx
    ctx.addEventListener('statechange', this.onAudioStateChange)
    this.transport.start(this.schedBeat)
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  /** Arm exactly one full pass at the next loop boundary. */
  record(): void {
    if (this.disposed) return
    if (this.transport.state === 'stopped') {
      this.start('record')
      return
    }
    if (this.recordStart !== null) return
    this.recordStart = Math.max(0, (Math.floor(this.transport.now() / JAM_BEATS) + 1) * JAM_BEATS)
    this.armedWallMs = performance.now()
    this.pending = []
    this.hitTimes.clear()
  }

  /** Stop also silences lookahead audio and discards any unfinished take. */
  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    for (const timer of this.flashTimers) window.clearTimeout(timer)
    this.flashTimers.clear()
    this.audioContext?.removeEventListener('statechange', this.onAudioStateChange)
    this.audioContext = null
    this.closeOutputs()
    this.transport.stop()
    this.recordStart = null
    this.pending = []
    this.hitTimes.clear()
    this.scheduledNotes.clear()
  }

  dispose(): void {
    this.stop()
    this.disposed = true
  }

  /** Mutes only loop playback; the UI's live pad monitor uses its own output. */
  setMuted(pads: number[]): void {
    this.muted = new Set(pads.filter((pad) => Number.isInteger(pad) && pad >= 1 && pad <= 16))
    this.padOutputs.forEach((output, index) => {
      output.gain.setValueAtTime(this.muted.has(index + 1) ? 0 : 1, getAudioContext().currentTime)
    })
  }

  setMetronome(on: boolean): void {
    this.metronome = on
    this.clickOutput?.gain.setValueAtTime(on ? 1 : 0, getAudioContext().currentTime)
  }

  readStatus(): JamStatus {
    const beat = this.transport.now()
    let phase: JamPhase = this.transport.state === 'stopped' ? 'idle' : 'playing'
    if (phase !== 'idle' && this.recordStart !== null) {
      if (beat < 0) phase = 'count-in'
      else if (beat < this.recordStart) phase = 'armed'
      else if (beat < this.recordStart + JAM_BEATS) phase = 'recording'
      else phase = 'finishing'
    }
    return {
      phase,
      beat,
      recordStart: this.recordStart,
      pass: phase === 'idle' || beat < 0 ? 0 : Math.floor(beat / JAM_BEATS) + 1,
      pendingNotes: this.pending.length,
    }
  }

  /** Capture first; callers synthesize the live monitor after this returns. */
  handlePad(pad: number, velocity: number, timeStamp?: number): void {
    if (this.transport.state !== 'playing' || this.recordStart === null) return
    if (!Number.isInteger(pad) || pad < 1 || pad > 16 || !Number.isFinite(velocity) || velocity <= 0) return
    const ctx = getAudioContext()
    if (ctx.state !== 'running') return
    const nowMs = performance.now()
    const timing = captureInputTiming(timeStamp, nowMs)
    if (timing.timeStamp < this.startedWallMs || timing.timeStamp < this.armedWallMs
      || nowMs - timing.timeStamp > INPUT_DELIVERY_GRACE_MS) return
    const eventBeat = this.transport.ctxTimeToBeat(eventAudioTime(timing.timeStamp, ctx.currentTime, nowMs))
    const hitBeat = eventBeat - this.latencyMs / 1000 / this.transport.secPerBeat
    // Decide pass membership before quantizing, so a late last-sixteenth wraps
    // to beat zero without accidentally admitting input from the following pass.
    if (hitBeat < this.recordStart || hitBeat >= this.recordStart + JAM_BEATS) return
    const previous = this.hitTimes.get(pad) ?? []
    if (previous.some((at) => Math.abs(at - timing.timeStamp) < RETRIGGER_DEBOUNCE_MS)) return
    const localBeat = hitBeat - this.recordStart
    const t = this.snap ? (Math.round(localBeat * 4) / 4) % JAM_BEATS : localBeat
    const note = normalizeJamNotes([{ t, pad, vel: Math.max(1, Math.round(Math.min(127, velocity))) }])[0]
    const merged = normalizeJamNotes([...this.committed, ...this.pending])
    // Count capacity across the entire loop, including existing layers. At the
    // limit an overdub may still replace a note, but cannot silently lose new hits.
    if (merged.length >= MAX_JAM_NOTES && !merged.some((saved) => saved.t === note.t && saved.pad === note.pad)) return
    this.hitTimes.set(pad, [...previous, timing.timeStamp])
    this.pending = normalizeJamNotes([...this.pending, note])
    // A just-played tail hit can snap to a future seam already visited by the
    // lookahead. Fill that future gap once, without replaying anything elapsed.
    this.scheduleNotes(Math.max(this.recordStart + JAM_BEATS, this.transport.now()), this.schedBeat)
  }

  private readonly onAudioStateChange = (): void => {
    // Never map wall timestamps across a suspended render clock or replay an
    // abandoned take when the browser later resumes a background tab.
    if (this.audioContext?.state !== 'running') this.stop()
  }

  private tick(): void {
    if (this.transport.state !== 'playing') return
    const ctx = getAudioContext()
    if (ctx.state !== 'running') {
      this.stop()
      return
    }
    const now = this.transport.now()
    for (const [key, beat] of this.scheduledNotes) {
      if (beat < now) this.scheduledNotes.delete(key)
    }
    if (this.recordStart !== null) {
      const graceBeats = (Math.max(0, this.latencyMs) + INPUT_DELIVERY_GRACE_MS) / 1000 / this.transport.secPerBeat
      if (now >= this.recordStart + JAM_BEATS + graceBeats) this.commitTake()
      // A consumer can stop/dispose the runtime in its save callback.
      if (this.transport.state !== 'playing') return
    }
    const horizon = now + LOOKAHEAD_SEC / this.transport.secPerBeat
    // A late timer skips elapsed audio. It must never flush old notes/clicks at
    // the current time or walk through every loop missed during a browser stall.
    const from = Math.max(this.schedBeat, now)
    if (horizon <= from) return
    this.scheduleClicks(from, horizon)
    this.scheduleNotes(Math.max(0, from), horizon)
    this.schedBeat = horizon
  }

  private scheduleClicks(from: number, to: number): void {
    for (let beat = Math.ceil(from); beat < to; beat++) {
      const output = beat < 0 ? this.countInOutput : this.clickOutput
      if (!output) continue
      // Count-in always clicks; normal clicks retain their own immediately
      // mutable gain, including clicks already scheduled in the lookahead.
      playClick(this.transport.beatToCtxTime(beat), beat % 4 === 0, output)
    }
  }

  private scheduleNotes(from: number, to: number): void {
    const recordEnd = this.recordStart === null ? Infinity : this.recordStart + JAM_BEATS
    const withTake = this.pending.length ? normalizeJamNotes([...this.committed, ...this.pending]) : this.committed
    for (let cycle = Math.floor(from / JAM_BEATS) * JAM_BEATS; cycle < to; cycle += JAM_BEATS) {
      // The current take can play at the next seam before its save is finalized.
      // It is never replayed inside the pass where the player is recording it.
      const notes = cycle >= recordEnd ? withTake : this.committed
      for (const note of notes) {
        const beat = cycle + note.t
        if (beat < from || beat >= to) continue
        const output = this.padOutputs[note.pad - 1]
        if (!output) continue
        const at = this.transport.beatToCtxTime(beat)
        const key = `${beat}|${note.pad}`
        // If an overdub changes a voice already queued here, this occurrence
        // keeps its queued velocity; following occurrences use the replacement.
        // Never add a second voice on the same pad/beat to change its velocity.
        if (at < getAudioContext().currentTime || this.scheduledNotes.has(key)) continue
        this.scheduledNotes.set(key, beat)
        playSound(DEFAULT_KIT_16[note.pad - 1], at, note.vel, output)
        this.scheduleFlash(note.pad, at)
      }
    }
  }

  private scheduleFlash(pad: number, at: number): void {
    if (!this.onAutoPlay || this.muted.has(pad)) return
    const timer = window.setTimeout(() => {
      this.flashTimers.delete(timer)
      if (this.transport.state !== 'playing' || this.muted.has(pad)) return
      const ctx = getAudioContext()
      if (ctx.state !== 'running' || ctx.currentTime - at > LOOKAHEAD_SEC) return
      this.onAutoPlay?.(pad)
    }, Math.max(0, (at - getAudioContext().currentTime) * 1000))
    this.flashTimers.add(timer)
  }

  private commitTake(): void {
    const captured = this.pending.length > 0
    if (captured) this.committed = normalizeJamNotes([...this.committed, ...this.pending])
    this.recordStart = null
    this.pending = []
    this.hitTimes.clear()
    if (captured) this.onCommit(this.notes)
  }

  private openOutputs(ctx: AudioContext): void {
    this.output = ctx.createGain()
    this.output.connect(getMaster())
    this.padOutputs = DEFAULT_KIT_16.map((_, index) => {
      const output = ctx.createGain()
      output.gain.value = this.muted.has(index + 1) ? 0 : 1
      output.connect(this.output!)
      return output
    })
    this.clickOutput = ctx.createGain()
    this.clickOutput.gain.value = this.metronome ? 1 : 0
    this.clickOutput.connect(this.output)
    this.countInOutput = ctx.createGain()
    this.countInOutput.connect(this.output)
  }

  private closeOutputs(): void {
    if (!this.output) return
    const now = getAudioContext().currentTime
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setValueAtTime(0, now)
    this.output.disconnect()
    this.padOutputs.forEach((output) => output.disconnect())
    this.clickOutput?.disconnect()
    this.countInOutput?.disconnect()
    this.padOutputs = []
    this.output = null
    this.clickOutput = null
    this.countInOutput = null
  }
}
