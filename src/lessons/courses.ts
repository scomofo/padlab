import coursesData from './courses.json'

/** Curriculum structure: lessons are grouped into courses, shown in this order. */
export interface Course {
  id: string
  title: string
  blurb: string
}

export const COURSES: Course[] = coursesData

export const COURSE_IDS: string[] = COURSES.map((c) => c.id)

export function courseTitle(id: string): string {
  return COURSES.find((c) => c.id === id)?.title ?? id
}
