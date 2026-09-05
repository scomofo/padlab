import { describe, expect, it } from 'vitest'
import { dailyLesson, nextInCourse, performScored, recommendLesson, resumeStep, stepDone, stepsDoneCount, weekDots } from '../../src/lib/curriculum'
import { todayKey } from '../../src/lib/dates'
import type { Lesson, LessonProgress } from '../../src/engine/types'
import { makeLesson } from '../helpers/chart'

const L = (over: Partial<Lesson>): Lesson => makeLesson(over)

const stars = (n: number): LessonProgress => ({ stars: n, bestAccuracy: n * 30 })

describe('recommendLesson', () => {
  const lessons = [
    L({ id: 'a', title: 'A', course: 'foundations', level: 1 }),
    L({ id: 'b', title: 'B', course: 'foundations', level: 1 }),
    L({ id: 'c', title: 'C', course: 'hiphop', level: 2 }),
  ]

  it('picks the first unmastered lesson for a fresh player', () => {
    expect(recommendLesson(lessons, {}, null).id).toBe('a')
  })

  it('keeps the last lesson until it is three-starred', () => {
    expect(recommendLesson(lessons, { a: stars(1) }, 'a').id).toBe('a')
  })

  it('advances to the next unmastered lesson in the same course', () => {
    expect(recommendLesson(lessons, { a: stars(3) }, 'a').id).toBe('b')
  })

  it('falls through to any unmastered lesson once the course is done', () => {
    expect(recommendLesson(lessons, { a: stars(3), b: stars(3) }, 'b').id).toBe('c')
  })

  it('falls back to the first lesson when everything is mastered', () => {
    expect(recommendLesson(lessons, { a: stars(3), b: stars(3), c: stars(3) }, 'c').id).toBe('a')
  })
})

describe('nextInCourse', () => {
  const lessons = [
    L({ id: 'a', course: 'foundations' }),
    L({ id: 'b', course: 'foundations' }),
    L({ id: 'c', course: 'hiphop' }),
  ]

  it('prefers the next unmastered sibling', () => {
    expect(nextInCourse(lessons, lessons[0], { a: stars(3) })?.id).toBe('b')
  })

  it('returns the next sibling even if it is already mastered', () => {
    expect(nextInCourse(lessons, lessons[0], { a: stars(3), b: stars(3) })?.id).toBe('b')
  })

  it('returns null at the end of a course', () => {
    expect(nextInCourse(lessons, lessons[1], {})).toBeNull()
  })
})

describe('dailyLesson', () => {
  const lessons = [
    L({ id: 'l1', level: 1 }),
    L({ id: 'l2', level: 2 }),
    L({ id: 'l5', level: 5 }),
    L({ id: 'l6', level: 6 }),
  ]

  it('caps a fresh player at level 2', () => {
    const d = dailyLesson(lessons, {})
    expect(['l1', 'l2']).toContain(d.id)
  })

  it('opens one extra level above the player\'s highest star', () => {
    const d = dailyLesson(lessons, { l2: stars(1) })
    expect(d.level).toBeLessThanOrEqual(3)
    expect(d.id).not.toBe('l5')
    expect(d.id).not.toBe('l6')
  })

  it('is stable for a given local day', () => {
    expect(dailyLesson(lessons, {}).id).toBe(dailyLesson(lessons, {}).id)
  })
})

describe('weekDots', () => {
  it('marks the last seven local days, oldest first', () => {
    const today = new Date(2026, 8, 2) // 2026-09-02 local
    const week = {
      [todayKey(today)]: 1,
      '2026-08-31': 2,
    }
    expect(weekDots(week, today)).toEqual([false, false, false, false, true, false, true])
  })
})

describe('step tracking', () => {
  const lesson = L({ id: 's' }) // makeLesson default: 3 steps, Perform last
  const steps = lesson.steps.length

  it('reads practice steps from stepsDone and the final step from stars', () => {
    expect(stepDone(lesson, undefined, 0)).toBe(false)
    expect(stepDone(lesson, { stars: 0, bestAccuracy: 0, stepsDone: [0] }, 0)).toBe(true)
    expect(stepDone(lesson, { stars: 0, bestAccuracy: 0, stepsDone: [steps - 1] }, steps - 1)).toBe(false)
    expect(stepDone(lesson, { stars: 1, bestAccuracy: 60 }, steps - 1)).toBe(true)
  })

  it('counts done steps', () => {
    expect(stepsDoneCount(lesson, undefined)).toBe(0)
    expect(stepsDoneCount(lesson, { stars: 2, bestAccuracy: 80, stepsDone: [0] })).toBe(2)
  })

  it('resumes on the first undone step, or Perform once everything is done', () => {
    expect(resumeStep(lesson, undefined)).toBe(0)
    expect(resumeStep(lesson, { stars: 0, bestAccuracy: 0, stepsDone: [0] })).toBe(1)
    expect(resumeStep(lesson, { stars: 0, bestAccuracy: 0, stepsDone: [1] })).toBe(0)
    expect(resumeStep(lesson, { stars: 0, bestAccuracy: 0, stepsDone: [0, 1] })).toBe(steps - 1)
    expect(resumeStep(lesson, { stars: 3, bestAccuracy: 95, stepsDone: [0, 1] })).toBe(steps - 1)
  })
})

describe('performScored', () => {
  it('counts only the Perform step at full tempo or faster', () => {
    expect(performScored(true, 100)).toBe(true)
    expect(performScored(true, 110)).toBe(true)
    expect(performScored(true, 90)).toBe(false)
    expect(performScored(false, 100)).toBe(false)
  })
})
