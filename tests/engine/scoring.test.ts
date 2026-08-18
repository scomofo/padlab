import { describe, expect, it } from 'vitest'
import { ScoreKeeper, WINDOW_MS, starsForAccuracy } from '../../src/engine/scoring'
import { beatsFromMs, note, secPerBeat } from '../helpers/chart'

const SPB = secPerBeat(120)

/** A keeper over one note on pad 1 at beat 0, unless told otherwise. */
function keeper(events = [note(0, 1)], bpm = 120) {
  return new ScoreKeeper(events, secPerBeat(bpm))
}

describe('starsForAccuracy', () => {
  it('awards stars at the documented thresholds', () => {
    expect(starsForAccuracy(100)).toBe(3)
    expect(starsForAccuracy(90)).toBe(3)
    expect(starsForAccuracy(89)).toBe(2)
    expect(starsForAccuracy(75)).toBe(2)
    expect(starsForAccuracy(74)).toBe(1)
    expect(starsForAccuracy(55)).toBe(1)
    expect(starsForAccuracy(54)).toBe(0)
    expect(starsForAccuracy(0)).toBe(0)
  })

  it('treats each threshold as inclusive', () => {
    // The README promises "3 stars at 90 %" — exactly 90 must qualify.
    for (const [acc, stars] of [[90, 3], [75, 2], [55, 1]] as const) {
      expect(starsForAccuracy(acc)).toBe(stars)
      expect(starsForAccuracy(acc - 0.5)).toBeLessThan(stars)
    }
  })
})

describe('WINDOW_MS', () => {
  /**
   * Asserted as literals, not via WINDOW_MS itself: the tests below express
   * their offsets in terms of the constant, so they would follow it if it
   * changed. The README publishes these numbers to players, so a change to
   * them is a product decision that should have to edit this line.
   */
  it('matches the windows the README documents', () => {
    expect(WINDOW_MS).toEqual({ perfect: 45, great: 90, good: 135 })
  })

  it('judges hits at the documented millisecond values', () => {
    expect(keeper().registerHit(1, beatsFromMs(45)).judgement).toBe('perfect')
    expect(keeper().registerHit(1, beatsFromMs(46)).judgement).toBe('great')
    expect(keeper().registerHit(1, beatsFromMs(90)).judgement).toBe('great')
    expect(keeper().registerHit(1, beatsFromMs(91)).judgement).toBe('good')
    expect(keeper().registerHit(1, beatsFromMs(135)).judgement).toBe('good')
    expect(keeper().registerHit(1, beatsFromMs(136)).judgement).toBe('stray')
  })
})

describe('ScoreKeeper.registerHit — timing windows', () => {
  it('judges a dead-on hit as perfect', () => {
    expect(keeper().registerHit(1, 0).judgement).toBe('perfect')
  })

  it.each([
    ['perfect', 0],
    ['perfect', WINDOW_MS.perfect],
    ['great', WINDOW_MS.perfect + 1],
    ['great', WINDOW_MS.great],
    ['good', WINDOW_MS.great + 1],
    ['good', WINDOW_MS.good],
    ['stray', WINDOW_MS.good + 1],
  ])('judges %s at %d ms late', (expected, ms) => {
    expect(keeper().registerHit(1, beatsFromMs(ms)).judgement).toBe(expected)
  })

  it.each([
    ['perfect', WINDOW_MS.perfect],
    ['great', WINDOW_MS.great],
    ['good', WINDOW_MS.good],
    ['stray', WINDOW_MS.good + 1],
  ])('judges %s at %d ms early, symmetrically', (expected, ms) => {
    expect(keeper().registerHit(1, beatsFromMs(-ms)).judgement).toBe(expected)
  })

  it('window edges are inclusive', () => {
    // `<=` in the judgement chain: exactly 45 ms is still perfect, not great.
    expect(keeper().registerHit(1, beatsFromMs(WINDOW_MS.perfect)).judgement).toBe('perfect')
    expect(keeper().registerHit(1, beatsFromMs(WINDOW_MS.great)).judgement).toBe('great')
  })

  it('reports signed deltaMs — negative early, positive late', () => {
    expect(keeper().registerHit(1, beatsFromMs(-30)).deltaMs).toBeCloseTo(-30, 6)
    expect(keeper().registerHit(1, beatsFromMs(30)).deltaMs).toBeCloseTo(30, 6)
  })
})

describe('ScoreKeeper.registerHit — tempo independence', () => {
  // Windows are in ms but matching happens in beats. The same wall-clock error
  // must earn the same judgement at any tempo, or fast charts get easier.
  it.each([60, 90, 120, 174])('applies the same ms windows at %d BPM', (bpm) => {
    const spb = secPerBeat(bpm)
    const k = () => new ScoreKeeper([note(4, 1)], spb)
    expect(k().registerHit(1, 4 + beatsFromMs(40, bpm)).judgement).toBe('perfect')
    expect(k().registerHit(1, 4 + beatsFromMs(80, bpm)).judgement).toBe('great')
    expect(k().registerHit(1, 4 + beatsFromMs(120, bpm)).judgement).toBe('good')
    expect(k().registerHit(1, 4 + beatsFromMs(200, bpm)).judgement).toBe('stray')
  })

  it('converts deltaMs back to wall-clock at any tempo', () => {
    for (const bpm of [60, 120, 174]) {
      const k = new ScoreKeeper([note(4, 1)], secPerBeat(bpm))
      expect(k.registerHit(1, 4 + beatsFromMs(37, bpm)).deltaMs).toBeCloseTo(37, 6)
    }
  })
})

describe('ScoreKeeper.registerHit — event matching', () => {
  it('counts a hit on an uncharted pad as a stray', () => {
    const k = keeper()
    expect(k.registerHit(7, 0).judgement).toBe('stray')
    expect(k.stray).toBe(1)
  })

  it('claims the nearest candidate when two same-pad notes are in range', () => {
    // 0.2 beats apart = 100 ms at 120 BPM: both are inside the 135 ms window
    // of a hit between them, so "nearest" is the only thing separating them.
    const k = keeper([note(0, 1), note(0.2, 1)])
    const res = k.registerHit(1, 0.12)
    expect(res.event?.t).toBe(0.2)
    expect(k.events.find((e) => e.t === 0)?.judgement).toBeUndefined()
  })

  it('leaves the passed-over note still hittable', () => {
    const k = keeper([note(0, 1), note(0.2, 1)])
    k.registerHit(1, 0.12)
    expect(k.registerHit(1, 0).judgement).toBe('perfect')
    expect(k.summary().miss).toBe(0)
  })

  it('does not re-award a note that was already judged', () => {
    const k = keeper()
    expect(k.registerHit(1, 0).judgement).toBe('perfect')
    // Second tap on the same note has nothing left to claim.
    expect(k.registerHit(1, 0).judgement).toBe('stray')
    expect(k.summary().perfect).toBe(1)
  })

  it('matches only the pad that was hit', () => {
    const k = keeper([note(0, 1), note(0, 2)])
    expect(k.registerHit(2, 0).event?.pad).toBe(2)
    expect(k.events.find((e) => e.pad === 1)?.judgement).toBeUndefined()
  })

  it('finds notes regardless of the order they were supplied in', () => {
    // The constructor sorts; the search relies on that to break out early.
    const k = keeper([note(8, 1), note(0, 1), note(4, 1)])
    expect(k.events.map((e) => e.t)).toEqual([0, 4, 8])
    for (const t of [0, 4, 8]) expect(k.registerHit(1, t).judgement).toBe('perfect')
  })

  it('does not mutate the caller’s event objects', () => {
    const source = [note(0, 1)]
    const k = keeper(source)
    k.registerHit(1, 0)
    expect(source[0]).not.toHaveProperty('judgement')
  })
})

describe('ScoreKeeper — combo tracking', () => {
  it('counts consecutive hits and remembers the peak', () => {
    const k = keeper([note(0, 1), note(1, 1), note(2, 1)])
    k.registerHit(1, 0)
    k.registerHit(1, 1)
    k.registerHit(1, 2)
    expect(k.combo).toBe(3)
    expect(k.maxCombo).toBe(3)
  })

  it('resets the combo on a stray but keeps the peak', () => {
    const k = keeper([note(0, 1), note(1, 1)])
    k.registerHit(1, 0)
    k.registerHit(1, 1)
    k.registerHit(4, 1) // uncharted pad
    expect(k.combo).toBe(0)
    expect(k.maxCombo).toBe(2)
  })

  it('resets the combo on a swept miss', () => {
    const k = keeper([note(0, 1), note(1, 1), note(2, 1)])
    k.registerHit(1, 0)
    k.sweepMisses(2)
    expect(k.combo).toBe(0)
    expect(k.maxCombo).toBe(1)
  })
})

describe('ScoreKeeper.sweepMisses', () => {
  it('does not miss a note whose window is still open', () => {
    const k = keeper()
    expect(k.sweepMisses(beatsFromMs(WINDOW_MS.good))).toEqual([])
  })

  it('misses a note once its window has fully passed', () => {
    const k = keeper()
    const missed = k.sweepMisses(beatsFromMs(WINDOW_MS.good) + 0.01)
    expect(missed).toHaveLength(1)
    expect(missed[0].judgement).toBe('miss')
  })

  it('reports each miss exactly once', () => {
    const k = keeper([note(0, 1), note(1, 1)])
    expect(k.sweepMisses(4)).toHaveLength(2)
    expect(k.sweepMisses(8)).toHaveLength(0)
  })

  it('leaves already-hit notes alone', () => {
    const k = keeper()
    k.registerHit(1, 0)
    expect(k.sweepMisses(8)).toEqual([])
    expect(k.summary().perfect).toBe(1)
  })

  it('sweeping backwards in time misses nothing', () => {
    // The runtime sweeps at a latency-compensated position that can sit behind
    // the transport; that must never retroactively miss anything.
    const k = keeper([note(4, 1)])
    expect(k.sweepMisses(0)).toEqual([])
    expect(k.sweepMisses(-1)).toEqual([])
  })

  it('a late-but-valid hit still scores if the sweep has not passed it', () => {
    // Guards the invariant in player.ts: raising input latency must never turn
    // a hit that is inside the window into a miss.
    const k = keeper()
    const lateButValid = beatsFromMs(WINDOW_MS.good - 5)
    expect(k.sweepMisses(lateButValid)).toEqual([])
    expect(k.registerHit(1, lateButValid).judgement).toBe('good')
  })
})

describe('ScoreKeeper.summary', () => {
  it('scores a flawless run at 100% and 3 stars', () => {
    const k = keeper([note(0, 1), note(1, 1), note(2, 1), note(3, 1)])
    for (const t of [0, 1, 2, 3]) k.registerHit(1, t)
    const s = k.summary()
    expect(s).toMatchObject({ perfect: 4, great: 0, good: 0, miss: 0, stray: 0, total: 4 })
    expect(s.accuracy).toBe(100)
    expect(s.stars).toBe(3)
  })

  it('weights great at 0.85 and good at 0.5', () => {
    const k = keeper([note(0, 1), note(1, 1), note(2, 1), note(3, 1)])
    k.registerHit(1, 0) // perfect  1.0
    k.registerHit(1, 1 + beatsFromMs(80)) // great  0.85
    k.registerHit(1, 2 + beatsFromMs(120)) // good   0.5
    k.sweepMisses(8) // miss    0
    const s = k.summary()
    expect(s).toMatchObject({ perfect: 1, great: 1, good: 1, miss: 1 })
    expect(s.accuracy).toBe(Math.round(((1 + 0.85 + 0.5) / 4) * 100)) // 59
  })

  it('counts unjudged notes as misses', () => {
    const k = keeper([note(0, 1), note(1, 1)])
    k.registerHit(1, 0)
    // No sweep — the second note was never judged at all.
    expect(k.summary().miss).toBe(1)
    expect(k.summary().total).toBe(2)
  })

  it('never reports negative accuracy', () => {
    const k = keeper([note(0, 1)])
    for (let i = 0; i < 500; i++) k.registerHit(7, 0)
    expect(k.summary().accuracy).toBeGreaterThanOrEqual(0)
  })

  it('penalises stray hits', () => {
    const clean = keeper([note(0, 1), note(1, 1)])
    clean.registerHit(1, 0)
    clean.registerHit(1, 1)

    const sloppy = keeper([note(0, 1), note(1, 1)])
    sloppy.registerHit(1, 0)
    sloppy.registerHit(1, 1)
    sloppy.registerHit(7, 0.5)

    expect(sloppy.summary().stray).toBe(1)
    expect(sloppy.summary().accuracy).toBeLessThan(clean.summary().accuracy)
  })

  it('penalises more strays more heavily, monotonically', () => {
    const accuracyWith = (strays: number) => {
      const k = keeper([note(0, 1), note(1, 1), note(2, 1), note(3, 1)])
      for (const t of [0, 1, 2, 3]) k.registerHit(1, t)
      for (let i = 0; i < strays; i++) k.registerHit(7, 0.5)
      return k.summary().accuracy
    }
    const accuracies = [0, 1, 2, 3].map(accuracyWith)
    for (let i = 1; i < accuracies.length; i++) {
      expect(accuracies[i]).toBeLessThanOrEqual(accuracies[i - 1])
    }
  })

  it('reports maxCombo alongside the counts', () => {
    const k = keeper([note(0, 1), note(1, 1), note(2, 1)])
    k.registerHit(1, 0)
    k.registerHit(1, 1)
    k.registerHit(7, 1.5) // stray breaks the combo
    k.registerHit(1, 2)
    expect(k.summary().maxCombo).toBe(2)
  })
})

describe('ScoreKeeper.summary — edge cases worth a decision', () => {
  /**
   * Pins current behaviour rather than endorsing it: a step the player owns no
   * notes in short-circuits to 100% and 3 stars. Unreachable today because the
   * validator forces `playerPads: "all"` on the final (scored) step, but it is
   * one authoring change away from awarding free stars.
   */
  it('awards a full score for a step with no player notes', () => {
    const s = new ScoreKeeper([], SPB).summary()
    expect(s.total).toBe(0)
    expect(s.accuracy).toBe(100)
    expect(s.stars).toBe(3)
  })

  it('does not divide by zero when penalising strays on an empty step', () => {
    const k = new ScoreKeeper([], SPB)
    k.registerHit(1, 0)
    const s = k.summary()
    expect(Number.isFinite(s.accuracy)).toBe(true)
    expect(s.accuracy).toBeGreaterThanOrEqual(0)
    expect(s.accuracy).toBeLessThanOrEqual(100)
  })

  /**
   * The stray penalty is a flat `raw - strayCount`, so it costs the same number
   * of points on a 12-note chart as on a 100-note one — roughly 8x harsher per
   * note on short charts. `fix/scoring-stray-penalty` proposes making this
   * proportional and capped; this test documents today's behaviour so that
   * change shows up as an intentional diff rather than a silent one.
   */
  it('charges strays a flat cost independent of chart length', () => {
    const runWith = (noteCount: number) => {
      const events = Array.from({ length: noteCount }, (_, i) => note(i, 1))
      const k = keeper(events)
      for (let i = 0; i < noteCount; i++) k.registerHit(1, i)
      for (let i = 0; i < 12; i++) k.registerHit(7, 0.5)
      return k.summary().accuracy
    }
    expect(runWith(12)).toBe(88)
    expect(runWith(100)).toBe(88)
  })
})
