export interface Rank {
  id: string
  name: string
  xp: number
  blurb: string
}

export const RANKS: Rank[] = [
  { id: 'rookie', name: 'Rookie', xp: 0, blurb: 'Find the click.' },
  { id: 'pocket', name: 'Pocket', xp: 250, blurb: 'Notes land in the pocket.' },
  { id: 'session', name: 'Session', xp: 800, blurb: 'You can hold a groove.' },
  { id: 'studio', name: 'Studio', xp: 2000, blurb: 'Ready for a real kit.' },
  { id: 'headliner', name: 'Headliner', xp: 4500, blurb: 'The room moves with you.' },
  { id: 'legend', name: 'Legend', xp: 9000, blurb: 'Pads are just extra hands.' },
]

export function rankForXp(xp: number): { current: Rank; next: Rank | null; into: number } {
  let current = RANKS[0]
  for (const r of RANKS) {
    if (xp >= r.xp) current = r
  }
  const idx = RANKS.findIndex((r) => r.id === current.id)
  const next = RANKS[idx + 1] ?? null
  const span = next ? next.xp - current.xp : 1
  const into = next ? Math.min(1, (xp - current.xp) / span) : 1
  return { current, next, into }
}

export function xpForRun(opts: {
  accuracy: number
  stars: number
  maxCombo: number
  scored: boolean
  firstClear: boolean
  /** XP awarded for clearing the daily groove with this run; 0 when it did not. */
  dailyBonus: number
}): number {
  if (!opts.scored) return Math.max(4, Math.round(opts.accuracy * 0.12))
  let xp = opts.accuracy + opts.maxCombo * 2 + opts.stars * 22
  if (opts.stars === 3) xp += 35
  if (opts.firstClear) xp += 40
  xp += Math.max(0, opts.dailyBonus)
  return Math.round(xp)
}
