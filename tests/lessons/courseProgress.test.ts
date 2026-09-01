/**
 * The lesson browser's progress aggregation, extracted as pure functions so
 * the arithmetic is testable without rendering the component.
 */
import { describe, expect, it } from 'vitest'
import { courseProgress, startedCount, totalStars } from '../../src/lessons/courseProgress'
import type { Lesson, LessonProgress } from '../../src/engine/types'
import type { Guide } from '../../src/guides/types'
import type { GuideProgress } from '../../src/store/progress'
import { makeLesson } from '../helpers/chart'

const lesson = (id: string): Lesson => makeLesson({ id })

const guide = (id: string): Guide => ({
  id,
  title: id,
  course: 'sp404-workshop',
  device: 'SP-404 MKII',
  blurb: 'x',
  level: 1,
  minutes: 10,
  padCount: 16,
  steps: [{ title: 's', body: ['b'] }],
})

const stars = (n: number): LessonProgress => ({ stars: n, bestAccuracy: n * 30 })
const done: GuideProgress = { lastStep: 3, completed: true }
const partway: GuideProgress = { lastStep: 1, completed: false }

describe('courseProgress', () => {
  it('counts only mastered (3-star) lessons in a lesson course', () => {
    const cp = courseProgress(
      [lesson('a'), lesson('b'), lesson('c')],
      [],
      { a: stars(3), b: stars(2) },
      {},
    )
    expect(cp).toEqual({ done: 1, total: 3, pct: 33, noun: 'mastered' })
  })

  it('counts only completed guides in a guide course', () => {
    const cp = courseProgress([], [guide('g1'), guide('g2')], {}, { g1: done, g2: partway })
    expect(cp).toEqual({ done: 1, total: 2, pct: 50, noun: 'complete' })
  })

  /**
   * The old inline version counted guides *or* lessons (`guides.length ||
   * lessons.length`), so adding one guide to a lesson course silently dropped
   * every lesson from the bar.
   */
  it('counts lessons and guides together in a mixed course', () => {
    const cp = courseProgress(
      [lesson('a'), lesson('b')],
      [guide('g1')],
      { a: stars(3) },
      { g1: done },
    )
    expect(cp).toEqual({ done: 2, total: 3, pct: 67, noun: 'complete' })
  })

  it('reaches 100% only when everything is done', () => {
    const cp = courseProgress([lesson('a')], [guide('g1')], { a: stars(3) }, { g1: done })
    expect(cp.pct).toBe(100)
  })

  it('handles an empty course without dividing by zero', () => {
    expect(courseProgress([], [], {}, {})).toEqual({ done: 0, total: 0, pct: 0, noun: 'mastered' })
  })

  it('treats a lesson with no progress record as not mastered', () => {
    const cp = courseProgress([lesson('a')], [], {}, {})
    expect(cp.done).toBe(0)
  })
})

describe('totalStars', () => {
  it('sums stars across the library, treating missing records as zero', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c')]
    expect(totalStars(lessons, { a: stars(3), c: stars(1) })).toBe(4)
  })

  it('is zero for a fresh profile', () => {
    expect(totalStars([lesson('a')], {})).toBe(0)
  })
})

describe('startedCount', () => {
  it('counts lessons with at least one star', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c')]
    expect(startedCount(lessons, { a: stars(3), b: stars(0), c: stars(1) })).toBe(2)
  })

  it('does not count a zero-star best as started', () => {
    expect(startedCount([lesson('a')], { a: { stars: 0, bestAccuracy: 40 } })).toBe(0)
  })
})
