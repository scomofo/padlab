import type { Lesson, LessonProgress } from '../engine/types'
import { todayKey } from './dates'

/** Next lesson that still wants stars, preferring the current course. */
export function recommendLesson(
  lessons: Lesson[],
  progress: Record<string, LessonProgress>,
  lastId: string | null,
): Lesson {
  if (lastId) {
    const last = lessons.find((l) => l.id === lastId)
    if (last && (progress[last.id]?.stars ?? 0) < 3) return last
    if (last) {
      const same = lessons.filter((l) => l.course === last.course)
      const idx = same.findIndex((l) => l.id === last.id)
      const next = same.slice(idx + 1).find((l) => (progress[l.id]?.stars ?? 0) < 3)
      if (next) return next
    }
  }
  return lessons.find((l) => (progress[l.id]?.stars ?? 0) < 3) ?? lessons[0]
}

export function nextInCourse(
  lessons: Lesson[],
  current: Lesson,
  progress: Record<string, LessonProgress>,
): Lesson | null {
  const same = lessons.filter((l) => l.course === current.course)
  const idx = same.findIndex((l) => l.id === current.id)
  if (idx < 0) return null
  return same.slice(idx + 1).find((l) => (progress[l.id]?.stars ?? 0) < 3) ?? same[idx + 1] ?? null
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * One lesson a day, drawn from the player's current difficulty band so the
 * challenge is a stretch rather than a random level-6 chart on day one.
 */
export function dailyLesson(lessons: Lesson[], progress: Record<string, LessonProgress>): Lesson {
  const started = lessons.filter((l) => (progress[l.id]?.stars ?? 0) > 0)
  const cap = started.length ? Math.max(...started.map((l) => l.level)) + 1 : 2
  const pool = lessons.filter((l) => l.level <= cap)
  if (pool.length === 0) return lessons[0]
  const i = hash(todayKey() + ':padlab') % pool.length
  return pool[i] ?? lessons[0]
}

/** Oldest → today: whether that local day had any saved session. */
export function weekDots(week: Record<string, number>, today = new Date()): boolean[] {
  const dots: boolean[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dots.push((week[todayKey(d)] ?? 0) > 0)
  }
  return dots
}
