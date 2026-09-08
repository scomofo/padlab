import { comparableRuns, type PerformanceRun } from '../store/history'

export interface GrooveTarget {
  accuracy: number
  previousBest: number
}

/** A target from comparable full performances, frozen by the caller for one run. */
export function personalBestTarget(
  history: PerformanceRun[],
  run: Pick<PerformanceRun, 'lessonId' | 'tempoPct' | 'variant' | 'total'>,
): GrooveTarget | null {
  const comparable = comparableRuns(history, run)
  if (comparable.length === 0) return null
  const previousBest = comparable.reduce((best, item) => Math.max(best, item.accuracy), 0)
  return { previousBest, accuracy: Math.min(100, previousBest + 1) }
}
