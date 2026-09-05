/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAILY_XP_GOAL, MAX_FREEZES, applyRun, dailyGoalMet, displayStreak, loadProfile, streakStatus, type Profile,
} from '../../src/store/profile'
import { daysAgoKey, todayKey, yesterdayKey } from '../../src/lib/dates'
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
    deltas: [],
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
      dailyBonusXp: 0,
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
      dailyBonusXp: 0,
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
      dailyBonusXp: 0,
      durationSec: 8,
      prevXp: 0,
    })
    const second = applyRun({
      profile: first.profile,
      lessonId: 'b',
      summary: summary(),
      scored: true,
      firstClear: true,
      dailyBonusXp: 0,
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
      dailyBonusXp: 0,
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
      dailyBonusXp: 0,
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
      dailyBonusXp: 0,
      durationSec: 8,
      prevXp: 0,
    })
    expect(award.streakGrew).toBe(false)
    expect(award.profile.streak).toBe(0)
    expect(award.profile.lastGoalDate).toBeNull()
  })

  it.each([true, false])('gives no rewards or session credit without landed notes (scored: %s)', (scored) => {
    const profile = {
      ...empty(), xp: 240, streak: 6, lastGoalDate: daysAgoKey(2), freezes: 1,
      dailyXp: 140, dailyXpDate: todayKey(), dailyChallengeDate: todayKey(),
    }
    for (const missed of [
      summary({ perfect: 0, great: 0, good: 0, miss: 10, accuracy: 0, stars: 0, maxCombo: 0 }),
      summary({ perfect: 0, great: 0, good: 0, miss: 10, stray: 20, accuracy: 0, stars: 0, maxCombo: 0 }),
      summary({ perfect: 0, great: 0, good: 0, miss: 0, total: 0, accuracy: 0, stars: 0, maxCombo: 0 }),
    ]) {
      const award = applyRun({
        profile, lessonId: 'idle', summary: missed, scored, firstClear: true,
        dailyBonusXp: 90, newRung: 120, durationSec: 60, prevXp: profile.xp,
      })
      expect(award).toEqual({
        profile, xpGained: 0, streakGrew: false, newBadges: [], rankedUp: false,
        dailyGoalHit: false, freezeUsed: false, freezesEarned: 0, dailyCleared: false,
      })
      expect(loadProfile()).toEqual(profile)
    }
  })

  it('resets stale daily fields even when a run lands no notes', () => {
    const profile = {
      ...empty(), xp: 300, dailyXp: 200, dailyXpDate: yesterdayKey(),
      dailyChallengeDone: true, dailyChallengeDate: yesterdayKey(),
    }
    const award = applyRun({
      profile, lessonId: 'idle',
      summary: summary({ perfect: 0, great: 0, miss: 10, accuracy: 0, stars: 0, maxCombo: 0 }),
      scored: true, firstClear: true, dailyBonusXp: 60, durationSec: 60, prevXp: profile.xp,
    })
    expect(award.profile).toEqual({
      ...profile, dailyXp: 0, dailyXpDate: todayKey(),
      dailyChallengeDone: false, dailyChallengeDate: todayKey(),
    })
    expect(award.xpGained).toBe(0)
    expect(award.dailyCleared).toBe(false)
    expect(loadProfile()).toEqual(award.profile)
    expect(profile.dailyChallengeDone).toBe(true)
  })

  it('requires a scored star before paying a claimed first-clear bonus', () => {
    const run = (scored: boolean, stars: ScoreSummary['stars'], firstClear: boolean) => applyRun({
      profile: empty(), lessonId: 'a',
      summary: summary({ perfect: 1, great: 0, miss: 9, accuracy: 10, stars, maxCombo: 1 }),
      scored, firstClear, dailyBonusXp: 0, durationSec: 8, prevXp: 0,
    })
    expect(run(true, 0, true).xpGained).toBe(run(true, 0, false).xpGained)
    expect(run(false, 3, true).xpGained).toBe(run(false, 3, false).xpGained)
    expect(run(true, 1, true).xpGained - run(true, 1, false).xpGained).toBe(40)
  })

  it('keeps practice XP without unlocking performance star or combo badges', () => {
    const clean = summary({ perfect: 32, great: 0, total: 32, accuracy: 100, maxCombo: 32 })
    const practice = applyRun({
      profile: empty(), lessonId: 'a', summary: clean, scored: false,
      firstClear: true, dailyBonusXp: 0, durationSec: 20, prevXp: 0,
    })
    expect(practice.xpGained).toBeGreaterThan(0)
    expect(practice.profile.sessions).toBe(1)
    expect(practice.profile.notesHit).toBe(32)
    expect(practice.newBadges).toEqual([])
    const perform = applyRun({
      profile: practice.profile, lessonId: 'a', summary: clean, scored: true,
      firstClear: true, dailyBonusXp: 0, durationSec: 20, prevXp: practice.profile.xp,
    })
    expect(perform.newBadges).toEqual(expect.arrayContaining(['first-star', 'three-star', 'combo-16', 'combo-32']))
  })

  it('marks the daily groove only on a scored daily Perform', () => {
    const practice = applyRun({
      profile: empty(),
      lessonId: 'daily',
      summary: summary(),
      scored: false,
      firstClear: false,
      dailyBonusXp: 60,
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
      dailyBonusXp: 60,
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
      dailyBonusXp: 0,
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
      dailyBonusXp: 0,
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
      dailyBonusXp: 60,
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
      dailyBonusXp: 0,
      durationSec: 8,
      prevXp: 0,
    })).not.toThrow()
  })
})

describe('streak freezes', () => {
  const run = (profile: Profile, over: Partial<Parameters<typeof applyRun>[0]> = {}) =>
    applyRun({
      profile, lessonId: 'a', summary: summary(), scored: true, firstClear: false,
      dailyBonusXp: 0, durationSec: 8, prevXp: profile.xp, ...over,
    })

  it('earns a freeze when the streak reaches 7, once', () => {
    const six = { ...empty(), streak: 6, lastGoalDate: yesterdayKey() }
    const a = run(six)
    expect(a.profile.streak).toBe(7)
    expect(a.profile.freezes).toBe(1)
    expect(a.freezesEarned).toBe(1)
    // Reaching 7 again after a reset does not pay out a second freeze.
    const again = run({ ...a.profile, streak: 6, lastGoalDate: yesterdayKey() })
    expect(again.profile.freezes).toBe(1)
    expect(again.freezesEarned).toBe(0)
  })

  it('caps stored freezes at MAX_FREEZES', () => {
    const p = { ...empty(), streak: 20, lastGoalDate: yesterdayKey(), freezes: MAX_FREEZES, freezesEarned: 2 }
    const a = run(p)
    expect(a.profile.streak).toBe(21)
    expect(a.profile.freezes).toBe(MAX_FREEZES)
    expect(a.profile.freezesEarned).toBe(3)
    expect(a.freezesEarned).toBe(0)
  })

  it('bridges exactly one missed day with a freeze', () => {
    const p = { ...empty(), streak: 9, lastGoalDate: daysAgoKey(2), freezes: 1, freezesEarned: 1 }
    const a = run(p)
    expect(a.freezeUsed).toBe(true)
    expect(a.profile.streak).toBe(10)
    expect(a.profile.freezes).toBe(0)
  })

  it('does not bridge without a freeze, or across two missed days', () => {
    const noFreeze = run({ ...empty(), streak: 9, lastGoalDate: daysAgoKey(2), freezes: 0 })
    expect(noFreeze.freezeUsed).toBe(false)
    expect(noFreeze.profile.streak).toBe(1)
    const twoDays = run({ ...empty(), streak: 9, lastGoalDate: daysAgoKey(3), freezes: 2, freezesEarned: 2 })
    expect(twoDays.freezeUsed).toBe(false)
    expect(twoDays.profile.streak).toBe(1)
    expect(twoDays.profile.freezes).toBe(2)
  })

  it('never spends a freeze on a practice step', () => {
    const p = { ...empty(), streak: 9, lastGoalDate: daysAgoKey(2), freezes: 1, freezesEarned: 1 }
    const a = run(p, { scored: false })
    expect(a.freezeUsed).toBe(false)
    expect(a.profile.freezes).toBe(1)
    expect(a.profile.streak).toBe(9)
  })

  it('loads freezes clamped to the cap', () => {
    localStorage.setItem(KEY, JSON.stringify({ freezes: 99, freezesEarned: 3 }))
    expect(loadProfile().freezes).toBe(MAX_FREEZES)
    expect(loadProfile().freezesEarned).toBe(3)
  })
})

describe('streakStatus / displayStreak', () => {
  it('reports each state from lastGoalDate and freezes', () => {
    expect(streakStatus(empty())).toBe('none')
    expect(streakStatus({ ...empty(), streak: 3, lastGoalDate: todayKey() })).toBe('safe')
    expect(streakStatus({ ...empty(), streak: 3, lastGoalDate: yesterdayKey() })).toBe('at-risk')
    expect(streakStatus({ ...empty(), streak: 3, lastGoalDate: daysAgoKey(2), freezes: 1 })).toBe('frozen')
    expect(streakStatus({ ...empty(), streak: 3, lastGoalDate: daysAgoKey(2), freezes: 0 })).toBe('broken')
    expect(streakStatus({ ...empty(), streak: 3, lastGoalDate: daysAgoKey(3), freezes: 2 })).toBe('broken')
  })

  it('shows 0 for a streak that is beyond saving', () => {
    expect(displayStreak({ ...empty(), streak: 5, lastGoalDate: daysAgoKey(4) })).toBe(0)
    expect(displayStreak({ ...empty(), streak: 5, lastGoalDate: yesterdayKey() })).toBe(5)
    expect(displayStreak({ ...empty(), streak: 5, lastGoalDate: daysAgoKey(2), freezes: 1 })).toBe(5)
  })
})

describe('daily XP goal', () => {
  it('flags the run that crosses the goal, and only that run', () => {
    let p = empty()
    let crossed = 0
    for (let i = 0; i < 6; i++) {
      const a = applyRun({
        profile: p, lessonId: 'a', summary: summary(), scored: true, firstClear: false,
        dailyBonusXp: 0, durationSec: 8, prevXp: p.xp,
      })
      if (a.dailyGoalHit) {
        crossed++
        expect(a.profile.dailyXp).toBeGreaterThanOrEqual(DAILY_XP_GOAL)
        expect(a.profile.dailyXp - a.xpGained).toBeLessThan(DAILY_XP_GOAL)
      }
      p = a.profile
    }
    expect(p.dailyXp).toBeGreaterThanOrEqual(DAILY_XP_GOAL)
    expect(crossed).toBe(1)
    expect(dailyGoalMet(p)).toBe(true)
  })

  it('is not met on a fresh day even with stale XP stored', () => {
    localStorage.setItem(KEY, JSON.stringify({ dailyXp: 500, dailyXpDate: '1999-01-01' }))
    expect(dailyGoalMet(loadProfile())).toBe(false)
  })
})

describe('daily bonus', () => {
  const run = (profile: Profile, dailyBonusXp: number, scored = true) =>
    applyRun({
      profile, lessonId: 'd', summary: summary(), scored, firstClear: false,
      dailyBonusXp, durationSec: 8, prevXp: profile.xp,
    })

  it('pays the modifier bonus once per day and reports the clear', () => {
    const first = run(empty(), 90)
    const plain = run(empty(), 0)
    expect(first.dailyCleared).toBe(true)
    expect(first.xpGained - plain.xpGained).toBe(90)
    const again = run(first.profile, 90)
    expect(again.dailyCleared).toBe(true)
    expect(again.xpGained).toBe(plain.xpGained)
    expect(again.profile.dailyChallengeDone).toBe(true)
  })

  it('does not clear or pay on a practice step', () => {
    const a = run(empty(), 90, false)
    expect(a.dailyCleared).toBe(false)
    expect(a.profile.dailyChallengeDone).toBe(false)
  })

  it('normalizes yesterday’s daily credit before an ordinary run and pays today’s bonus once', () => {
    const previousDay = {
      ...empty(), xp: 500, dailyXp: 500, dailyXpDate: yesterdayKey(),
      dailyChallengeDone: true, dailyChallengeDate: yesterdayKey(),
    }
    const ordinary = run(previousDay, 0)
    expect(ordinary.profile.dailyXp).toBe(ordinary.xpGained)
    expect(ordinary.profile.dailyXpDate).toBe(todayKey())
    expect(ordinary.profile.dailyChallengeDone).toBe(false)
    expect(ordinary.profile.dailyChallengeDate).toBe(todayKey())
    const daily = run(ordinary.profile, 90)
    const repeat = run(daily.profile, 90)
    expect(daily.profile.dailyChallengeDone).toBe(true)
    expect(daily.xpGained - repeat.xpGained).toBe(90)
  })
})

describe('tempo ladder badges', () => {
  it('unlocks Up the ladder on the first rung and Full speed at 120', () => {
    const first = applyRun({
      profile: empty(), lessonId: 'a', summary: summary(), scored: true, firstClear: false,
      dailyBonusXp: 0, tempoPct: 105, newRung: 105, durationSec: 8, prevXp: 0,
    })
    expect(first.newBadges).toContain('ladder-first')
    expect(first.newBadges).not.toContain('ladder-120')
    const top = applyRun({
      profile: first.profile, lessonId: 'a', summary: summary(), scored: true, firstClear: false,
      dailyBonusXp: 0, tempoPct: 120, newRung: 120, durationSec: 8, prevXp: first.profile.xp,
    })
    expect(top.newBadges).toEqual(['ladder-120'])
    expect(top.xpGained).toBeGreaterThan(first.xpGained)
  })
})
