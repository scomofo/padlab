// Progress aggregation for the lesson browser, kept pure so it can be tested
// without rendering the component.
import type { Lesson, LessonProgress } from '../engine/types'
import type { Guide } from '../guides/types'
import type { GuideProgress } from '../store/progress'

export interface CourseProgressSummary {
  done: number
  total: number
  /** 0-100, for the progress bar. */
  pct: number
  /** Counter label: "mastered" for lesson-only courses, "complete" otherwise. */
  noun: 'complete' | 'mastered'
}

/**
 * A lesson counts once mastered (3 stars); a guide once completed. A course
 * may hold both — the bar spans everything in it, so adding a guide to a
 * lesson course cannot silently drop the lessons from the count.
 */
export function courseProgress(
  lessons: Lesson[],
  guides: Guide[],
  progress: Record<string, LessonProgress>,
  guideProgress: Record<string, GuideProgress>,
): CourseProgressSummary {
  const done =
    lessons.filter((l) => (progress[l.id]?.stars ?? 0) >= 3).length +
    guides.filter((g) => guideProgress[g.id]?.completed).length
  const total = lessons.length + guides.length
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    noun: guides.length ? 'complete' : 'mastered',
  }
}

/** Stars earned across the library, out of `lessons.length * 3`. */
export function totalStars(lessons: Lesson[], progress: Record<string, LessonProgress>): number {
  return lessons.reduce((sum, l) => sum + (progress[l.id]?.stars ?? 0), 0)
}

/** Lessons with at least one star. */
export function startedCount(lessons: Lesson[], progress: Record<string, LessonProgress>): number {
  return lessons.filter((l) => (progress[l.id]?.stars ?? 0) > 0).length
}
