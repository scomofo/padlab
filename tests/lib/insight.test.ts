import { describe, expect, it } from 'vitest'
import { nearMissHook, timingBuckets, timingLean } from '../../src/lib/insight'
import type { ScoreSummary } from '../../src/engine/scoring'

function summary(over: Partial<ScoreSummary> = {}): ScoreSummary {
  return {
    perfect: 8, great: 2, good: 0, miss: 0, stray: 0, total: 10,
    accuracy: 92, stars: 3, maxCombo: 10, deltas: [],
    ...over,
  }
}

describe('timingBuckets', () => {
  it('splits by the perfect and great windows, signed', () => {
    const b = timingBuckets([-120, -60, -10, 0, 40, 70, 100])
    expect(b.map((x) => [x.id, x.count])).toEqual([
      ['early-miss', 1], ['early', 1], ['on', 3], ['late', 1], ['late-miss', 1],
    ])
  })
  it('is all zeros with no hits', () => {
    expect(timingBuckets([]).every((b) => b.count === 0)).toBe(true)
  })
})

describe('timingLean', () => {
  it('needs a few hits and a clear one-sided mean', () => {
    expect(timingLean([]).direction).toBeNull()
    expect(timingLean([-40, -40, -40]).direction).toBeNull()
    expect(timingLean([-40, -40, -40, -40]).direction).toBe('early')
    expect(timingLean([30, 20, 25, 35]).direction).toBe('late')
    expect(timingLean([30, -30, 30, -30]).direction).toBeNull()
    expect(timingLean([5, 5, 5, 5]).direction).toBeNull()
  })
})

describe('nearMissHook', () => {
  it('names the next star and how many notes to land when misses explain the gap', () => {
    const s = summary({ accuracy: 86, stars: 2, perfect: 8, great: 0, miss: 2, deltas: [0, 0, 0, 0, 0, 0, 0, 0] })
    expect(nearMissHook(s)).toBe('4% from 3 stars — land 1 more note')
  })

  it('points at greats when there are no misses to fix', () => {
    const s = summary({ accuracy: 88, stars: 2, perfect: 2, great: 8, miss: 0, deltas: [60, 60, 60, 60, 60, 60, 60, 60, 0, 0] })
    expect(nearMissHook(s)).toMatch(/^2% from 3 stars — tighten/)
  })

  it('falls back to the timing lean when the star gap is wide', () => {
    const s = summary({ accuracy: 60, stars: 1, miss: 4, deltas: [-70, -80, -60, -75, -70, -65] })
    expect(nearMissHook(s)).toMatch(/Leaning early by 70 ms/)
  })

  it('pushes a clean run toward all perfects', () => {
    const s = summary({ accuracy: 97, stars: 3, perfect: 8, great: 2, deltas: [0, 0, 0, 0, 0, 0, 0, 0, 10, 10] })
    expect(nearMissHook(s)).toBe('Clean — 2 to go for all perfects')
  })

  it('has nothing to say about a flawless run', () => {
    const s = summary({ accuracy: 100, stars: 3, perfect: 10, great: 0, deltas: Array(10).fill(0) })
    expect(nearMissHook(s)).toBeNull()
  })
})
