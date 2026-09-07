import { describe, expect, it } from 'vitest'
import { ScoreKeeper } from '../../src/engine/scoring'
import type { PlayerRuntime } from '../../src/engine/player'
import { readRunStatus } from '../../src/components/RunStatus'
function fixture() {
  const score = new ScoreKeeper([{ t: 0, pad: 1 }, { t: 1, pad: 2 }], .5)
  const runtime = { score, transport: { now: () => .5 }, feedback: [], waitingPads: null } as unknown as PlayerRuntime
  return { score, runtime }
}
describe('live gameplay status', () => {
  it('shows no invented accuracy before any note is judged', () => {
    expect(readRunStatus(null).accuracy).toBeNull()
    expect(readRunStatus(fixture().runtime).accuracy).toBeNull()
  })
  it('does not count future notes as failures', () => {
    const { score, runtime } = fixture(); score.registerHit(1, 0)
    expect(score.summary().accuracy).toBe(50)
    expect(readRunStatus(runtime)).toMatchObject({ accuracy: 100, judged: 1, combo: 1 })
  })
  it('matches the final score after real misses and stray hits', () => {
    const { score, runtime } = fixture(); score.registerHit(1, 0)
    score.registerHit(8, .5); score.sweepMisses(2)
    expect(readRunStatus(runtime).accuracy).toBe(score.summary().accuracy)
    expect(readRunStatus(runtime).judged).toBe(2)
  })
})
