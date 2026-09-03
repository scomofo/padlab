import { describe, expect, it } from 'vitest'
import { ScoreKeeper } from '../../src/engine/scoring'
import { secPerBeat } from '../helpers/chart'

const SPB = secPerBeat(120)

describe('ScoreKeeper.summary — empty player part', () => {
  /**
   * Decided: a step the player owns no notes in scores 0% / 0\u2605.
   * Unreachable on a valid chart today (final step is `playerPads: "all"`,
   * and every listed pad must have events), but if authoring ever lets an
   * empty player part through it must not mint a clean pass.
   */
  it('awards no score for a step with no player notes', () => {
    const s = new ScoreKeeper([], SPB).summary()
    expect(s.total).toBe(0)
    expect(s.accuracy).toBe(0)
    expect(s.stars).toBe(0)
  })

  it('does not divide by zero when penalising strays on an empty step', () => {
    const k = new ScoreKeeper([], SPB)
    k.registerHit(1, 0)
    const s = k.summary()
    expect(Number.isFinite(s.accuracy)).toBe(true)
    expect(s.accuracy).toBe(0)
    expect(s.stars).toBe(0)
  })
})
