import { todayKey, yesterdayKey } from '../lib/dates'
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
}

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
    return { ...EMPTY, week: {} }
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
  }
}

export function saveProfile(p: Profile): void {
  write(p)
}

export function goalMetToday(p: Profile): boolean {
  return p.lastGoalDate === todayKey()
}

export interface RunAward {
  profile: Profile
  xpGained: number
  streakGrew: boolean
  newBadges: string[]
  rankedUp: boolean
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
  isDaily: boolean
  durationSec: number
  prevXp: number
}): RunAward {
  const today = todayKey()
  const p: Profile = {
    ...opts.profile,
    badges: [...opts.profile.badges],
    week: { ...opts.profile.week },
  }
  const xpGained = xpForRun({
    accuracy: opts.summary.accuracy,
    stars: opts.summary.stars,
    maxCombo: opts.summary.maxCombo,
    scored: opts.scored,
    firstClear: opts.firstClear,
    dailyBonus: opts.isDaily && opts.scored,
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
  p.dailyXp += xpGained
  p.week[today] = (p.week[today] ?? 0) + 1

  let streakGrew = false
  if (opts.scored && p.lastGoalDate !== today) {
    if (p.lastGoalDate === yesterdayKey()) p.streak += 1
    else p.streak = 1
    p.lastGoalDate = today
    streakGrew = true
    p.longestStreak = Math.max(p.longestStreak, p.streak)
  }
  if (opts.isDaily && opts.scored) {
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

  write(p)
  return {
    profile: p,
    xpGained,
    streakGrew,
    newBadges: fresh,
    rankedUp: rankCrossed(opts.prevXp, p.xp),
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
}
