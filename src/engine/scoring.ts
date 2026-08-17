import type { Judgement, NoteEvent } from './types'

export interface JudgedEvent extends NoteEvent {
  judgement?: Judgement
  deltaMs?: number
}

export interface HitResult {
  judgement: Judgement | 'stray'
  event?: JudgedEvent
  deltaMs?: number
}

export interface ScoreSummary {
  perfect: number
  great: number
  good: number
  miss: number
  stray: number
  total: number
  accuracy: number // 0-100
  stars: 0 | 1 | 2 | 3
  maxCombo: number
}

/** Timing windows, in ms of absolute error. Beyond `good` is a miss. */
export const WINDOW_MS = { perfect: 45, great: 90, good: 135 } as const

export function starsForAccuracy(acc: number): 0 | 1 | 2 | 3 {
  if (acc >= 90) return 3
  if (acc >= 75) return 2
  if (acc >= 55) return 1
  return 0
}

/**
 * Judges pad hits against the player's portion of a chart.
 * All positions are in beats; timing windows convert via secPerBeat.
 */
export class ScoreKeeper {
  readonly events: JudgedEvent[]
  private readonly secPerBeat: number
  private readonly outerBeats: number
  combo = 0
  maxCombo = 0
  stray = 0

  constructor(playerEvents: NoteEvent[], secPerBeat: number) {
    this.events = playerEvents
      .map((e) => ({ ...e }))
      .sort((a, b) => a.t - b.t)
    this.secPerBeat = secPerBeat
    this.outerBeats = WINDOW_MS.good / 1000 / secPerBeat
  }

  /** Register a pad hit at the given beat position. */
  registerHit(pad: number, hitBeat: number): HitResult {
    let best: JudgedEvent | null = null
    let bestDist = Infinity
    for (const ev of this.events) {
      if (ev.t > hitBeat + this.outerBeats) break
      if (ev.pad !== pad || ev.judgement) continue
      const d = Math.abs(ev.t - hitBeat)
      if (d <= this.outerBeats && d < bestDist) {
        best = ev
        bestDist = d
      }
    }
    if (!best) {
      this.stray++
      this.combo = 0
      return { judgement: 'stray' }
    }
    const deltaMs = (hitBeat - best.t) * this.secPerBeat * 1000
    const a = Math.abs(deltaMs)
    const judgement: Judgement =
      a <= WINDOW_MS.perfect ? 'perfect' : a <= WINDOW_MS.great ? 'great' : 'good'
    best.judgement = judgement
    best.deltaMs = deltaMs
    this.combo++
    if (this.combo > this.maxCombo) this.maxCombo = this.combo
    return { judgement, event: best, deltaMs }
  }

  /** Mark events whose window has passed as misses. Returns newly missed events. */
  sweepMisses(nowBeat: number): JudgedEvent[] {
    const missed: JudgedEvent[] = []
    for (const ev of this.events) {
      if (ev.t > nowBeat) break
      if (!ev.judgement && ev.t + this.outerBeats < nowBeat) {
        ev.judgement = 'miss'
        missed.push(ev)
        this.combo = 0
      }
    }
    return missed
  }

  summary(): ScoreSummary {
    const counts = { perfect: 0, great: 0, good: 0, miss: 0 }
    for (const ev of this.events) {
      counts[ev.judgement ?? 'miss']++
    }
    const total = this.events.length
    const raw = total === 0
      ? 100
      : ((counts.perfect + counts.great * 0.85 + counts.good * 0.5) / total) * 100
    const accuracy = Math.max(0, Math.round(raw - this.stray)) // light stray-hit penalty
    return {
      ...counts,
      stray: this.stray,
      total,
      accuracy,
      stars: starsForAccuracy(accuracy),
      maxCombo: this.maxCombo,
    }
  }
}
