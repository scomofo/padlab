import type { PerformanceRun } from '../store/history'

/** Small, labelled columns; every value is available without hover or colour perception. */
export function PerformanceTrail({ runs }: { runs: PerformanceRun[] }) {
  if (runs.length < 2) return null
  return (
    <ol className="performance-trail" aria-label="Recent accuracy, oldest to newest">
      {runs.slice(-5).map((run, i, recent) => (
        <li key={`${run.completedAt}-${i}`} className={i === recent.length - 1 ? 'latest' : ''}>
          <span>{run.accuracy}%</span>
          <div className="trail-track" aria-hidden="true"><div style={{ height: `${Math.max(3, run.accuracy)}%` }} /></div>
          <span className="trail-label">{i === recent.length - 1 ? 'Latest' : new Date(run.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </li>
      ))}
    </ol>
  )
}
