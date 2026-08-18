/**
 * The app's view of its own content: what LESSONS/GUIDES actually expose after
 * the glob import, filtering, dedup and sort. The validators check each file in
 * isolation; these check the library as a whole.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/lessons'
import { GUIDES } from '../../src/guides'
import { COURSES, COURSE_IDS, courseTitle } from '../../src/lessons/courses'

describe('LESSONS', () => {
  it('loads the whole data directory', () => {
    expect(LESSONS.length).toBeGreaterThan(0)
  })

  it('has no duplicate ids', () => {
    const ids = LESSONS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only contains playable lessons', () => {
    for (const l of LESSONS) {
      expect(l.events.length, l.id).toBeGreaterThan(0)
      expect(l.steps.length, l.id).toBeGreaterThan(0)
      expect([8, 16], l.id).toContain(l.padCount)
    }
  })

  it('sorts by level, then pad count, then title', () => {
    const key = (l: (typeof LESSONS)[number]) => [l.level, l.padCount, l.title] as const
    for (let i = 1; i < LESSONS.length; i++) {
      const [prevLevel, prevPads, prevTitle] = key(LESSONS[i - 1])
      const [level, pads, title] = key(LESSONS[i])
      const ordered =
        prevLevel < level ||
        (prevLevel === level && prevPads < pads) ||
        (prevLevel === level && prevPads === pads && prevTitle.localeCompare(title) <= 0)
      expect(ordered, `${LESSONS[i - 1].id} before ${LESSONS[i].id}`).toBe(true)
    }
  })

  it('assigns every lesson to a real course', () => {
    for (const l of LESSONS) expect(COURSE_IDS, l.id).toContain(l.course)
  })

  it('ends every lesson with a full-kit step, which is the scored one', () => {
    for (const l of LESSONS) expect(l.steps.at(-1)?.playerPads, l.id).toBe('all')
  })

  it('only charts pads the lesson maps to a sound', () => {
    for (const l of LESSONS) {
      for (const e of l.events) expect(l.pads[String(e.pad)], `${l.id} pad ${e.pad}`).toBeDefined()
    }
  })

  it('keeps every event inside the chart length', () => {
    for (const l of LESSONS) {
      for (const e of l.events) {
        expect(e.t, l.id).toBeGreaterThanOrEqual(0)
        expect(e.t, l.id).toBeLessThan(l.bars * 4)
      }
    }
  })

  it('covers every level from 1 to 6', () => {
    const levels = new Set(LESSONS.map((l) => l.level))
    for (let level = 1; level <= 6; level++) expect(levels, `level ${level}`).toContain(level)
  })

  it('offers lessons for both supported controllers', () => {
    expect(LESSONS.some((l) => l.padCount === 8)).toBe(true)
    expect(LESSONS.some((l) => l.padCount === 16)).toBe(true)
  })
})

describe('GUIDES', () => {
  it('loads the whole data directory', () => {
    expect(GUIDES.length).toBeGreaterThan(0)
  })

  it('has no duplicate ids', () => {
    const ids = GUIDES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('assigns every guide to a real course', () => {
    for (const g of GUIDES) expect(COURSE_IDS, g.id).toContain(g.course)
  })

  it('sorts by level, then title', () => {
    for (let i = 1; i < GUIDES.length; i++) {
      const prev = GUIDES[i - 1]
      const cur = GUIDES[i]
      const ordered =
        prev.level < cur.level ||
        (prev.level === cur.level && prev.title.localeCompare(cur.title) <= 0)
      expect(ordered, `${prev.id} before ${cur.id}`).toBe(true)
    }
  })

  it('gives every guide steps to walk through', () => {
    for (const g of GUIDES) expect(g.steps.length, g.id).toBeGreaterThanOrEqual(2)
  })

  it('does not collide with lesson ids — both are keyed into the same progress store', () => {
    const lessonIds = new Set(LESSONS.map((l) => l.id))
    for (const g of GUIDES) expect(lessonIds, g.id).not.toContain(g.id)
  })
})

describe('COURSES', () => {
  it('has unique ids', () => {
    expect(new Set(COURSE_IDS).size).toBe(COURSES.length)
  })

  it('gives every course a title and a blurb', () => {
    for (const c of COURSES) {
      expect(c.title, c.id).toBeTruthy()
      expect(c.blurb, c.id).toBeTruthy()
    }
  })

  it('has content in every course, so none renders empty', () => {
    // LessonBrowser hides empty courses, so an empty one is dead config.
    for (const c of COURSES) {
      const hasContent =
        LESSONS.some((l) => l.course === c.id) || GUIDES.some((g) => g.course === c.id)
      expect(hasContent, `course ${c.id} has no lessons or guides`).toBe(true)
    }
  })

  it('resolves a title for a known course', () => {
    expect(courseTitle(COURSES[0].id)).toBe(COURSES[0].title)
  })

  it('falls back to the raw id for an unknown course', () => {
    expect(courseTitle('not-a-course')).toBe('not-a-course')
  })
})
