import { KNOB_LABEL, type Mission } from './missions'
import { weakestKey, type Patch } from './patch'

export function nearMissLine(pct: number): string | null {
  if (pct >= 82 && pct < 92) return `${pct}% — one more nudge and this is a clean match.`
  return null
}

export function coachLine(player: Patch, mission: Mission, pct: number): string {
  if (pct >= 92) return 'Locked. That is the patch.'
  if (pct >= mission.clearAt) {
    const near = nearMissLine(pct)
    return near ?? 'Close enough to clear. Keep sculpting for three stars.'
  }
  const weak = weakestKey(player, mission.target, mission.focus)
  if (weak) return `Off on ${KNOB_LABEL[weak].toLowerCase()}. ${mission.hint}`
  return mission.hint
}
