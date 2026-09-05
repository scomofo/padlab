import { describe, expect, it } from 'vitest'
import { RANKS, rankForXp, xpForRun } from '../../src/lib/ranks'

describe('rankForXp', () => {
  it('starts at Rookie', () => {
    const r = rankForXp(0)
    expect(r.current.id).toBe('rookie')
    expect(r.next?.id).toBe('pocket')
    expect(r.into).toBe(0)
  })

  it('crosses Pocket at 250', () => {
    expect(rankForXp(249).current.id).toBe('rookie')
    expect(rankForXp(250).current.id).toBe('pocket')
  })

  it('fills the bar between ranks', () => {
    const r = rankForXp(250 + (800 - 250) / 2)
    expect(r.current.id).toBe('pocket')
    expect(r.into).toBeCloseTo(0.5, 5)
  })

  it('caps at Legend with a full bar', () => {
    const r = rankForXp(RANKS[RANKS.length - 1].xp + 500)
    expect(r.current.id).toBe('legend')
    expect(r.next).toBeNull()
    expect(r.into).toBe(1)
  })
})

describe('xpForRun', () => {
  it('pays a small consolation for practice steps so they still feel like play', () => {
    expect(xpForRun({ accuracy: 80, stars: 0, maxCombo: 4, scored: false, firstClear: false, dailyBonus: 0 })).toBe(10)
  })

  it('never pays less than 4 XP on an unscored run', () => {
    expect(xpForRun({ accuracy: 0, stars: 0, maxCombo: 0, scored: false, firstClear: false, dailyBonus: 0 })).toBe(4)
  })

  it('adds first-clear and daily bonuses only on scored Perform', () => {
    const base = xpForRun({ accuracy: 90, stars: 3, maxCombo: 8, scored: true, firstClear: false, dailyBonus: 0 })
    const first = xpForRun({ accuracy: 90, stars: 3, maxCombo: 8, scored: true, firstClear: true, dailyBonus: 0 })
    const daily = xpForRun({ accuracy: 90, stars: 3, maxCombo: 8, scored: true, firstClear: false, dailyBonus: 60 })
    expect(first - base).toBe(40)
    expect(daily - base).toBe(60)
  })

  it('ignores first-clear and daily bonuses on practice steps', () => {
    const a = xpForRun({ accuracy: 90, stars: 3, maxCombo: 8, scored: false, firstClear: true, dailyBonus: 60 })
    const b = xpForRun({ accuracy: 90, stars: 3, maxCombo: 8, scored: false, firstClear: false, dailyBonus: 0 })
    expect(a).toBe(b)
  })
})
