import { describe, expect, it } from 'vitest'
import { personalBestTarget } from '../../src/lib/grooveTarget'
import type { PerformanceRun } from '../../src/store/history'

const run: PerformanceRun = {
  lessonId: 'first-taps', completedAt: '2026-09-08T12:00:00.000Z', tempoPct: 100,
  variant: 'standard', accuracy: 80, maxCombo: 10, misses: 2, total: 16,
}

describe('personal best challenge', () => {
  it('has no invented rival or target before a comparable performance exists', () => {
    expect(personalBestTarget([], run)).toBeNull()
    expect(personalBestTarget([
      { ...run, lessonId: 'another-groove' }, { ...run, tempoPct: 110 },
      { ...run, variant: 'fade' }, { ...run, total: 32 },
    ], run)).toBeNull()
  })

  it('asks for one point above the best comparable performance, not just the latest run', () => {
    expect(personalBestTarget([
      { ...run, accuracy: 92 }, { ...run, accuracy: 72 },
      { ...run, accuracy: 100, variant: 'tight' },
    ], run)).toEqual({ previousBest: 92, accuracy: 93 })
  })

  it('offers matching perfection rather than an impossible target', () => {
    expect(personalBestTarget([{ ...run, accuracy: 100 }], run)).toEqual({ previousBest: 100, accuracy: 100 })
  })

  it('keeps an existing target stable when the source history grows', () => {
    const history = [run]
    const target = personalBestTarget(history, run)
    history.push({ ...run, accuracy: 90 })
    expect(target).toEqual({ previousBest: 80, accuracy: 81 })
    expect(personalBestTarget(history, run)).toEqual({ previousBest: 90, accuracy: 91 })
  })
})
