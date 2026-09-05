/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparableRuns, HISTORY_LIMIT, loadHistory, savePerformance, type PerformanceRun } from '../../src/store/history'

function run(over: Partial<PerformanceRun> = {}): PerformanceRun {
  return { lessonId: 'first-taps', completedAt: '2026-09-05T10:00:00.000Z', tempoPct: 100,
    variant: 'standard', accuracy: 75, maxCombo: 12, misses: 4, total: 16, ...over }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('performance history', () => {
  it('starts empty for old profiles, broken JSON and invalid shapes', () => {
    localStorage.setItem('padlab-progress-v1', JSON.stringify({ 'first-taps': { stars: 3, bestAccuracy: 100 } }))
    expect(loadHistory()).toEqual([])
    for (const raw of ['{oops', 'null', '{}', '42']) {
      localStorage.setItem('padlab-history-v1', raw)
      expect(loadHistory()).toEqual([])
    }
  })

  it('drops unusable records instead of letting them become replay targets', () => {
    localStorage.setItem('padlab-history-v1', JSON.stringify([
      run(), null, [], run({ tempoPct: 80 }), run({ tempoPct: 101 }), run({ accuracy: 101 }), run({ total: 0 }),
      run({ completedAt: 'not a date' }), run({ maxCombo: 17 }), run({ misses: -1 }),
      { ...run(), variant: 'unknown' }, { ...run(), accuracy: '90' },
    ]))
    expect(loadHistory()).toEqual([run()])
  })

  it('bounds storage to the latest 60 records and preserves chronological replay order', () => {
    const runs = Array.from({ length: HISTORY_LIMIT + 4 }, (_, i) => run({ completedAt: new Date(1_700_000_000_000 + i * 1000).toISOString() }))
    const next = savePerformance(runs.at(-1)!, runs.slice(0, -1).reverse())
    expect(next).toEqual(runs.slice(4))
    expect(loadHistory()).toEqual(next)
  })

  it('separates other lessons, tempos, twist rules and changed note counts', () => {
    const reference = run()
    const previous = run({ accuracy: 60 })
    const mixed = [previous, run({ lessonId: 'backbeat' }), run({ tempoPct: 110 }),
      run({ variant: 'fade' }), run({ total: 32 }), reference]
    expect(comparableRuns(mixed, reference)).toEqual([previous, reference])
  })

  it('keeps current-visit history usable when persistence is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const next = savePerformance(run(), [])
    expect(next).toEqual([run()])
    expect(savePerformance(run({ accuracy: 90 }), next)).toHaveLength(2)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(loadHistory()).toEqual([])
  })
})
