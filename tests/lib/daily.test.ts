import { describe, expect, it } from 'vitest'
import { DAILY_MODIFIERS, dailyBlurb, dailyCleared, dailyModifier } from '../../src/lib/daily'
import type { ScoreSummary } from '../../src/engine/scoring'
import { makeLesson } from '../helpers/chart'

function s(over: Partial<ScoreSummary> = {}): ScoreSummary {
  return {
    perfect: 8, great: 2, good: 0, miss: 0, stray: 0, total: 10,
    accuracy: 92, stars: 3, maxCombo: 10, deltas: [],
    ...over,
  }
}
const stars = (n: number) => ({ bestAccuracy: 80, stars: n })

describe('dailyModifier', () => {
  it('is Standard until the player has cleared something', () => {
    expect(dailyModifier({}, '2026-09-05').id).toBe('standard')
    expect(dailyModifier({ a: stars(0) }, '2026-09-05').id).toBe('standard')
  })

  it('is stable per day and rotates across days once a chart is cleared', () => {
    const p = { a: stars(1) }
    expect(dailyModifier(p, '2026-09-05')).toBe(dailyModifier(p, '2026-09-05'))
    const seen = new Set<string>()
    for (let d = 1; d <= 28; d++) seen.add(dailyModifier(p, `2026-09-${String(d).padStart(2, '0')}`).id)
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })
})

describe('dailyCleared', () => {
  const on = { isLastStep: true, tempoPct: 100 }

  it('never clears from a practice step', () => {
    expect(dailyCleared(DAILY_MODIFIERS.standard, s(), { isLastStep: false, tempoPct: 100 })).toBe(false)
  })

  it('standard clears on a scored Perform with at least one landed note', () => {
    expect(dailyCleared(DAILY_MODIFIERS.standard, s({ perfect: 1, great: 0, accuracy: 10, stars: 0, miss: 9, maxCombo: 1 }), on)).toBe(true)
  })

  it.each(Object.values(DAILY_MODIFIERS))('$id never clears an idle or empty chart', (modifier) => {
    const atTempo = { ...on, tempoPct: modifier.tempoPct }
    const idle = s({ perfect: 0, great: 0, good: 0, miss: 10, accuracy: 0, stars: 0, maxCombo: 0 })
    expect(dailyCleared(modifier, idle, atTempo)).toBe(false)
    expect(dailyCleared(modifier, { ...idle, stray: 20 }, atTempo)).toBe(false)
    expect(dailyCleared(modifier, { ...idle, total: 0, miss: 0 }, atTempo)).toBe(false)
  })

  it('tempo-up needs the raised tempo and one star', () => {
    const m = DAILY_MODIFIERS['tempo-up']
    expect(dailyCleared(m, s(), { isLastStep: true, tempoPct: 100 })).toBe(false)
    expect(dailyCleared(m, s(), { isLastStep: true, tempoPct: 110 })).toBe(true)
    expect(dailyCleared(m, s({ stars: 0, accuracy: 40 }), { isLastStep: true, tempoPct: 110 })).toBe(false)
  })

  it('clean forbids misses but tolerates extras', () => {
    const m = DAILY_MODIFIERS.clean
    expect(dailyCleared(m, s({ miss: 1 }), on)).toBe(false)
    expect(dailyCleared(m, s({ stray: 5, accuracy: 70, stars: 1 }), on)).toBe(true)
    expect(dailyCleared(m, s({ total: 0, perfect: 0, great: 0 }), on)).toBe(false)
  })

  it('tight needs three stars', () => {
    expect(dailyCleared(DAILY_MODIFIERS.tight, s({ stars: 2, accuracy: 89 }), on)).toBe(false)
    expect(dailyCleared(DAILY_MODIFIERS.tight, s({ stars: 3, accuracy: 90 }), on)).toBe(true)
  })

  it('fade only asks for one star and hides notes for 1.5 beats', () => {
    expect(DAILY_MODIFIERS.fade.fadeBeats).toBe(1.5)
    expect(dailyCleared(DAILY_MODIFIERS.fade, s({ stars: 1, accuracy: 60 }), on)).toBe(true)
  })
})

describe('dailyBlurb', () => {
  it('names the twist and its bonus', () => {
    const l = makeLesson({ genre: 'hip-hop', bpm: 92 })
    expect(dailyBlurb(l, DAILY_MODIFIERS.standard)).toBe('hip-hop · 92 BPM · +60 XP')
    expect(dailyBlurb(l, DAILY_MODIFIERS.clean)).toBe('hip-hop · 92 BPM · Clean · +90 XP')
  })
})
