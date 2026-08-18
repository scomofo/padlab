// buildLesson turns readable step-grid strings into lesson JSON. Most of the
// library is authored through it, so a bug here corrupts charts at generation
// time — before the validator ever sees them.
import { describe, expect, it } from 'vitest'
import { buildLesson, perform } from '../../scripts/lib/chart.mjs'

const base = {
  id: 'test',
  title: 'Test',
  course: 'foundations',
  genre: 'Test',
  level: 1,
  padCount: 8,
  bpm: 120,
  bars: 1,
  pads: { 1: 'kick' },
  steps: [perform('Everything')],
}

const build = (over = {}) => buildLesson({ ...base, ...over })
const times = (lesson, pad) => lesson.events.filter((e) => e.pad === pad).map((e) => e.t)

describe('grid resolution', () => {
  it('reads an 8-character row as eighth notes', () => {
    expect(times(build({ grid: { 1: 'x.x.x.x.' } }), 1)).toEqual([0, 1, 2, 3])
  })

  it('reads a 16-character row as sixteenth notes', () => {
    expect(times(build({ grid: { 1: 'x...x...x...x...' } }), 1)).toEqual([0, 1, 2, 3])
  })

  it('reads a 32-character row as thirty-second notes', () => {
    expect(times(build({ grid: { 1: 'x'.padEnd(32, '.') } }), 1)).toEqual([0])
  })

  it('places consecutive sixteenths a quarter beat apart', () => {
    expect(times(build({ grid: { 1: 'xxxx' + '.'.repeat(12) } }), 1)).toEqual([0, 0.25, 0.5, 0.75])
  })

  it('rejects a row length that is not 8, 16, or 32', () => {
    expect(() => build({ grid: { 1: 'x.x.' } })).toThrow(/4 steps \(want 8, 16, or 32\)/)
    expect(() => build({ grid: { 1: 'x'.repeat(12) } })).toThrow(/12 steps/)
  })

  it('names the offending pad and bar when a row is malformed', () => {
    expect(() => build({ bars: 2, grid: { 1: ['x.x.x.x.', 'xxx'] } })).toThrow(
      /pad 1 bar 2 has 3 steps/,
    )
  })
})

describe('beat dividers', () => {
  it('ignores | so rows can be written with visual bar lines', () => {
    const withPipes = build({ grid: { 1: 'x...|....|x...|....' } })
    const without = build({ grid: { 1: 'x.......x.......' } })
    expect(withPipes.events).toEqual(without.events)
  })

  it('counts row length after stripping dividers', () => {
    // 16 real steps plus 3 dividers must still be accepted.
    expect(() => build({ grid: { 1: 'x...|x...|x...|x...' } })).not.toThrow()
  })
})

describe('velocities', () => {
  it('maps each velocity character to its documented value', () => {
    const lesson = build({ grid: { 1: 'Xxosg...' } })
    expect(lesson.events.map((e) => e.vel)).toEqual([122, 102, 86, 70, 50])
  })

  it('treats . as a rest', () => {
    expect(build({ grid: { 1: '........' } }).events).toEqual([])
  })

  it('rejects an unknown velocity character', () => {
    expect(() => build({ grid: { 1: 'z.......' } })).toThrow(/unknown velocity char "z"/)
  })

  it('rejects an uppercase character that is not a velocity', () => {
    expect(() => build({ grid: { 1: 'O.......' } })).toThrow(/unknown velocity char "O"/)
  })
})

describe('bar repetition', () => {
  it('repeats a single row across every bar', () => {
    expect(times(build({ bars: 4, grid: { 1: 'x.......' } }), 1)).toEqual([0, 4, 8, 12])
  })

  it('cycles a shorter list of rows', () => {
    const lesson = build({ bars: 4, grid: { 1: ['x.......', '....x...'] } })
    expect(times(lesson, 1)).toEqual([0, 6, 8, 14])
  })

  it('uses each row once when the count matches', () => {
    const lesson = build({ bars: 2, grid: { 1: ['x.......', '..x.....'] } })
    expect(times(lesson, 1)).toEqual([0, 5])
  })

  it('ignores rows beyond the bar count', () => {
    const lesson = build({ bars: 1, grid: { 1: ['x.......', '..x.....'] } })
    expect(times(lesson, 1)).toEqual([0])
  })
})

describe('pad validation', () => {
  it('rejects a grid pad outside 1..padCount', () => {
    expect(() => build({ pads: { 9: 'kick' }, grid: { 9: 'x.......' } })).toThrow(
      /grid pad 9 outside 1\.\.8/,
    )
    expect(() => build({ pads: { 0: 'kick' }, grid: { 0: 'x.......' } })).toThrow(/outside 1\.\.8/)
  })

  it('rejects a grid pad with no sound mapping', () => {
    expect(() => build({ pads: { 1: 'kick' }, grid: { 1: 'x.......', 2: 'x.......' } })).toThrow(
      /grid pad 2 has no sound/,
    )
  })

  it('rejects a mapped pad that never plays', () => {
    // The validator would reject the output, so fail at authoring time instead.
    expect(() =>
      build({ pads: { 1: 'kick', 2: 'snare' }, grid: { 1: 'x.......' } }),
    ).toThrow(/pad 2 mapped in "pads" but absent from grid/)
  })

  it('allows the full pad range on a 16-pad lesson', () => {
    expect(() =>
      build({ padCount: 16, pads: { 16: 'bass' }, grid: { 16: 'x.......' } }),
    ).not.toThrow()
  })
})

describe('output shape', () => {
  it('sorts events by time, then by pad', () => {
    const lesson = build({
      pads: { 1: 'kick', 2: 'snare', 5: 'hatClosed' },
      grid: { 5: 'x.x.x.x.', 2: '....x...', 1: 'x.......' },
    })
    const keys = lesson.events.map((e) => [e.t, e.pad])
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]))
    expect(keys[0]).toEqual([0, 1])
    expect(keys[1]).toEqual([0, 5])
  })

  it('rounds times to 4 decimals so events land on a comparable grid', () => {
    const lesson = build({ grid: { 1: 'x'.repeat(32) } })
    for (const e of lesson.events) {
      expect(Number.isFinite(e.t)).toBe(true)
      expect(e.t).toBe(+e.t.toFixed(4))
    }
  })

  it('keeps every event inside the chart', () => {
    const lesson = build({ bars: 4, grid: { 1: 'x'.repeat(16) } })
    for (const e of lesson.events) {
      expect(e.t).toBeGreaterThanOrEqual(0)
      expect(e.t).toBeLessThan(lesson.bars * 4)
    }
  })

  it('passes the lesson metadata through unchanged', () => {
    const lesson = build({ grid: { 1: 'x.......' } })
    expect(lesson).toMatchObject({
      id: 'test',
      title: 'Test',
      course: 'foundations',
      genre: 'Test',
      level: 1,
      padCount: 8,
      bpm: 120,
      bars: 1,
    })
  })

  it('does not emit a duplicate event for one pad at one instant', () => {
    const lesson = build({ bars: 4, grid: { 1: 'x'.repeat(16) } })
    const keys = lesson.events.map((e) => `${e.t}|${e.pad}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('perform', () => {
  it('builds the full-kit final step the validator requires', () => {
    expect(perform('Whole kit')).toEqual({
      name: 'Perform',
      description: 'Whole kit',
      playerPads: 'all',
    })
  })
})
