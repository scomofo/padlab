import type { JudgedEvent } from '../engine/scoring'
import type { Lesson } from '../engine/types'

export interface FocusPhrase {
  /** One-based, inclusive bar numbers in the original chart. */
  startBar: number
  endBar: number
  misses: number
  offTime: number
  total: number
}

export const FOCUS_REPEATS = 4

/** Find the two-bar phrase costing the most points in the player's part. */
export function findFocusPhrase(lesson: Lesson, events: JudgedEvent[]): FocusPhrase | null {
  let best: FocusPhrase | null = null
  let mostLost = 0
  for (let bar = 0; bar < lesson.bars; bar += 2) {
    const end = Math.min(bar + 2, lesson.bars)
    const phrase = events.filter((e) => e.t >= bar * 4 && e.t < end * 4 && e.judgement)
    const misses = phrase.filter((e) => e.judgement === 'miss').length
    const good = phrase.filter((e) => e.judgement === 'good').length
    const great = phrase.filter((e) => e.judgement === 'great').length
    // Integer weights match scoring's miss/good/great losses (1 / .5 / .15).
    // Extra hits have no reliable chart location, so never attribute them here.
    const lost = misses * 100 + good * 50 + great * 15
    if (lost > mostLost) {
      mostLost = lost
      best = { startBar: bar + 1, endBar: end, misses, offTime: good + great, total: phrase.length }
    }
  }
  return best
}

export function phraseLabel(phrase: FocusPhrase): string {
  return phrase.startBar === phrase.endBar ? `Bar ${phrase.startBar}` : `Bars ${phrase.startBar}–${phrase.endBar}`
}

/** An ephemeral chart: preserve backing, kit, velocities and the original player part. */
export function createFocusLesson(lesson: Lesson, stepIndex: number, phrase: FocusPhrase): Lesson {
  const from = (phrase.startBar - 1) * 4
  const beats = (phrase.endBar - phrase.startBar + 1) * 4
  const events = lesson.events.filter((e) => e.t >= from && e.t < from + beats)
  return {
    ...lesson,
    id: `${lesson.id}::focus:${phrase.startBar}`,
    bars: (beats / 4) * FOCUS_REPEATS,
    steps: [{ ...lesson.steps[stepIndex], name: `${phraseLabel(phrase)} · ${FOCUS_REPEATS} repeats` }],
    events: Array.from({ length: FOCUS_REPEATS }, (_, i) =>
      events.map((e) => ({ ...e, t: e.t - from + i * beats })),
    ).flat().sort((a, b) => a.t - b.t || a.pad - b.pad),
  }
}

/** A comfortable starting speed drawn from the existing tempo menu. */
export function focusTempo(tempoPct: number): number {
  return Math.max(50, Math.floor((Math.min(100, tempoPct) - 20) / 10) * 10)
}
