/** Local calendar day as YYYY-MM-DD. Streaks and the daily groove key off this. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function yesterdayKey(d = new Date()): string {
  const y = new Date(d)
  y.setDate(y.getDate() - 1)
  return todayKey(y)
}

/** Local calendar day N days back as YYYY-MM-DD. */
export function daysAgoKey(n: number, d = new Date()): string {
  const y = new Date(d)
  y.setDate(y.getDate() - n)
  return todayKey(y)
}
