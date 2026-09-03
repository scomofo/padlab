// The difficulty model decides which charts are allowed into the app: the
// validator compares `effectiveHitsPerSec` against a per-level ceiling. Its four
// tuned constants had no tests, so retuning any of them was unfalsifiable.
import { describe, expect, it } from 'vitest'
import { analyzeLesson, findOstinatoPads } from '../../scripts/lib/difficulty.mjs'

/** Notes on one pad, every `gap` beats, from 0 up to (not including) `upto`. */
function stream(gap, upto, pad = 5) {
  const out = []
  for (let t = 0; t < upto - 1e-9; t += gap) out.push({ t: +t.toFixed(4), pad })
  return out
}

const KICK_ON_EACH_BAR = [0, 4, 8, 12].map((t) => ({ t, pad: 1 }))
const lesson = (events, over = {}) => ({ bars: 4, bpm: 120, events, ...over })

describe('findOstinatoPads — minimum note count', () => {
  it('ignores a stream shorter than 8 notes', () => {
    expect([...findOstinatoPads(stream(0.5, 3.5), 4)]).toEqual([])
  })

  it('accepts one at exactly 8 notes', () => {
    expect([...findOstinatoPads(stream(0.5, 4), 4)]).toEqual([5])
  })
})

describe('findOstinatoPads — speed ceiling', () => {
  it('accepts a stream at exactly the 0.5-beat gap ceiling', () => {
    expect([...findOstinatoPads(stream(0.5, 16), 16)]).toEqual([5])
  })

  it('rejects a stream slower than the ceiling', () => {
    // 0.625-beat gaps: still steady, but not a stream a hand locks into.
    expect([...findOstinatoPads(stream(0.625, 16), 16)]).toEqual([])
  })

  it('accepts faster streams', () => {
    expect([...findOstinatoPads(stream(0.25, 16), 16)]).toEqual([5])
  })
})

describe('findOstinatoPads — regularity floor', () => {
  /** Displace every 4th note, which makes exactly 2 gaps irregular per note. */
  const displaced = (m) => {
    const notes = stream(0.5, 16)
    for (let i = 1; i <= m; i++) notes[i * 4] = { t: notes[i * 4].t + 0.125, pad: 5 }
    return notes.sort((a, b) => a.t - b.t)
  }

  it('tolerates a stream that is 80% regular', () => {
    // 3 displacements => 6 of 31 gaps irregular => 80.6% regular.
    expect([...findOstinatoPads(displaced(3), 16)]).toEqual([5])
  })

  it('rejects one that drops below 80%', () => {
    // 4 displacements => 8 of 31 gaps irregular => 74.2% regular.
    expect([...findOstinatoPads(displaced(4), 16)]).toEqual([])
  })
})

describe('findOstinatoPads — coverage floor', () => {
  it('rejects a stream covering less than 60% of the chart', () => {
    // Spans 9.5 of 16 beats; the floor is 9.6.
    expect([...findOstinatoPads(stream(0.5, 9.75), 16)]).toEqual([])
  })

  it('accepts one that spans at least 60%', () => {
    expect([...findOstinatoPads(stream(0.5, 10.25), 16)]).toEqual([5])
  })
})

describe('findOstinatoPads — general behaviour', () => {
  it('finds nothing in an empty chart', () => {
    expect([...findOstinatoPads([], 16)]).toEqual([])
  })

  it('judges each pad on its own merits', () => {
    const events = [...KICK_ON_EACH_BAR, ...stream(0.5, 16, 5), ...stream(0.25, 16, 7)]
    expect([...findOstinatoPads(events, 16)].sort((a, b) => a - b)).toEqual([5, 7])
  })

  it('does not treat a sparse backbeat as a stream', () => {
    const snare = [1, 3, 5, 7, 9, 11, 13, 15].map((t) => ({ t, pad: 2 }))
    expect([...findOstinatoPads(snare, 16)]).toEqual([])
  })

  it('is not confused by unsorted input', () => {
    const shuffled = [...stream(0.5, 16)].reverse()
    expect([...findOstinatoPads(shuffled, 16)]).toEqual([5])
  })
})

describe('analyzeLesson', () => {
  const events = [...KICK_ON_EACH_BAR, ...stream(0.5, 16)]
  const result = analyzeLesson(lesson(events))

  it('counts raw instants per second', () => {
    // 32 distinct instants over 8 seconds (16 beats at 120 BPM).
    expect(result.hitsPerSec).toBe(4)
  })

  it('counts every note, not just instants, in notesPerSec', () => {
    expect(result.notesPerSec).toBe(4.5) // 36 notes / 8 s
    expect(result.events).toBe(36)
  })

  it('discounts instants made up purely of an ostinato voice', () => {
    // 28 hat-only instants at 0.4 + 4 kick+hat instants at 1.0 = 15.2 / 8 s.
    expect(result.effectiveHitsPerSec).toBe(1.9)
  })

  it('treats a chord as one action but reports its size', () => {
    expect(result.doublePct).toBe(13) // 4 of 32 instants have two pads
    expect(result.maxSim).toBe(2)
  })

  it('reports the tightest gap in milliseconds', () => {
    expect(result.minGapMs).toBe(250) // 0.5 beats at 120 BPM
  })

  it('lists the detected ostinato pads', () => {
    expect(result.ostinatoPads).toEqual([5])
  })

  it('scales with tempo — the same chart is harder faster', () => {
    const slow = analyzeLesson(lesson(events, { bpm: 90 }))
    const fast = analyzeLesson(lesson(events, { bpm: 180 }))
    expect(fast.hitsPerSec).toBeGreaterThan(slow.hitsPerSec)
    expect(fast.minGapMs).toBeLessThan(slow.minGapMs)
  })

  it('handles a chart with a single instant', () => {
    const r = analyzeLesson(lesson([{ t: 0, pad: 1 }]))
    expect(r.minGapMs).toBe(0) // no gap to measure
    expect(r.doublePct).toBe(0)
    expect(r.maxSim).toBe(1)
  })

  it('handles an empty chart without dividing by zero', () => {
    const r = analyzeLesson(lesson([]))
    expect(r.hitsPerSec).toBe(0)
    expect(r.doublePct).toBe(0)
    expect(r.maxSim).toBe(0)
    expect(r.minGapMs).toBe(0)
  })

  it('counts a three-pad chord as one action', () => {
    const chord = [1, 2, 3].map((pad) => ({ t: 0, pad }))
    const r = analyzeLesson(lesson(chord))
    expect(r.hitsPerSec).toBe(0.13) // one instant / 8 s
    expect(r.maxSim).toBe(3)
    expect(r.doublePct).toBe(100)
  })
})

describe('analyzeLesson — the ostinato discount is not monotonic in density', () => {
  /**
   * Accepted: a locked-in hat/shaker hand is easier than the same rate on
   * four pads, and the 0.5-beat cliff is how we detect that. Crossing it
   * flips the pad to ostinato (0.4 weight), so adding notes can lower
   * `effectiveHitsPerSec` (1.9 vs 3.0 in this fixture). That is the product,
   * not a bug. If the four constants are retuned, this test should fail first.
   */
  it('a denser hat scores easier than a sparser one', () => {
    const dense = analyzeLesson(lesson([...KICK_ON_EACH_BAR, ...stream(0.5, 16)]))
    const sparse = analyzeLesson(lesson([...KICK_ON_EACH_BAR, ...stream(0.75, 16)]))

    expect(dense.events).toBeGreaterThan(sparse.events)
    expect(dense.hitsPerSec).toBeGreaterThan(sparse.hitsPerSec)
    // ...yet the denser chart is rated the easier of the two.
    expect(dense.effectiveHitsPerSec).toBeLessThan(sparse.effectiveHitsPerSec)
    expect(dense.effectiveHitsPerSec).toBe(1.9)
    expect(sparse.effectiveHitsPerSec).toBe(3)
  })
})
