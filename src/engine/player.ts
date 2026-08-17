import { Transport } from './transport'
import { ScoreKeeper, type ScoreSummary } from './scoring'
import type { Judgement, Lesson, LessonStep, NoteEvent, SoundName } from './types'
import { playSound, playClick } from '../audio/drumSynth'
import { getAudioContext } from '../audio/audio'
import { padSoundFor } from './kits'

export type PlayMode = 'listen' | 'practice' | 'play'

export interface FeedbackItem {
  pad: number
  judgement: Judgement | 'stray'
  wall: number // performance.now() when it happened, for fading popups
}

export interface RuntimeOptions {
  lesson: Lesson
  stepIndex: number
  mode: PlayMode
  tempoPct: number // user tempo, 40-100
  metronome: boolean
  latencyMs: number
  onFinish: (summary: ScoreSummary | null) => void
  /** Called when the engine auto-plays a pad (backing / listen mode), for pad-light feedback. */
  onAutoPlay?: (pad: number) => void
}

const LOOKAHEAD_SEC = 0.12
const TICK_MS = 25
export const COUNT_IN_BEATS = 4

/**
 * One playback run of one lesson step. Owns the transport, the audio
 * scheduling, wait-mode logic, and (in play mode) the scorekeeper.
 * The Highway canvas reads its public fields every frame.
 */
export class PlayerRuntime {
  readonly transport = new Transport()
  readonly lesson: Lesson
  readonly step: LessonStep
  readonly mode: PlayMode
  readonly playerPadSet: Set<number>
  readonly playerEvents: NoteEvent[]
  readonly backingEvents: NoteEvent[]
  readonly totalBeats: number
  score: ScoreKeeper | null = null
  feedback: FeedbackItem[] = []
  /** Pads currently blocking progress in practice (wait) mode. */
  waitingPads: Set<number> | null = null
  waitBeat = 0
  /** Player events already satisfied in practice mode. */
  readonly practiceDone = new Set<NoteEvent>()

  private readonly opts: RuntimeOptions
  private timer: number | null = null
  private schedBeat = 0
  private finished = false

  constructor(opts: RuntimeOptions) {
    this.opts = opts
    this.lesson = opts.lesson
    this.step = opts.lesson.steps[opts.stepIndex]
    this.mode = opts.mode
    this.totalBeats = opts.lesson.bars * 4

    const scale = (this.step.tempoScale ?? 1) * (opts.tempoPct / 100)
    this.transport.bpm = opts.lesson.bpm
    this.transport.tempoScale = Math.min(1.2, Math.max(0.25, scale))

    const sorted = [...opts.lesson.events].sort((a, b) => a.t - b.t)
    this.playerPadSet =
      this.step.playerPads === 'all'
        ? new Set(sorted.map((e) => e.pad))
        : new Set(this.step.playerPads)
    this.playerEvents = sorted.filter((e) => this.playerPadSet.has(e.pad))
    this.backingEvents = sorted.filter((e) => !this.playerPadSet.has(e.pad))
  }

  start(): void {
    if (this.mode === 'play') {
      this.score = new ScoreKeeper(this.playerEvents, this.transport.secPerBeat)
    }
    this.schedBeat = -COUNT_IN_BEATS
    this.transport.start(-COUNT_IN_BEATS)
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.transport.stop()
  }

  /** Toggle the click mid-run; already-scheduled beats still play. */
  setMetronome(on: boolean): void {
    this.opts.metronome = on
  }

  private tick(): void {
    const t = this.transport
    if (t.state !== 'playing') return
    const now = t.now()

    // Practice (wait) mode: pause the moment an unplayed note reaches the line.
    let nextPending: NoteEvent | undefined
    if (this.mode === 'practice') {
      nextPending = this.playerEvents.find((e) => !this.practiceDone.has(e))
      if (nextPending && now >= nextPending.t) {
        const pads = new Set<number>()
        for (const e of this.playerEvents) {
          if (!this.practiceDone.has(e) && Math.abs(e.t - nextPending.t) < 1e-6) pads.add(e.pad)
        }
        this.waitingPads = pads
        this.waitBeat = nextPending.t
        t.pause()
        return
      }
    }

    // Schedule audible events inside the lookahead window. In practice mode the
    // horizon stops at the next wait line: WebAudio can't be paused, so anything
    // scheduled past it would sound during the freeze and be skipped on resume.
    let horizon = now + LOOKAHEAD_SEC / t.secPerBeat
    if (nextPending) horizon = Math.min(horizon, nextPending.t)
    if (horizon > this.schedBeat) {
      const firstClick = Math.ceil(this.schedBeat - 1e-9)
      for (let b = firstClick; b < horizon && b < this.totalBeats; b++) {
        if (b >= 0 && !this.opts.metronome) continue // count-in always clicks
        playClick(t.beatToCtxTime(b), (((b % 4) + 4) % 4) === 0)
      }
      this.scheduleRange(this.backingEvents, this.schedBeat, horizon)
      if (this.mode === 'listen') this.scheduleRange(this.playerEvents, this.schedBeat, horizon)
      this.schedBeat = horizon
    }

    // Sweep at the same compensated position hits are judged at, or a late-but-
    // valid hit would be force-missed before its event ever arrives.
    const latBeats = this.opts.latencyMs / 1000 / t.secPerBeat
    if (this.score) {
      for (const missed of this.score.sweepMisses(now - latBeats)) {
        this.feedback.push({ pad: missed.pad, judgement: 'miss', wall: performance.now() })
      }
    }

    if (now >= this.totalBeats + 1 + Math.max(0, latBeats)) this.finish()
  }

  private scheduleRange(events: NoteEvent[], from: number, to: number): void {
    const ctx = getAudioContext()
    for (const e of events) {
      if (e.t < from || e.t >= to) continue
      const sound = this.soundFor(e.pad)
      if (!sound) continue
      const at = this.transport.beatToCtxTime(e.t)
      playSound(sound, at, e.vel ?? 100)
      if (this.opts.onAutoPlay) {
        const delayMs = Math.max(0, (at - ctx.currentTime) * 1000)
        const pad = e.pad
        window.setTimeout(() => this.opts.onAutoPlay!(pad), delayMs)
      }
    }
  }

  private finish(): void {
    if (this.finished) return
    this.finished = true
    this.stop()
    this.opts.onFinish(this.score ? this.score.summary() : null)
  }

  /** Route a live pad hit (MIDI / keyboard / pointer). Sound is played by the caller. */
  handlePad(pad: number): void {
    const t = this.transport
    if (this.mode === 'play' && t.state === 'playing' && this.score) {
      const hitBeat = t.now() - this.opts.latencyMs / 1000 / t.secPerBeat
      if (hitBeat < -0.5) return // jamming during count-in is free
      if (hitBeat > this.totalBeats + 0.5) return
      const res = this.score.registerHit(pad, hitBeat)
      this.feedback.push({ pad, judgement: res.judgement, wall: performance.now() })
      return
    }
    if (this.mode === 'practice') {
      if (t.state === 'paused' && this.waitingPads) {
        if (!this.waitingPads.has(pad)) return
        for (const e of this.playerEvents) {
          if (e.pad === pad && !this.practiceDone.has(e) && Math.abs(e.t - this.waitBeat) < 1e-6) {
            this.practiceDone.add(e)
            break
          }
        }
        this.waitingPads.delete(pad)
        if (this.waitingPads.size === 0) {
          this.waitingPads = null
          t.resume()
        }
      } else if (t.state === 'playing') {
        // Early hits within a short window satisfy the note so we don't pause on it.
        const win = 0.2 / t.secPerBeat
        const now = t.now()
        let best: NoteEvent | null = null
        let bestDist = Infinity
        for (const e of this.playerEvents) {
          if (e.pad !== pad || this.practiceDone.has(e)) continue
          const d = Math.abs(e.t - now)
          if (d <= win && d < bestDist) {
            best = e
            bestDist = d
          }
        }
        if (best) this.practiceDone.add(best)
      }
    }
  }

  soundFor(pad: number): SoundName | null {
    return padSoundFor(this.lesson, this.lesson.padCount, pad)
  }
}
