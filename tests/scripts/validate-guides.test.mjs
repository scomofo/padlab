import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { validateGuide } from '../../scripts/lib/validate.mjs'

const COURSE_IDS = new Set(['sp404-workshop', 'mpk-mini-workshop'])

function validGuide(over = {}) {
  return {
    id: 'test-guide',
    title: 'Test Guide',
    course: 'sp404-workshop',
    device: 'SP-404 MKII',
    blurb: 'A walkthrough.',
    padCount: 16,
    level: 2,
    minutes: 10,
    steps: [
      {
        title: 'Arm the pad',
        body: ['Hold REC.', 'Tap pad 1.'],
        keys: [['SHIFT', 'REC']],
        pads: [{ pad: 1, label: 'Source' }],
        checkpoint: 'The pad lights red.',
      },
      { title: 'Play it back', body: ['Tap pad 1 again.'] },
    ],
    ...over,
  }
}

const check = (over) => validateGuide(validGuide(over), { courseIds: COURSE_IDS })
const expectError = (over, pattern) => {
  const { errors } = check(over)
  expect(errors.some((e) => pattern.test(e)), `errors were: ${JSON.stringify(errors)}`).toBe(true)
}

describe('the baseline fixture', () => {
  it('passes with no errors and no warnings', () => {
    const { errors, warnings } = check({})
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
})

describe('metadata', () => {
  it.each([['uppercase', 'Test-Guide'], ['spaces', 'test guide'], ['empty', ''], ['missing', undefined]])(
    'rejects an id with %s',
    (_label, id) => expectError({ id }, /bad id/),
  )

  it('rejects a duplicate id', () => {
    const seenIds = new Set()
    const opts = { courseIds: COURSE_IDS, seenIds }
    expect(validateGuide(validGuide(), opts).errors).toEqual([])
    expect(validateGuide(validGuide(), opts).errors).toEqual(['duplicate id "test-guide"'])
  })

  it('rejects an unknown course', () => {
    expectError({ course: 'foundations-typo' }, /unknown course/)
  })

  it.each([
    ['title', /missing title/],
    ['device', /missing device/],
    ['blurb', /missing blurb/],
  ])('rejects a missing %s', (field, pattern) => {
    expectError({ [field]: '' }, pattern)
    expectError({ [field]: undefined }, pattern)
  })

  it.each([4, 12, undefined])('rejects padCount %s', (padCount) => {
    expectError({ padCount }, /padCount must be 8 or 16/)
  })

  it.each([0, 7, undefined])('rejects level %s', (level) => {
    expectError({ level }, /level .* out of range/)
  })

  it.each([0, 121, undefined])('rejects minutes %s', (minutes) => {
    expectError({ minutes }, /minutes .* out of range/)
  })

  it.each([1, 60, 120])('accepts minutes %s at the range edges', (minutes) => {
    expect(check({ minutes }).errors).toEqual([])
  })

  it('rejects an out-of-range bpm but allows it to be absent', () => {
    expectError({ bpm: 39 }, /bpm 39 out of range/)
    expectError({ bpm: 221 }, /bpm 221 out of range/)
    expect(check({ bpm: undefined }).errors).toEqual([])
    expect(check({ bpm: 90 }).errors).toEqual([])
  })
})

describe('steps', () => {
  it('rejects a guide with fewer than two steps', () => {
    expectError({ steps: [validGuide().steps[0]] }, /only 1 steps/)
  })

  it('rejects a step with no title', () => {
    const steps = validGuide().steps
    steps[1] = { ...steps[1], title: '' }
    expectError({ steps }, /step 2 missing title/)
  })

  it.each([
    ['an empty array', []],
    ['a non-array', 'just a string'],
    ['nothing', undefined],
  ])('rejects a step whose body is %s', (_label, body) => {
    const steps = validGuide().steps
    steps[1] = { ...steps[1], body }
    expectError({ steps }, /step 2 has no body lines/)
  })

  it('rejects a blank body line', () => {
    const steps = validGuide().steps
    steps[1] = { ...steps[1], body: ['Fine.', '   '] }
    expectError({ steps }, /step 2 body line 2 is empty/)
  })

  it('rejects a non-string body line', () => {
    const steps = validGuide().steps
    steps[1] = { ...steps[1], body: ['Fine.', 42] }
    expectError({ steps }, /step 2 body line 2 is empty/)
  })
})

describe('key combos', () => {
  it('rejects an empty keys array', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], keys: [] }
    expectError({ steps }, /step 1 keys must be a non-empty array/)
  })

  it('rejects an empty combo', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], keys: [[]] }
    expectError({ steps }, /step 1 key combo 1 is empty/)
  })

  it('rejects a blank key inside a combo', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], keys: [['SHIFT', '  ']] }
    expectError({ steps }, /step 1 key combo 1 has an empty key/)
  })

  it('warns when no step documents a button press', () => {
    const steps = validGuide().steps.map(({ keys, ...rest }) => rest)
    const { errors, warnings } = check({ steps })
    expect(errors).toEqual([])
    expect(warnings.some((w) => /no step documents a button press/.test(w))).toBe(true)
  })
})

describe('pad highlights', () => {
  it('rejects a pad outside 1..padCount', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: [{ pad: 17, label: 'Nope' }] }
    expectError({ steps }, /step 1 pad 17 outside 1\.\.16/)
  })

  it('respects an 8-pad guide’s narrower range', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: [{ pad: 9, label: 'Nope' }] }
    expectError({ steps, padCount: 8 }, /step 1 pad 9 outside 1\.\.8/)
  })

  it('rejects a pad with no label', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: [{ pad: 1, label: '' }] }
    expectError({ steps }, /step 1 pad 1 has no label/)
  })

  it('rejects the same pad listed twice in one step', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: [{ pad: 1, label: 'A' }, { pad: 1, label: 'B' }] }
    expectError({ steps }, /step 1 lists pad 1 twice/)
  })

  it('rejects pads that is not an array', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: { pad: 1, label: 'A' } }
    expectError({ steps }, /step 1 pads must be an array/)
  })

  it('warns about a label long enough to clip in the diagram', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: [{ pad: 1, label: 'A very long label' }] }
    const { errors, warnings } = check({ steps })
    expect(errors).toEqual([])
    expect(warnings.some((w) => /may clip in the diagram/.test(w))).toBe(true)
  })

  it('accepts a label at exactly the 12-character limit', () => {
    const steps = validGuide().steps
    steps[0] = { ...steps[0], pads: [{ pad: 1, label: 'A'.repeat(12) }] }
    expect(check({ steps }).warnings).toEqual([])
  })
})

describe('the shipped guide library', () => {
  const DATA_DIR = join(process.cwd(), 'src', 'guides', 'data')
  const courseIds = new Set(
    JSON.parse(readFileSync(join(process.cwd(), 'src', 'lessons', 'courses.json'), 'utf8'))
      .map((c) => c.id),
  )
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))
  const seenIds = new Set()

  it('has guides to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s is valid', (file) => {
    const guide = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
    expect(validateGuide(guide, { courseIds, seenIds }).errors).toEqual([])
  })

  it('names each guide file after its id', () => {
    for (const file of files) {
      const guide = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
      expect(`${guide.id}.json`).toBe(file)
    }
  })
})
