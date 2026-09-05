import { WINDOW_MS, starsForAccuracy } from '../engine/scoring'
import type { ScoreSummary } from '../engine/scoring'

export const STAR_THRESHOLDS: Record<1 | 2 | 3, number> = { 1: 55, 2: 75, 3: 90 }

export interface TimingBucket {
  /** Bucket label, e.g. "early", "on", "late". */
  id: 'early-miss' | 'early' | 'on' | 'late' | 'late-miss'
  count: number
}

/**
 * Five-way split of judged hits by signed timing error: outside the great
 * window early, inside it early, perfect, inside it late, outside it late.
 * Misses (never hit) are not included — they have no timing.
 */
export function timingBuckets(deltas: number[]): TimingBucket[] {
  const counts = { 'early-miss': 0, early: 0, on: 0, late: 0, 'late-miss': 0 }
  for (const d of deltas) {
    if (Math.abs(d) <= WINDOW_MS.perfect) counts.on++
    else if (d < 0) counts[d < -WINDOW_MS.great ? 'early-miss' : 'early']++
    else counts[d > WINDOW_MS.great ? 'late-miss' : 'late']++
  }
  return (['early-miss', 'early', 'on', 'late', 'late-miss'] as const).map((id) => ({ id, count: counts[id] }))
}

export interface TimingLean {
  meanMs: number
  /** 'early' | 'late' when the lean is worth mentioning; null when centred. */
  direction: 'early' | 'late' | null
}

/** Average signed error, flagged as a lean when it is clearly one-sided. */
export function timingLean(deltas: number[]): TimingLean {
  if (deltas.length === 0) return { meanMs: 0, direction: null }
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const meanMs = Math.round(mean)
  // Needs a few hits and a lean bigger than a third of the perfect window to be
  // a pattern rather than noise.
  if (deltas.length < 4 || Math.abs(meanMs) < WINDOW_MS.perfect / 3) return { meanMs, direction: null }
  return { meanMs, direction: meanMs < 0 ? 'early' : 'late' }
}

/**
 * The one line under the score that tells the player why to hit Retry.
 * Prefers a reachable star target, then a timing lean, then a combo note.
 */
export function nearMissHook(summary: ScoreSummary): string | null {
  const stars = starsForAccuracy(summary.accuracy)
  if (stars < 3) {
    const target = (stars + 1) as 1 | 2 | 3
    const need = STAR_THRESHOLDS[target] - summary.accuracy
    if (need <= 10 && summary.total > 0) {
      // Each miss → perfect is worth 100/total points; each great → perfect 15/total.
      const perMiss = 100 / summary.total
      const missesToFix = Math.ceil(need / perMiss)
      if (summary.miss > 0 && missesToFix <= summary.miss) {
        return `${need}% from ${target} ${target === 1 ? 'star' : 'stars'} — land ${missesToFix} more ${missesToFix === 1 ? 'note' : 'notes'}`
      }
      return `${need}% from ${target} ${target === 1 ? 'star' : 'stars'} — tighten the greats into perfects`
    }
  }
  const lean = timingLean(summary.deltas)
  if (lean.direction === 'early') return `Leaning early by ${Math.abs(lean.meanMs)} ms — wait for the line`
  if (lean.direction === 'late') return `Leaning late by ${lean.meanMs} ms — commit a touch sooner`
  if (stars === 3 && summary.perfect < summary.total && summary.miss === 0) {
    return `Clean — ${summary.total - summary.perfect} to go for all perfects`
  }
  if (summary.total > 0 && summary.maxCombo < summary.total && summary.miss + summary.stray <= 2) {
    return `Full combo is ${summary.total} — you got to ${summary.maxCombo}`
  }
  return null
}
