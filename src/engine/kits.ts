import type { Lesson, SoundName } from './types'

/** Fallback sound layouts when a pad isn't mapped by the current lesson. */
export const DEFAULT_KIT_8: SoundName[] = [
  'kick', 'snare', 'clap', 'rimshot',
  'hatClosed', 'hatOpen', 'shaker', 'crash',
]

export const DEFAULT_KIT_16: SoundName[] = [
  'kick', 'snare', 'clap', 'rimshot',
  'hatClosed', 'hatOpen', 'shaker', 'crash',
  'tomLow', 'tomMid', 'tomHigh', 'ride',
  'cowbell', 'perc', 'stab', 'bass',
]

export function padSoundFor(lesson: Lesson | null, padCount: 8 | 16, pad: number): SoundName | null {
  if (pad < 1 || pad > padCount) return null
  const mapped = lesson?.pads[String(pad)]
  if (mapped) return mapped
  const kit = padCount === 8 ? DEFAULT_KIT_8 : DEFAULT_KIT_16
  return kit[pad - 1] ?? null
}

/** One stable color per pad, used for lanes, notes, and pad accents. */
export const PAD_COLORS: string[] = [
  '#ff5d73', '#ffb84d', '#ffd166', '#c3f36e',
  '#3ef0c8', '#4dd4ff', '#6ea8ff', '#8f7bff',
  '#c77bff', '#ff7bd5', '#ff8fa3', '#ffc78f',
  '#a7f070', '#70e8b0', '#7bc4ff', '#b39dff',
]

export function padColor(pad: number): string {
  return PAD_COLORS[(pad - 1) % PAD_COLORS.length]
}
