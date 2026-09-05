import { describe, expect, it } from 'vitest'
import type { LessonProgress } from '../../src/engine/types'
import { buildSession, completeSessionRound, estimateSessionMinutes, sessionCompleted, type SessionResult } from '../../src/lib/session'
import { makeLesson } from '../helpers/chart'

const now = new Date('2026-09-05T10:00:00.000Z')
const first = makeLesson({ id: 'first-taps' })
const other = makeLesson({ id: 'backbeat' })
const earned = (over: Partial<LessonProgress> = {}): LessonProgress => ({ stars: 0, bestAccuracy: 0, ...over })

describe('quick session planning', () => {
  it('starts genuinely fresh players on First Taps even when alphabetical order differs', () => {
    const session = buildSession([other, first], {}, null, now)!
    expect(session.lessonId).toBe('first-taps')
    expect(session.rounds.map((round) => [round.stepIndex, round.tempoPct])).toEqual([[0, 100], [1, 100], [2, 100]])
    expect(session.results).toEqual([])
    expect(session.startedAt).toBe(now.toISOString())
    expect(buildSession([], {}, null)).toBeNull()
  })

  it('honors the last chosen lesson and recorded practice progress without requiring stars', () => {
    expect(buildSession([other, first], {}, 'backbeat')?.lessonId).toBe('backbeat')
    const progress = { backbeat: earned({ stepsDone: [0] }) }
    const session = buildSession([other, first], progress, null)!
    expect(session.lessonId).toBe('backbeat')
    expect(session.rounds.map((round) => [round.stepIndex, round.tempoPct])).toEqual([[1, 100], [2, 80], [2, 100]])
  })

  it('uses the next three steps of a longer lesson without skipping its teaching sequence', () => {
    const lesson = makeLesson({ steps: [
      ...first.steps.slice(0, 2),
      { name: 'Add hats', playerPads: [1, 2, 5] },
      { name: 'Build the groove', playerPads: 'all' },
      { name: 'Perform', playerPads: 'all' },
    ] })
    const session = buildSession([lesson], { [lesson.id]: earned({ stepsDone: [0] }) }, lesson.id)!
    expect(session.rounds.map((round) => round.stepIndex)).toEqual([1, 2, 3])
    expect(session.rounds.map((round) => round.label)).toEqual(['Add snare', 'Add hats', 'Build the groove'])
  })

  it('warms up, performs, then repeats when only Perform remains', () => {
    const session = buildSession([first], { 'first-taps': earned({ stepsDone: [0, 1] }) }, first.id)!
    expect(session.rounds.map((round) => [round.stepIndex, round.tempoPct])).toEqual([[2, 80], [2, 100], [2, 100]])
    expect(session.rounds[2].label).toBe('Make it stick')
  })

  it('advances to an unmastered course lesson after mastery', () => {
    expect(buildSession([first, other], { 'first-taps': earned({ stars: 3 }) }, first.id)?.lessonId).toBe('backbeat')
  })

  it('replays the last lesson with a next rung when the whole catalog is mastered, including older saves', () => {
    const progress = { 'first-taps': earned({ stars: 3 }), backbeat: earned({ stars: 3, bestTempoPct: 110 }) }
    const session = buildSession([first, other], progress, 'backbeat')!
    expect(session.lessonId).toBe('backbeat')
    expect(session.rounds.map((round) => [round.stepIndex, round.tempoPct])).toEqual([[2, 80], [2, 100], [2, 115]])
    progress.backbeat.bestTempoPct = 120
    expect(buildSession([first, other], progress, 'backbeat')!.rounds[2].tempoPct).toBe(100)
  })

  it('handles a removed last lesson and a catalog without the onboarding lesson', () => {
    expect(buildSession([other], {}, 'removed')?.lessonId).toBe(other.id)
    expect(buildSession([makeLesson({ steps: [] })], {}, null)).toBeNull()
  })
})

describe('session duration', () => {
  it('counts chart length, each step speed, user tempo, count-in and tail', () => {
    const lesson = makeLesson({ bpm: 60, bars: 4, steps: [{ name: 'Perform', playerPads: 'all', tempoScale: 0.5 }] })
    const rounds = [100, 80, 100].map((tempoPct) => ({ stepIndex: 0, tempoPct, label: 'Play' }))
    // 42 + 52.5 + 42 seconds, plus each run's start offset.
    expect(estimateSessionMinutes(lesson, rounds)).toBe(3)
    expect(estimateSessionMinutes({ ...lesson, bars: 8 }, rounds)).toBe(5)
    expect(estimateSessionMinutes(lesson, [])).toBe(1)
  })

  it('matches the runtime minimum/maximum tempo clamp and never estimates below one minute', () => {
    const round = [{ stepIndex: 0, tempoPct: 120, label: 'Play' }]
    const lesson = makeLesson({ bpm: 60, bars: 32, steps: [{ name: 'Play', playerPads: 'all', tempoScale: 2 }] })
    expect(estimateSessionMinutes(lesson, round)).toBe(2)
    expect(estimateSessionMinutes({ ...lesson, bars: 4, steps: [{ ...lesson.steps[0], tempoScale: 0.1 }] }, round)).toBe(2)
    expect(estimateSessionMinutes(first, round)).toBe(1)
  })
})

describe('session completion', () => {
  const hit: SessionResult = { mode: 'play', accuracy: 75, notesHit: 2 }

  it('advances once per engaged run and does not let retries or skipped indices advance twice', () => {
    const session = buildSession([first], {}, null)!
    const next = completeSessionRound(session, 0, hit)
    expect(session.results).toEqual([])
    expect(next.results).toEqual([hit])
    expect(completeSessionRound(next, 0, hit)).toBe(next)
    expect(completeSessionRound(session, 1, hit)).toBe(session)
    expect(completeSessionRound(session, -1, hit)).toBe(session)
    expect(completeSessionRound(session, 0.5, hit)).toBe(session)
    expect(sessionCompleted(next)).toBe(false)
    const done = completeSessionRound(completeSessionRound(next, 1, hit), 2, { mode: 'practice', accuracy: null, notesHit: 4 })
    expect(sessionCompleted(done)).toBe(true)
    expect(completeSessionRound(done, 3, hit)).toBe(done)
    hit.accuracy = 80
    expect(next.results[0].accuracy).toBe(75)
  })

  it('rejects idle, malformed, nonfinite and mode-incompatible results', () => {
    const session = buildSession([first], {}, null)!
    const invalid = [
      { ...hit, notesHit: 0 }, { ...hit, notesHit: -1 }, { ...hit, notesHit: 1.5 },
      { ...hit, notesHit: Infinity }, { ...hit, accuracy: NaN }, { ...hit, accuracy: 101 },
      { ...hit, accuracy: -1 }, { ...hit, accuracy: null }, { ...hit, mode: 'listen' },
      { ...hit, mode: 'practice' }, null,
    ]
    for (const result of invalid) expect(completeSessionRound(session, 0, result as SessionResult)).toBe(session)
  })
})
