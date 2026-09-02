/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyRun, loadProfile, type Profile } from '../../src/store/profile'
import { todayKey, yesterdayKey } from '../../src/lib/dates'
import type { ScoreSummary } from '../../src/engine/scoring'

const KEY = 'padlab-profile-v1'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

function empty(): Profile {
  return loadProfile()
}

function summary(over: Partial<ScoreSummary> = {}): ScoreSummary {
  return {
    perfect: 8,
    great: 2,
    good: 0,
    miss: 0,
    stray: 0,
    total: 10,
    accuracy: 92,
    stars: 3,
    maxCombo: 10,
    ...over,
  }
}

describe('loadProfile', () => {
  it('starts empty', () => {
    const p = loadProfile()
    expect(p.xp).toBe(0)
    expect(p.streak).toBe(0)
    expect(p.badges).toEqual([])
    expect(p.week).toEqual({})
  })

  it('recovers from corrupt stored JSON instead of throwing', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadProfile().xp).toBe(0)
  })

  it('drops a daily challenge flag from a previous day', () => {
    localStorage.setItem(KEY, JSON.stringify({
      xp: 10,
      dailyChallengeDone: true,
      dailyChallengeDate: '1999-01-01',
      dailyXp: 80,
      dailyXpDate: '1999-01-01',
    }))
    const p = loadProfile()
    expect(p.dailyChallengeDone).toBe(false)
    expect(p.dailyXp).toBe(0)
  })
})

describe('applyRun', () => {
  it('awards XP, notes, and a session on a scored Perform', () => {
    const award = applyRun({
      profile: empty(),
      lessonId: 'first-taps',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: false,
      durationSec: 12.4,
      prevXp: 0,
    })
    expect(award.xpGained).toBeGreaterThan(0)
    expect(award.profile.xp).toBe(award.xpGained)
    expect(award.profile.sessions).toBe(1)
    expect(award.profile.notesHit).toBe(10)
    expect(award.profile.secondsPracticed).toBe(12)
    expect(award.profile.lastLessonId).toBe('first-taps')
    expect(loadProfile().xp).toBe(award.xpGained)
  })

  it('starts a streak on the first scored Perform of the day', () => {
    const award = applyRun({
      profile: empty(),
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })
    expect(award.streakGrew).toBe(true)
    expect(award.profile.streak).toBe(1)
    expect(award.profile.lastGoalDate).toBe(todayKey())
  })

  it('does not grow the streak twice in one day', () => {
    const first = applyRun({
      profile: empty(),
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })
    const second = applyRun({
      profile: first.profile,
      lessonId: 'b',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: false,
      durationSec: 8,
      prevXp: first.profile.xp,
    })
    expect(second.streakGrew).toBe(false)
    expect(second.profile.streak).toBe(1)
  })

  it('continues a streak from yesterday and resets after a gap', () => {
    const continued = applyRun({
      profile: { ...empty(), streak: 4, lastGoalDate: yesterdayKey() },
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: false,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })
    expect(continued.profile.streak).toBe(5)
    expect(continued.profile.longestStreak).toBe(5)

    const reset = applyRun({
      profile: { ...empty(), streak: 4, lastGoalDate: '1999-01-01' },
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: false,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })
    expect(reset.profile.streak).toBe(1)
  })

  it('does not start a streak on a practice step', () => {
    const award = applyRun({
      profile: empty(),
      lessonId: 'a',
      summary: summary({ stars: 0 }),
      scored: false,
      firstClear: false,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })
    expect(award.streakGrew).toBe(false)
    expect(award.profile.streak).toBe(0)
    expect(award.profile.lastGoalDate).toBeNull()
  })

  it('marks the daily groove only on a scored daily Perform', () => {
    const practice = applyRun({
      profile: empty(),
      lessonId: 'daily',
      summary: summary(),
      scored: false,
      firstClear: false,
      isDaily: true,
      durationSec: 8,
      prevXp: 0,
    })
    expect(practice.profile.dailyChallengeDone).toBe(false)

    const scored = applyRun({
      profile: practice.profile,
      lessonId: 'daily',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: true,
      durationSec: 8,
      prevXp: practice.profile.xp,
    })
    expect(scored.profile.dailyChallengeDone).toBe(true)
    expect(scored.xpGained).toBeGreaterThan(practice.xpGained)
  })

  it('unlocks first-star and three-star on a clean pass, once', () => {
    const first = applyRun({
      profile: empty(),
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })
    expect(first.newBadges).toEqual(expect.arrayContaining(['first-star', 'three-star']))
    const again = applyRun({
      profile: first.profile,
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: false,
      isDaily: false,
      durationSec: 8,
      prevXp: first.profile.xp,
    })
    expect(again.newBadges).not.toContain('first-star')
    expect(again.newBadges).not.toContain('three-star')
  })

  it('flags a rank-up when XP crosses Pocket', () => {
    const award = applyRun({
      profile: { ...empty(), xp: 240 },
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: true,
      durationSec: 8,
      prevXp: 240,
    })
    expect(award.profile.xp).toBeGreaterThanOrEqual(250)
    expect(award.rankedUp).toBe(true)
    expect(award.newBadges).toContain('pocket')
  })

  it('does not throw when storage rejects the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => applyRun({
      profile: empty(),
      lessonId: 'a',
      summary: summary(),
      scored: true,
      firstClear: true,
      isDaily: false,
      durationSec: 8,
      prevXp: 0,
    })).not.toThrow()
  })
})
