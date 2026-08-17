/**
 * Guides are hardware walkthroughs, not playable charts: a sequence of steps
 * describing button presses on the device. They live alongside lessons in the
 * curriculum but open in GuideViewer instead of the note highway.
 */

export interface GuideStep {
  title: string
  /** Instruction lines, in order. */
  body: string[]
  /** Button presses for this step. Each inner array is one simultaneous combo. */
  keys?: string[][]
  /** Pads this step involves, drawn on the pad diagram. */
  pads?: { pad: number; label: string }[]
  /** How to tell it worked. */
  checkpoint?: string
  tip?: string
}

export interface Guide {
  id: string
  title: string
  course: string
  /** Hardware this applies to, shown on the card. */
  device: string
  blurb: string
  level: number
  minutes: number
  padCount: 8 | 16
  /** Enables the built-in practice metronome at this tempo. */
  bpm?: number
  steps: GuideStep[]
}
