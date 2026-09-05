import { describe, expect, it } from 'vitest'
import { LADDER_RUNGS, bestRung, ladderUnlocked, nextRung, rungCleared, tempoChoices } from '../../src/lib/ladder'
import type { LessonProgress } from '../../src/engine/types'

const P = (over: Partial<LessonProgress> = {}): LessonProgress => ({ stars: 3, bestAccuracy: 95, ...over })

describe('ladder state', () => {
  it('unlocks at 3 stars only', () => {
    expect(ladderUnlocked(undefined)).toBe(false)
    expect(ladderUnlocked(P({ stars: 2 }))).toBe(false)
    expect(ladderUnlocked(P())).toBe(true)
  })

  it('walks rungs from the best cleared', () => {
    expect(nextRung(P({ stars: 2 }))).toBeNull()
    expect(nextRung(P())).toBe(105)
    expect(nextRung(P({ bestTempoPct: 110 }))).toBe(115)
    expect(nextRung(P({ bestTempoPct: 120 }))).toBeNull()
    expect(bestRung(undefined)).toBe(100)
  })
})

describe('rungCleared', () => {
  const perform = { isLastStep: true, stars: 3 }

  it('needs Perform, 3 stars, and a tempo at or above a new rung', () => {
    expect(rungCleared(P(), { ...perform, isLastStep: false, tempoPct: 110 })).toBeNull()
    expect(rungCleared(P(), { ...perform, stars: 2, tempoPct: 110 })).toBeNull()
    expect(rungCleared(P(), { ...perform, tempoPct: 100 })).toBeNull()
    expect(rungCleared(P(), { ...perform, tempoPct: 110 })).toBe(110)
    expect(rungCleared(P({ bestTempoPct: 110 }), { ...perform, tempoPct: 110 })).toBeNull()
    expect(rungCleared(P({ bestTempoPct: 110 }), { ...perform, tempoPct: 120 })).toBe(120)
  })

  it('does not credit an unmastered lesson from a slow run, but does from a fast 3-star run', () => {
    expect(rungCleared(P({ stars: 1 }), { ...perform, tempoPct: 90 })).toBeNull()
    expect(rungCleared(undefined, { ...perform, tempoPct: 105 })).toBe(105)
  })
})

describe('tempoChoices', () => {
  const base = [100, 90, 80]
  it('adds rungs, fastest first, only once unlocked', () => {
    expect(tempoChoices(P({ stars: 2 }), base)).toEqual(base)
    expect(tempoChoices(P(), base)).toEqual([...[...LADDER_RUNGS].reverse(), 100, 90, 80])
  })
  it('does not duplicate a rung already in the base list', () => {
    expect(tempoChoices(P(), [110, 100])).toEqual([120, 115, 105, 110, 100])
  })
})
