import type { Lesson } from '../engine/types'

const modules = import.meta.glob('./data/*.json', { eager: true }) as Record<
  string,
  { default: Lesson }
>

function isUsable(l: Lesson): boolean {
  return Boolean(
    l &&
      l.id &&
      Array.isArray(l.events) &&
      l.events.length > 0 &&
      Array.isArray(l.steps) &&
      l.steps.length > 0 &&
      (l.padCount === 8 || l.padCount === 16),
  )
}

const seen = new Set<string>()

export const LESSONS: Lesson[] = Object.values(modules)
  .map((m) => m.default)
  .filter(isUsable)
  .filter((l) => {
    if (seen.has(l.id)) return false
    seen.add(l.id)
    return true
  })
  .sort((a, b) => a.level - b.level || a.padCount - b.padCount || a.title.localeCompare(b.title))
