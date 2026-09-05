import { describe, expect, it } from 'vitest'
import { createFocusLesson, findFocusPhrase, focusTempo, FOCUS_REPEATS } from '../../src/lib/focus'
import type { JudgedEvent } from '../../src/engine/scoring'
import { makeLesson, note } from '../helpers/chart'

describe('focus phrases', () => {
  it('selects the phrase losing the most scoring points, with stable ties', () => {
    const lesson = makeLesson({ bars: 6 })
    const events: JudgedEvent[] = [
      { ...note(0, 1), judgement: 'great' },
      { ...note(4, 1), judgement: 'good' },
      { ...note(8, 1), judgement: 'miss' },
      { ...note(12, 1), judgement: 'perfect' },
      { ...note(16, 1), judgement: 'miss' },
    ]
    expect(findFocusPhrase(lesson, events)).toEqual({ startBar: 3, endBar: 4, misses: 1, offTime: 0, total: 2 })
  })

  it('handles an odd final bar and includes only judged, in-range notes', () => {
    const lesson = makeLesson({ bars: 3 })
    expect(findFocusPhrase(lesson, [
      note(0, 1),
      { ...note(-1, 1), judgement: 'miss' },
      { ...note(8, 1), judgement: 'good' },
      { ...note(12, 1), judgement: 'miss' },
    ])).toEqual({ startBar: 3, endBar: 3, misses: 0, offTime: 1, total: 1 })
  })

  it('does not invent a weak phrase for perfect, empty or unplayed input', () => {
    const lesson = makeLesson()
    expect(findFocusPhrase(lesson, [])).toBeNull()
    expect(findFocusPhrase(lesson, lesson.events)).toBeNull()
    expect(findFocusPhrase(lesson, lesson.events.map((e) => ({ ...e, judgement: 'perfect' })))).toBeNull()
  })

  it('repeats just the selected bars while preserving backing, velocities, kit and step tempo', () => {
    const lesson = makeLesson({
      steps: [{ name: 'Kick', playerPads: [1], tempoScale: 0.7 }, { name: 'Perform', playerPads: 'all' }],
      events: [note(0, 1), note(8, 1, 40), note(8, 2, 99), note(15.5, 1, 110), note(16, 1)],
    })
    const before = structuredClone(lesson)
    const drill = createFocusLesson(lesson, 0, { startBar: 3, endBar: 4, misses: 1, offTime: 0, total: 2 })
    expect(drill.bars).toBe(2 * FOCUS_REPEATS)
    expect(drill.events).toEqual(Array.from({ length: 4 }, (_, i) => [
      note(i * 8, 1, 40), note(i * 8, 2, 99), note(i * 8 + 7.5, 1, 110),
    ]).flat())
    expect(drill.steps[0]).toMatchObject({ playerPads: [1], tempoScale: 0.7 })
    expect(drill.pads).toEqual(lesson.pads)
    expect(drill.id).not.toBe(lesson.id)
    expect(lesson).toEqual(before)
  })

  it('uses supported practice tempos even from a ladder run or the slowest setting', () => {
    expect([120, 105, 100, 90, 70, 50].map(focusTempo)).toEqual([80, 80, 80, 70, 50, 50])
  })
})
