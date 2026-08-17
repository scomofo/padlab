import type { Guide } from './types'

const modules = import.meta.glob('./data/*.json', { eager: true }) as Record<
  string,
  { default: Guide }
>

function isUsable(g: Guide): boolean {
  return Boolean(g && g.id && g.course && Array.isArray(g.steps) && g.steps.length > 0)
}

const seen = new Set<string>()

export const GUIDES: Guide[] = Object.values(modules)
  .map((m) => m.default)
  .filter(isUsable)
  .filter((g) => {
    if (seen.has(g.id)) return false
    seen.add(g.id)
    return true
  })
  .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
