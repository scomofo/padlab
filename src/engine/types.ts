// Core shared types for lessons, charts, and scoring.

export type SoundName =
  | 'kick' | 'snare' | 'clap' | 'rimshot'
  | 'hatClosed' | 'hatOpen' | 'shaker' | 'crash'
  | 'ride' | 'tomLow' | 'tomMid' | 'tomHigh'
  | 'cowbell' | 'perc' | 'stab' | 'bass'

export const SOUND_NAMES: SoundName[] = [
  'kick', 'snare', 'clap', 'rimshot',
  'hatClosed', 'hatOpen', 'shaker', 'crash',
  'ride', 'tomLow', 'tomMid', 'tomHigh',
  'cowbell', 'perc', 'stab', 'bass',
]

export const SOUND_LABELS: Record<SoundName, string> = {
  kick: 'Kick', snare: 'Snare', clap: 'Clap', rimshot: 'Rim',
  hatClosed: 'Hat', hatOpen: 'Open Hat', shaker: 'Shaker', crash: 'Crash',
  ride: 'Ride', tomLow: 'Tom Lo', tomMid: 'Tom Mid', tomHigh: 'Tom Hi',
  cowbell: 'Cowbell', perc: 'Perc', stab: 'Stab', bass: 'Bass',
}

/** One note in a chart. `t` is in beats from the start of the loop (quarter note = 1.0, 4/4). */
export interface NoteEvent {
  t: number
  pad: number // 1-based pad index
  vel?: number // 1-127, default 100
}

export interface LessonStep {
  name: string
  description?: string
  /** Pads the player is responsible for in this step; every other charted pad auto-plays as backing. */
  playerPads: number[] | 'all'
  /** Multiplier on lesson bpm for this step (e.g. 0.75 = practice slow). Default 1. */
  tempoScale?: number
}

export interface Lesson {
  id: string
  title: string
  /** Course this lesson belongs to (see lessons/courses.ts). */
  course: string
  genre: string
  level: number // 1 (beginner) .. 6 (advanced)
  padCount: 8 | 16
  bpm: number
  bars: number // 4/4 bars; chart length = bars * 4 beats
  /** pad number (as string key) -> sound it triggers */
  pads: Record<string, SoundName>
  steps: LessonStep[]
  events: NoteEvent[]
}

export type Judgement = 'perfect' | 'great' | 'good' | 'miss'

export interface LessonProgress {
  stars: number
  bestAccuracy: number
  /**
   * Indices of practice steps completed (a finished Practice run, or a Play run
   * at one star or better). The final Perform step is tracked by `stars`, not
   * here. Omitted when empty so older saves and fixtures compare unchanged.
   */
  stepsDone?: number[]
}
