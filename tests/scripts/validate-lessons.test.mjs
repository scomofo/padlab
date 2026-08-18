// Every rule in the validator is a claim ("we reject 4 simultaneous notes").
// None of them was verified — the validator is the only gate on lesson content,
// and nobody had shown it actually fails on a bad chart. Each test below breaks
// exactly one rule and asserts that rule fires.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DIFFICULTY, MAX_EVENTS_BY_LEVEL, validateLesson } from '../../scripts/lib/validate.mjs'

const COURSE_IDS = new Set(['foundations', 'technique'])

/** A minimal chart that passes every rule cleanly. Tests break one thing at a time. */
function validLesson(over = {}) {
  return {
    id: 'test-lesson',
    title: 'Test Lesson',
    course: 'foundations',
    genre: 'Test',
    level: 1,
    padCount: 8,
    bpm: 120,
    bars: 4,
    pads: { 1: 'kick', 2: 'snare' },
    steps: [
      { name: 'Kick', playerPads: [1] },
      { name: 'Snare', playerPads: [2] },
      { name: 'Perform', playerPads: 'all' },
    ],
    events: [
      { t: 0, pad: 1 }, { t: 2, pad: 2 }, { t: 4, pad: 1 }, { t: 6, pad: 2 },
      { t: 8, pad: 1 }, { t: 10, pad: 2 }, { t: 12, pad: 1 }, { t: 14, pad: 2 },
    ],
    ...over,
  }
}

const check = (over) => validateLesson(validLesson(over), { courseIds: COURSE_IDS })
/** Assert exactly one rule fired, and that it is the expected one. */
const expectError = (over, pattern) => {
  const { errors } = check(over)
  expect(errors).toHaveLength(1)
  expect(errors[0]).toMatch(pattern)
}
const expectWarning = (over, pattern) => {
  const { errors, warnings } = check(over)
  expect(errors).toEqual([])
  expect(warnings.some((w) => pattern.test(w))).toBe(true)
}

describe('the baseline fixture', () => {
  it('passes with no errors and no warnings', () => {
    const { errors, warnings } = check({})
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
})

describe('identity and metadata', () => {
  it.each([
    ['uppercase', 'Test-Lesson'],
    ['spaces', 'test lesson'],
    ['underscores', 'test_lesson'],
    ['empty', ''],
    ['missing', undefined],
  ])('rejects an id with %s', (_label, id) => {
    expectError({ id }, /bad id/)
  })

  it('rejects a duplicate id across files', () => {
    const seenIds = new Set()
    const opts = { courseIds: COURSE_IDS, seenIds }
    expect(validateLesson(validLesson(), opts).errors).toEqual([])
    expect(validateLesson(validLesson(), opts).errors).toEqual(['duplicate id "test-lesson"'])
  })

  it('rejects a course that is not in courses.json', () => {
    expectError({ course: 'nonexistent' }, /unknown course "nonexistent"/)
  })

  it('rejects a missing title', () => {
    expectError({ title: '' }, /missing title/)
    expectError({ title: undefined }, /missing title/)
  })

  it.each([4, 12, 32, undefined])('rejects padCount %s', (padCount) => {
    const { errors } = check({ padCount })
    expect(errors.some((e) => /padCount must be 8 or 16/.test(e))).toBe(true)
  })

  it.each([59, 181, 0, undefined])('rejects bpm %s', (bpm) => {
    const { errors } = check({ bpm })
    expect(errors.some((e) => /bpm .* out of range/.test(e))).toBe(true)
  })

  it.each([60, 120, 180])('accepts bpm %s at the edges of the range', (bpm) => {
    expect(check({ bpm }).errors).toEqual([])
  })

  it.each([2, 6, 12, undefined])('rejects bars %s', (bars) => {
    const { errors } = check({ bars })
    expect(errors.some((e) => /bars .* not in 4\/8\/16/.test(e))).toBe(true)
  })

  it.each([0, 7, undefined])('rejects level %s', (level) => {
    const { errors } = check({ level })
    expect(errors.some((e) => /level .* out of range/.test(e))).toBe(true)
  })
})

describe('pad mapping', () => {
  it('rejects a pads key above padCount', () => {
    expectError(
      { pads: { 1: 'kick', 2: 'snare', 9: 'crash' }, },
      /pads key 9 outside 1\.\.8/,
    )
  })

  it('rejects a pads key below 1', () => {
    const { errors } = check({ pads: { 0: 'kick', 1: 'kick', 2: 'snare' } })
    expect(errors.some((e) => /pads key 0 outside 1\.\.8/.test(e))).toBe(true)
  })

  it('rejects a sound the synth does not have', () => {
    expectError({ pads: { 1: 'kick', 2: 'tambourine' } }, /pad 2 has unknown sound "tambourine"/)
  })

  it('accepts all 16 documented sounds', () => {
    for (const sound of ['kick', 'snare', 'clap', 'rimshot', 'hatClosed', 'hatOpen', 'shaker',
      'crash', 'ride', 'tomLow', 'tomMid', 'tomHigh', 'cowbell', 'perc', 'stab', 'bass']) {
      const { errors } = check({ pads: { 1: sound, 2: 'snare' } })
      expect(errors, `sound ${sound}`).toEqual([])
    }
  })
})

describe('events', () => {
  it('rejects an event on a pad with no sound mapping', () => {
    expectError(
      { events: [...validLesson().events, { t: 1, pad: 5 }] },
      /event at t=1 uses unmapped pad 5/,
    )
  })

  it('rejects an event past the end of the chart', () => {
    expectError({ events: [...validLesson().events, { t: 16, pad: 1 }] }, /outside \[0, 16\)/)
  })

  it('rejects a negative event time', () => {
    expectError({ events: [...validLesson().events, { t: -1, pad: 1 }] }, /outside \[0, 16\)/)
  })

  it('warns about an event off the 32nd-note grid', () => {
    expectWarning({ events: [...validLesson().events, { t: 1.1, pad: 1 }] }, /not on a 32nd grid/)
  })

  it.each([0, 128, -5])('rejects velocity %s', (vel) => {
    expectError({ events: [...validLesson().events, { t: 1, pad: 1, vel }] }, /vel .* out of range/)
  })

  it.each([1, 100, 127])('accepts velocity %s', (vel) => {
    expect(check({ events: [...validLesson().events, { t: 1, pad: 1, vel }] }).errors).toEqual([])
  })

  it('rejects two events on the same pad at the same instant', () => {
    // Trips two rules at once — it is both a duplicate and a zero-length gap.
    const { errors } = check({ events: [...validLesson().events, { t: 0, pad: 1 }] })
    expect(errors.some((e) => /duplicate event pad 1 at t=0/.test(e))).toBe(true)
    expect(errors.some((e) => /pad 1 events only 0\.000 beats apart/.test(e))).toBe(true)
  })

  it('rejects more than three notes at once as unplayable', () => {
    const lesson = validLesson({
      pads: { 1: 'kick', 2: 'snare', 3: 'clap', 4: 'rimshot' },
      level: 3, // level 3 has no "busy" warning, isolating the error
      events: [
        { t: 0, pad: 1 }, { t: 0, pad: 2 }, { t: 0, pad: 3 }, { t: 0, pad: 4 },
        { t: 4, pad: 1 }, { t: 6, pad: 2 }, { t: 8, pad: 1 }, { t: 10, pad: 2 },
      ],
      steps: [
        { name: 'A', playerPads: [1] },
        { name: 'B', playerPads: [2] },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const { errors } = validateLesson(lesson, { courseIds: COURSE_IDS })
    expect(errors.some((e) => /4 simultaneous notes at t=0.0000 — unplayable/.test(e))).toBe(true)
  })

  it('warns about three notes at once on a beginner chart', () => {
    const events = [
      { t: 0, pad: 1 }, { t: 0, pad: 2 }, { t: 0, pad: 3 },
      { t: 4, pad: 1 }, { t: 6, pad: 2 }, { t: 8, pad: 1 }, { t: 10, pad: 2 }, { t: 12, pad: 1 },
    ]
    const beginner = validateLesson(
      validLesson({ level: 2, pads: { 1: 'kick', 2: 'snare', 3: 'clap' }, events }),
      { courseIds: COURSE_IDS },
    )
    expect(beginner.warnings.some((w) => /3 simultaneous notes/.test(w))).toBe(true)

    // ...but not on an advanced one.
    const advanced = validateLesson(
      validLesson({ level: 3, pads: { 1: 'kick', 2: 'snare', 3: 'clap' }, events }),
      { courseIds: COURSE_IDS },
    )
    expect(advanced.warnings.some((w) => /3 simultaneous notes/.test(w))).toBe(false)
  })

  it('rejects two notes on one pad closer than a 32nd apart', () => {
    expectError(
      { events: [...validLesson().events, { t: 0.0625, pad: 1 }] },
      /pad 1 events only 0\.063 beats apart/,
    )
  })

  it('accepts notes exactly a 32nd apart', () => {
    expect(check({ events: [...validLesson().events, { t: 0.125, pad: 1 }] }).errors).toEqual([])
  })

  it('rejects a chart with fewer than 8 events', () => {
    expectError(
      {
        events: [{ t: 0, pad: 1 }, { t: 4, pad: 2 }],
        steps: [
          { name: 'A', playerPads: [1] },
          { name: 'B', playerPads: [2] },
          { name: 'Perform', playerPads: 'all' },
        ],
      },
      /only 2 events/,
    )
  })
})

describe('steps', () => {
  it.each([
    ['too few', [{ name: 'Perform', playerPads: 'all' }]],
    ['too many', Array.from({ length: 6 }, (_, i) => ({
      name: `S${i}`,
      playerPads: i === 5 ? 'all' : [1],
    }))],
  ])('rejects %s steps', (_label, steps) => {
    const { errors } = check({ steps })
    expect(errors.some((e) => /steps \(want 3-5\)/.test(e))).toBe(true)
  })

  it('requires the final step to be the full kit', () => {
    expectError(
      {
        steps: [
          { name: 'A', playerPads: [1] },
          { name: 'B', playerPads: [2] },
          { name: 'C', playerPads: [1, 2] },
        ],
      },
      /final step must have playerPads "all"/,
    )
  })

  it('rejects an empty playerPads array', () => {
    expectError(
      {
        steps: [
          { name: 'A', playerPads: [] },
          { name: 'B', playerPads: [2] },
          { name: 'Perform', playerPads: 'all' },
        ],
      },
      /step 1 playerPads must be a non-empty array or "all"/,
    )
  })

  it('rejects a step pointing at a pad with no events', () => {
    expectError(
      {
        steps: [
          { name: 'A', playerPads: [7] },
          { name: 'B', playerPads: [2] },
          { name: 'Perform', playerPads: 'all' },
        ],
      },
      /step 1 references pad 7 with no events/,
    )
  })

  it.each([0.4, 1.1, 2])('rejects tempoScale %s', (tempoScale) => {
    expectError(
      {
        steps: [
          { name: 'A', playerPads: [1], tempoScale },
          { name: 'B', playerPads: [2] },
          { name: 'Perform', playerPads: 'all' },
        ],
      },
      /tempoScale .* out of range/,
    )
  })

  it.each([0.5, 0.75, 1])('accepts tempoScale %s', (tempoScale) => {
    expect(
      check({
        steps: [
          { name: 'A', playerPads: [1], tempoScale },
          { name: 'B', playerPads: [2] },
          { name: 'Perform', playerPads: 'all' },
        ],
      }).errors,
    ).toEqual([])
  })
})

describe('difficulty ceilings', () => {
  /** A steady stream on one pad, which the difficulty model discounts. */
  const streamLesson = (over = {}) => validLesson({
    pads: { 1: 'kick' },
    steps: [
      { name: 'A', playerPads: [1] },
      { name: 'B', playerPads: [1] },
      { name: 'Perform', playerPads: 'all' },
    ],
    ...over,
  })

  it('rejects a chart denser than its level allows', () => {
    const events = []
    for (let t = 0; t < 16; t += 0.25) events.push({ t, pad: 1 })
    const { errors } = validateLesson(streamLesson({ level: 1, events }), { courseIds: COURSE_IDS })
    expect(errors.some((e) => /effective hits\/sec exceeds the level 1 ceiling of 2\.4/.test(e))).toBe(true)
  })

  it('accepts the same chart at a level whose ceiling allows it', () => {
    const events = []
    for (let t = 0; t < 16; t += 0.25) events.push({ t, pad: 1 })
    const { errors } = validateLesson(streamLesson({ level: 3, events }), { courseIds: COURSE_IDS })
    expect(errors.filter((e) => /exceeds the level/.test(e))).toEqual([])
  })

  it('rejects too many two-handed hits for a beginner level', () => {
    const events = [
      { t: 0, pad: 1 }, { t: 0, pad: 2 },
      { t: 4, pad: 1 }, { t: 4, pad: 2 },
      { t: 8, pad: 1 }, { t: 8, pad: 2 },
      { t: 12, pad: 1 }, { t: 12, pad: 2 },
    ]
    const { errors } = validateLesson(validLesson({ level: 1, events }), { courseIds: COURSE_IDS })
    expect(errors.some((e) => /100% of hits need two pads at once \(level 1 allows 25%\)/.test(e))).toBe(true)
  })

  it('warns when a chart is too easy for its level', () => {
    // The floor is the ceiling two levels down; level 3's floor is level 1's 2.4.
    const { warnings } = validateLesson(validLesson({ level: 3 }), { courseIds: COURSE_IDS })
    expect(warnings.some((w) => /below the level 1 ceiling of 2\.4 — too easy for level 3/.test(w))).toBe(true)
  })

  it('does not apply a floor to levels 1 and 2, which have none below them', () => {
    for (const level of [1, 2]) {
      const { warnings } = validateLesson(validLesson({ level }), { courseIds: COURSE_IDS })
      expect(warnings.filter((w) => /too easy/.test(w))).toEqual([])
    }
  })

  it('warns when a chart exceeds the per-level soft note cap', () => {
    const events = []
    for (let t = 0; t < 64; t += 0.5) events.push({ t, pad: 1 })
    expect(events.length).toBeGreaterThan(MAX_EVENTS_BY_LEVEL[1])
    const { errors, warnings } = validateLesson(
      streamLesson({ level: 1, bars: 16, events }),
      { courseIds: COURSE_IDS },
    )
    expect(errors).toEqual([])
    expect(warnings.some((w) => /events is dense for level 1 \(soft cap 110\)/.test(w))).toBe(true)
  })

  it('keeps the level ceilings monotonically increasing', () => {
    const levels = Object.keys(DIFFICULTY).map(Number).sort((a, b) => a - b)
    for (let i = 1; i < levels.length; i++) {
      expect(DIFFICULTY[levels[i]].hitsPerSec).toBeGreaterThan(DIFFICULTY[levels[i - 1]].hitsPerSec)
      expect(MAX_EVENTS_BY_LEVEL[levels[i]]).toBeGreaterThan(MAX_EVENTS_BY_LEVEL[levels[i - 1]])
    }
  })
})

describe('the shipped lesson library', () => {
  const DATA_DIR = join(process.cwd(), 'src', 'lessons', 'data')
  const courseIds = new Set(
    JSON.parse(readFileSync(join(process.cwd(), 'src', 'lessons', 'courses.json'), 'utf8'))
      .map((c) => c.id),
  )
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))
  const seenIds = new Set()

  it('has lessons to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s is valid', (file) => {
    const lesson = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
    expect(validateLesson(lesson, { courseIds, seenIds }).errors).toEqual([])
  })

  it('names each lesson file after its id', () => {
    for (const file of files) {
      const lesson = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
      expect(`${lesson.id}.json`).toBe(file)
    }
  })
})
