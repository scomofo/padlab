import type { Lesson, LessonProgress } from '../engine/types'

/**
 * Tempo ladder: once a lesson is mastered (3 stars at 100%), the Perform step
 * can be replayed faster. A rung is cleared by 3 stars at that tempo or above.
 * 120 is the transport's ceiling (tempoScale is clamped to 1.2).
 */
export const LADDER_RUNGS = [105, 110, 115, 120] as const
export type Rung = (typeof LADDER_RUNGS)[number]

export const LADDER_STARS = 3

export function ladderUnlocked(p: LessonProgress | undefined): boolean {
  return (p?.stars ?? 0) >= 3
}

/** Highest rung cleared, or 100 when none. */
export function bestRung(p: LessonProgress | undefined): number {
  return p?.bestTempoPct ?? 100
}

/** Next rung to attempt, or null when the ladder is topped out or not yet unlocked. */
export function nextRung(p: LessonProgress | undefined): Rung | null {
  if (!ladderUnlocked(p)) return null
  const best = bestRung(p)
  return LADDER_RUNGS.find((r) => r > best) ?? null
}

/** Whether a finished run clears a new rung; returns the rung or null. */
export function rungCleared(
  p: LessonProgress | undefined,
  run: { tempoPct: number; stars: number; isLastStep: boolean },
): Rung | null {
  if (!run.isLastStep || run.stars < LADDER_STARS) return null
  // Must already be mastered at 100% (this run at 100% can be the one that does it).
  const masteredNow = ladderUnlocked(p) || run.tempoPct >= 100
  if (!masteredNow) return null
  const reached = LADDER_RUNGS.filter((r) => r <= run.tempoPct)
  const top = reached[reached.length - 1]
  if (top === undefined || top <= bestRung(p)) return null
  return top
}

/** Tempo choices for the Perform step of a mastered lesson: rungs above, then the normal list. */
export function tempoChoices(p: LessonProgress | undefined, base: number[]): number[] {
  if (!ladderUnlocked(p)) return base
  const extra = LADDER_RUNGS.filter((r) => !base.includes(r)).slice().reverse()
  return [...extra, ...base.filter((b) => !extra.includes(b as Rung))]
}

/** Card label: "⚡120%" once any rung is cleared. */
export function ladderLabel(lesson: Lesson, p: LessonProgress | undefined): string | null {
  void lesson
  const best = bestRung(p)
  return best > 100 ? `⚡${best}%` : null
}
