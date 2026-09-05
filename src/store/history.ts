import type { DailyModifierId } from '../lib/daily'
import { LADDER_RUNGS } from '../lib/ladder'

const KEY = 'padlab-history-v1'
export const HISTORY_LIMIT = 60
const VARIANTS: DailyModifierId[] = ['standard', 'tempo-up', 'clean', 'fade', 'tight']
const TEMPOS: readonly number[] = [100, ...LADDER_RUNGS]

/** Full-chart Play runs only. Practice, focus drills and aborted runs never enter this history. */
export interface PerformanceRun {
  lessonId: string
  completedAt: string
  tempoPct: number
  variant: DailyModifierId
  accuracy: number
  maxCombo: number
  misses: number
  total: number
}

function integer(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

function sanitizeHistory(value: unknown): PerformanceRun[] {
  if (!Array.isArray(value)) return []
  const runs: PerformanceRun[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const r = item as Record<string, unknown>
    if (typeof r.lessonId !== 'string' || !r.lessonId || r.lessonId.length > 200
      || typeof r.completedAt !== 'string' || !Number.isFinite(Date.parse(r.completedAt))
      || !integer(r.tempoPct, 100, 120) || !TEMPOS.includes(r.tempoPct) || !VARIANTS.includes(r.variant as DailyModifierId)
      || !integer(r.accuracy, 0, 100) || !integer(r.total, 1, 100_000)
      || !integer(r.maxCombo, 0, r.total) || !integer(r.misses, 0, r.total)) continue
    runs.push({
      lessonId: r.lessonId,
      completedAt: new Date(r.completedAt).toISOString(),
      tempoPct: r.tempoPct,
      variant: r.variant as DailyModifierId,
      accuracy: r.accuracy,
      maxCombo: r.maxCombo,
      misses: r.misses,
      total: r.total,
    })
  }
  return runs.sort((a, b) => a.completedAt.localeCompare(b.completedAt)).slice(-HISTORY_LIMIT)
}

export function loadHistory(): PerformanceRun[] {
  try {
    return sanitizeHistory(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return []
  }
}

/** Compare the same chart, tempo and daily rules; a slow or easier run is never an improvement. */
export function comparableRuns(history: PerformanceRun[], run: PerformanceRun): PerformanceRun[] {
  return history.filter((r) => r.lessonId === run.lessonId && r.tempoPct === run.tempoPct
    && r.variant === run.variant && r.total === run.total)
}

export function savePerformance(run: PerformanceRun, history: PerformanceRun[]): PerformanceRun[] {
  const next = sanitizeHistory([...history, run])
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Keep the current visit's history usable even when browser storage is unavailable.
  }
  return next
}
