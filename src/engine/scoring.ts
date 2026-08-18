import type { Judgement, NoteEvent } from './types'

export interface JudgedEvent extends NoteEvent {
  judgement?: Judgement
  deltaMs?: number
}

export interface HitResult {
  /** 'ignored' = debounced retrigger; it neither scores nor penalises. */
  judgement: Judgement | 'stray' | 'ignored'
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

/**
 * Repeat hits on the same pad closer together than this are treated as one
 * physical hit. Velocity pads bounce and some controllers send duplicate
 * note-ons; without this, one tap can score once and then be penalised.
 * Kept below the fastest same-pad interval any chart uses (43 ms at level 6).
 */
export const RETRIGGER_DEBOUNCE_MS = 30

/**
 * Extra hits cost accuracy, but proportionally and with a ceiling — sloppiness
 * should not be able to wipe out a performance where every note was hit.
 */
const STRAY_WEIGHT = 0.5
const MAX_STRAY_PENALTY = 20

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
  /** Retriggers swallowed by the debounce, for diagnostics. */
  ignored = 0
  private readonly lastHitMs = new Map<number, number>()

  constructor(playerEvents: NoteEvent[], secPerBeat: number) {
    this.events = playerEvents
      .map((e) => ({ ...e }))
      .sort((a, b) => a.t - b.t)
    this.secPerBeat = secPerBeat
    this.outerBeats = WINDOW_MS.good / 1000 / secPerBeat
  }

  /** Register a pad hit at the given beat position. */
  registerHit(pad: number, hitBeat: number): HitResult {
    // One physical hit can arrive as several note-ons; count it once.
    const hitMs = hitBeat * this.secPerBeat * 1000
    const prevMs = this.lastHitMs.get(pad)
    // Compared as a distance, not a signed difference: the live runtime feeds
    // hits in time order, but a scorekeeper that swallowed anything arriving
    // out of order would be wrong for any other caller.
    if (prevMs !== undefined && Math.abs(hitMs - prevMs) < RETRIGGER_DEBOUNCE_MS) {
      this.ignored++
      return { judgement: 'ignored' }
    }
    this.lastHitMs.set(pad, hitMs)

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
    // Proportional and capped: extra hits cost you, but never everything.
    const strayPenalty = total === 0
      ? 0
      : Math.min(MAX_STRAY_PENALTY, (this.stray / total) * 100 * STRAY_WEIGHT)
    const accuracy = Math.max(0, Math.round(raw - strayPenalty))
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
