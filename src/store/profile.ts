import { daysAgoKey, todayKey, yesterdayKey } from '../lib/dates'
import { RANKS, xpForRun } from '../lib/ranks'
import type { ScoreSummary } from '../engine/scoring'

const KEY = 'padlab-profile-v1'

export interface Profile {
  xp: number
  streak: number
  longestStreak: number
  /** Local YYYY-MM-DD of last scored Perform that counted toward the daily goal. */
  lastGoalDate: string | null
  lastLessonId: string | null
  notesHit: number
  sessions: number
  secondsPracticed: number
  dailyXp: number
  dailyXpDate: string | null
  dailyChallengeDone: boolean
  dailyChallengeDate: string | null
  badges: string[]
  week: Record<string, number>
  /** Unused streak freezes. One is earned every FREEZE_EVERY_DAYS of streak. */
  freezes: number
  /** Total freezes ever earned, so the same milestone cannot pay out twice. */
  freezesEarned: number
}

/** Daily XP target shown as a ring on the home screen and on results. */
export const DAILY_XP_GOAL = 150
/** A streak freeze is earned each time the streak crosses a multiple of this. */
export const FREEZE_EVERY_DAYS = 7
export const MAX_FREEZES = 2

const EMPTY: Profile = {
  xp: 0,
  streak: 0,
  longestStreak: 0,
  lastGoalDate: null,
  lastLessonId: null,
  notesHit: 0,
  sessions: 0,
  secondsPracticed: 0,
  dailyXp: 0,
  dailyXpDate: null,
  dailyChallengeDone: false,
  dailyChallengeDate: null,
  badges: [],
  week: {},
  freezes: 0,
  freezesEarned: 0,
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // storage unavailable — profile just won't persist
  }
}

function numberOr(v: unknown, fb: number, min = 0, max = 1e12): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fb
  return Math.max(min, Math.min(max, v))
}

export function loadProfile(): Profile {
  const stored = readRaw()
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { ...EMPTY, week: {}, badges: [] }
  }
  const s = stored as Record<string, unknown>
  const today = todayKey()
  const dailyXpDate = typeof s.dailyXpDate === 'string' ? s.dailyXpDate : null
  const challengeDate = typeof s.dailyChallengeDate === 'string' ? s.dailyChallengeDate : null
  const week: Record<string, number> = {}
  if (s.week && typeof s.week === 'object' && !Array.isArray(s.week)) {
    for (const [k, v] of Object.entries(s.week as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) {
        week[k] = v
      }
    }
  }
  return {
    xp: Math.round(numberOr(s.xp, 0)),
    streak: Math.round(numberOr(s.streak, 0, 0, 10_000)),
    longestStreak: Math.round(numberOr(s.longestStreak, 0, 0, 10_000)),
    lastGoalDate: typeof s.lastGoalDate === 'string' ? s.lastGoalDate : null,
    lastLessonId: typeof s.lastLessonId === 'string' ? s.lastLessonId : null,
    notesHit: Math.round(numberOr(s.notesHit, 0)),
    sessions: Math.round(numberOr(s.sessions, 0)),
    secondsPracticed: Math.round(numberOr(s.secondsPracticed, 0)),
    dailyXp: dailyXpDate === today ? Math.round(numberOr(s.dailyXp, 0)) : 0,
    dailyXpDate: dailyXpDate === today ? dailyXpDate : today,
    dailyChallengeDone: challengeDate === today && s.dailyChallengeDone === true,
    dailyChallengeDate: challengeDate === today ? challengeDate : today,
    badges: Array.isArray(s.badges) ? s.badges.filter((b): b is string => typeof b === 'string') : [],
    week,
    freezes: Math.round(numberOr(s.freezes, 0, 0, MAX_FREEZES)),
    freezesEarned: Math.round(numberOr(s.freezesEarned, 0, 0, 10_000)),
  }
}

export function saveProfile(p: Profile): void {
  write(p)
}

export function goalMetToday(p: Profile): boolean {
  return p.lastGoalDate === todayKey()
}

export function dailyGoalMet(p: Profile): boolean {
  return p.dailyXpDate === todayKey() && p.dailyXp >= DAILY_XP_GOAL
}

export type StreakStatus =
  /** Scored a Perform today; the streak is safe. */
  | 'safe'
  /** Streak is alive from yesterday but nothing scored yet today. */
  | 'at-risk'
  /** Missed exactly one day and a freeze will bridge the gap on the next Perform. */
  | 'frozen'
  /** Gap too long (or no freeze); the shown streak will reset on the next Perform. */
  | 'broken'
  /** Never scored. */
  | 'none'

/**
 * How the stored streak relates to today. The stored number is only rewritten
 * on a Perform, so the home screen uses this to avoid showing a dead streak as
 * alive — and to warn when it is about to die.
 */
export function streakStatus(p: Profile, now = new Date()): StreakStatus {
  if (!p.lastGoalDate || p.streak === 0) return 'none'
  if (p.lastGoalDate === todayKey(now)) return 'safe'
  if (p.lastGoalDate === yesterdayKey(now)) return 'at-risk'
  if (p.lastGoalDate === daysAgoKey(2, now) && p.freezes > 0) return 'frozen'
  return 'broken'
}

/** The streak a player should be shown: 0 once it is beyond saving. */
export function displayStreak(p: Profile, now = new Date()): number {
  return streakStatus(p, now) === 'broken' ? 0 : p.streak
}

export interface RunAward {
  profile: Profile
  xpGained: number
  streakGrew: boolean
  newBadges: string[]
  rankedUp: boolean
  /** This run pushed today's XP across DAILY_XP_GOAL. */
  dailyGoalHit: boolean
  /** A stored freeze was spent to bridge yesterday's missed day. */
  freezeUsed: boolean
  /** Freezes earned by this run (0 or 1). */
  freezesEarned: number
  /** This run cleared today's daily groove (bonus paid unless already cleared today). */
  dailyCleared: boolean
}

function unlock(p: Profile, id: string, fresh: string[]): void {
  if (p.badges.includes(id)) return
  p.badges = [...p.badges, id]
  fresh.push(id)
}

export function applyRun(opts: {
  profile: Profile
  lessonId: string
  summary: ScoreSummary
  scored: boolean
  firstClear: boolean
  /**
   * XP for clearing today's daily groove with this run (0 = not a clearing
   * run). Paid once per day: a second clear the same day earns nothing extra.
   */
  dailyBonusXp: number
  /** Tempo percent the run was played at (default 100). */
  tempoPct?: number
  /** Tempo-ladder rung newly cleared by this run, if any. */
  newRung?: number | null
  durationSec: number
  prevXp: number
}): RunAward {
  const today = todayKey()
  const p: Profile = {
    ...opts.profile,
    badges: [...opts.profile.badges],
    week: { ...opts.profile.week },
  }
  const alreadyCleared = p.dailyChallengeDone && p.dailyChallengeDate === today
  const dailyClear = opts.scored && opts.dailyBonusXp > 0
  const xpGained = xpForRun({
    accuracy: opts.summary.accuracy,
    stars: opts.summary.stars,
    maxCombo: opts.summary.maxCombo,
    scored: opts.scored,
    firstClear: opts.firstClear,
    dailyBonus: dailyClear && !alreadyCleared ? opts.dailyBonusXp : 0,
    tempoPct: opts.tempoPct ?? 100,
    newRung: Boolean(opts.newRung),
  })
  p.xp += xpGained
  p.notesHit += opts.summary.perfect + opts.summary.great + opts.summary.good
  p.sessions += 1
  p.secondsPracticed += Math.max(0, Math.round(opts.durationSec))
  p.lastLessonId = opts.lessonId
  if (p.dailyXpDate !== today) {
    p.dailyXp = 0
    p.dailyXpDate = today
  }
  const goalBefore = p.dailyXp >= DAILY_XP_GOAL
  p.dailyXp += xpGained
  const dailyGoalHit = !goalBefore && p.dailyXp >= DAILY_XP_GOAL
  p.week[today] = (p.week[today] ?? 0) + 1

  let streakGrew = false
  let freezeUsed = false
  let freezesEarned = 0
  if (opts.scored && p.lastGoalDate !== today) {
    if (p.lastGoalDate === yesterdayKey()) {
      p.streak += 1
    } else if (p.lastGoalDate === daysAgoKey(2) && p.freezes > 0) {
      // One missed day, bridged by a freeze: the streak survives and grows.
      p.freezes -= 1
      freezeUsed = true
      p.streak += 1
    } else {
      p.streak = 1
    }
    p.lastGoalDate = today
    streakGrew = true
    p.longestStreak = Math.max(p.longestStreak, p.streak)
    // Every FREEZE_EVERY_DAYS of streak earns a freeze, once per milestone.
    const milestones = Math.floor(p.streak / FREEZE_EVERY_DAYS)
    if (milestones > p.freezesEarned) {
      p.freezesEarned = milestones
      if (p.freezes < MAX_FREEZES) {
        p.freezes += 1
        freezesEarned = 1
      }
    }
  }
  if (dailyClear) {
    p.dailyChallengeDone = true
    p.dailyChallengeDate = today
  }

  const fresh: string[] = []
  if (opts.summary.stars >= 1) unlock(p, 'first-star', fresh)
  if (opts.summary.stars >= 3) unlock(p, 'three-star', fresh)
  if (opts.summary.maxCombo >= 16) unlock(p, 'combo-16', fresh)
  if (opts.summary.maxCombo >= 32) unlock(p, 'combo-32', fresh)
  if (p.streak >= 3) unlock(p, 'streak-3', fresh)
  if (p.streak >= 7) unlock(p, 'streak-7', fresh)
  if (p.xp >= 250) unlock(p, 'pocket', fresh)
  if (opts.newRung) unlock(p, 'ladder-first', fresh)
  if ((opts.newRung ?? 0) >= 120) unlock(p, 'ladder-120', fresh)

  write(p)
  return {
    profile: p,
    xpGained,
    streakGrew,
    newBadges: fresh,
    rankedUp: rankCrossed(opts.prevXp, p.xp),
    dailyGoalHit,
    freezeUsed,
    freezesEarned,
    dailyCleared: dailyClear,
  }
}

function rankCrossed(before: number, after: number): boolean {
  return RANKS.some((r) => r.xp > 0 && before < r.xp && after >= r.xp)
}

export const BADGE_LABEL: Record<string, string> = {
  'first-star': 'First star',
  'three-star': 'Clean pass',
  'combo-16': '16-hit combo',
  'combo-32': '32-hit combo',
  'streak-3': '3-day streak',
  'streak-7': 'Week on pads',
  pocket: 'Pocket rank',
  'ladder-first': 'Up the ladder',
  'ladder-120': 'Full speed',
}
