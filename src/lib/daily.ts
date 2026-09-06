import type { ScoreSummary } from '../engine/scoring'
import type { Lesson, LessonProgress } from '../engine/types'
import { todayKey } from './dates'

export type DailyModifierId = 'standard' | 'tempo-up' | 'clean' | 'fade' | 'tight'

export interface DailyModifier {
  id: DailyModifierId
  /** Short name for the home card and player header. */
  name: string
  /** One-line rule the player reads before starting. */
  rule: string
  /** Tempo the run must be played at (percent). 100 unless the modifier raises it. */
  tempoPct: number
  /** Beats before the hit line at which player notes finish fading out. 0 = no fade. */
  fadeBeats: number
  /** XP for clearing the daily with this modifier on. */
  bonusXp: number
  /** Whether a scored Perform run clears the daily under this modifier. */
  clears: (s: ScoreSummary) => boolean
}

export const STANDARD_BONUS_XP = 60
export const MODIFIED_BONUS_XP = 90

const STANDARD: DailyModifier = {
  id: 'standard',
  name: 'Standard',
  rule: 'Finish Perform and land at least one note',
  tempoPct: 100,
  fadeBeats: 0,
  bonusXp: STANDARD_BONUS_XP,
  clears: () => true,
}

export const DAILY_MODIFIERS: Record<DailyModifierId, DailyModifier> = {
  standard: STANDARD,
  'tempo-up': {
    id: 'tempo-up',
    name: 'Tempo +10%',
    rule: 'Same chart, 110% tempo. One star clears it',
    tempoPct: 110,
    fadeBeats: 0,
    bonusXp: MODIFIED_BONUS_XP,
    clears: (s) => s.stars >= 1,
  },
  clean: {
    id: 'clean',
    name: 'Clean',
    rule: 'No misses. Every note must land',
    tempoPct: 100,
    fadeBeats: 0,
    bonusXp: MODIFIED_BONUS_XP,
    clears: (s) => s.total > 0 && s.miss === 0,
  },
  fade: {
    id: 'fade',
    name: 'Fade',
    rule: 'Notes vanish before the line. Play from memory. One star clears it',
    tempoPct: 100,
    fadeBeats: 1.5,
    bonusXp: MODIFIED_BONUS_XP,
    clears: (s) => s.stars >= 1,
  },
  tight: {
    id: 'tight',
    name: 'Tight',
    rule: 'Three stars or nothing — 90% accuracy',
    tempoPct: 100,
    fadeBeats: 0,
    bonusXp: MODIFIED_BONUS_XP,
    clears: (s) => s.stars >= 3,
  },
}

/** Order the day hash indexes into. Standard appears once so most days carry a twist. */
const ROTATION: DailyModifierId[] = ['tempo-up', 'clean', 'standard', 'fade', 'tight']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Today's modifier. Players who have not yet cleared a chart get the plain
 * daily — a twist on a chart you cannot play yet is a wall, not a hook.
 */
export function dailyModifier(
  progress: Record<string, LessonProgress>,
  today = todayKey(),
): DailyModifier {
  const cleared = Object.values(progress).some((p) => (p?.stars ?? 0) > 0)
  if (!cleared) return STANDARD
  return DAILY_MODIFIERS[ROTATION[hash(today + ':padlab-mod') % ROTATION.length]]
}

/**
 * True when a finished run counts as a daily clear: the Perform step, played
 * at (or above) the modifier's tempo, meeting the modifier's rule.
 */
export function dailyCleared(
  modifier: DailyModifier,
  summary: ScoreSummary,
  opts: { isLastStep: boolean; tempoPct: number },
): boolean {
  if (!opts.isLastStep) return false
  if (opts.tempoPct < modifier.tempoPct) return false
  if (summary.total <= 0 || summary.perfect + summary.great + summary.good <= 0) return false
  return modifier.clears(summary)
}

/** Human line for a lesson card: "hip-hop · 92 BPM · Tempo +10% · +90 XP". */
export function dailyBlurb(lesson: Lesson, modifier: DailyModifier): string {
  const twist = modifier.id === 'standard' ? '' : ` · ${modifier.name}`
  return `${lesson.genre} · ${lesson.bpm} BPM${twist} · +${modifier.bonusXp} XP`
}
