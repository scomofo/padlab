import { describe, expect, it } from 'vitest'
import { ScoreKeeper } from '../../src/engine/scoring'

describe('combo chronology under delayed delivery', () => {
  it('places a deferred miss at its original window end, before newer hits', () => {
    const k = new ScoreKeeper([{ t: 0, pad: 1 }, { t: .1, pad: 2 }, { t: .5, pad: 1 }, { t: .8, pad: 1 }], .5)
    k.registerHit(1, 0); k.registerHit(1, .5); k.registerHit(1, .8)
    k.sweepMisses(.6)
    expect(k.events[1].judgement).toBe('miss')
    expect(k.combo).toBe(2); expect(k.summary().maxCombo).toBe(2)
  })
  it('places an older stray before newer hits without erasing their streak', () => {
    const k = new ScoreKeeper([{ t: 0, pad: 1 }, { t: .5, pad: 1 }, { t: .8, pad: 1 }], .5)
    k.registerHit(1, 0); k.registerHit(1, .5); k.registerHit(1, .8)
    k.registerHit(9, .4)
    expect(k.combo).toBe(2); expect(k.maxCombo).toBe(2)
  })
  it('does not move a queued earlier hit to the far side of a stray', () => {
    const k = new ScoreKeeper([{ t: 0, pad: 1 }, { t: 1, pad: 1 }, { t: 2, pad: 1 }], .5)
    k.registerHit(1, 0); k.registerHit(9, 1.5); k.registerHit(1, 1)
    expect(k.combo).toBe(0); expect(k.maxCombo).toBe(2)
    k.registerHit(1, 2)
    expect(k.combo).toBe(1); expect(k.maxCombo).toBe(2)
  })
})
