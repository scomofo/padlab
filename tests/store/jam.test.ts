/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyJam, MAX_JAM_NOTES, normalizeJamNotes, sanitizeJamSketch, type JamNote } from '../../src/lib/jam'
import { loadJam, saveJam } from '../../src/store/jam'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('Jam notes and saved sketches', () => {
  it('keeps chords, timing and velocity, replacing duplicate overdub positions without mutating input', () => {
    const notes = [{ t: 8.123456, pad: 2, vel: 43 }, { t: 0, pad: 1, vel: 80 },
      { t: 0, pad: 2, vel: 127 }, { t: 0, pad: 1, vel: 110 }]
    const original = structuredClone(notes)
    expect(normalizeJamNotes(notes)).toEqual([
      { t: 0, pad: 1, vel: 110 }, { t: 0, pad: 2, vel: 127 }, { t: 8.123456, pad: 2, vel: 43 },
    ])
    expect(notes).toEqual(original)
  })

  it('rejects invalid events without moving them onto the downbeat', () => {
    const invalid = [null, {}, { t: NaN, pad: 1, vel: 100 }, { t: Infinity, pad: 1, vel: 100 },
      { t: -0.1, pad: 1, vel: 100 }, { t: 16, pad: 1, vel: 100 }, { t: 0, pad: 17, vel: 100 },
      { t: 0, pad: 1.5, vel: 100 }, { t: 0, pad: 1, vel: 0 }, { t: 0, pad: 1, vel: 128 },
      { t: '0', pad: 1, vel: 100 }]
    expect(normalizeJamNotes(invalid as JamNote[])).toEqual([])
  })

  it('bounds notes while still allowing velocity replacement at capacity', () => {
    const notes = Array.from({ length: MAX_JAM_NOTES + 1 }, (_, i) => ({ t: i / 100, pad: 1, vel: 90 }))
    notes.push({ t: 0, pad: 1, vel: 60 })
    const normalized = normalizeJamNotes(notes)
    expect(normalized).toHaveLength(MAX_JAM_NOTES)
    expect(normalized[0].vel).toBe(60)
  })

  it('round-trips the complete sketch with silent tracks and free timing', () => {
    const sketch = { ...createEmptyJam(), name: 'Night drive', bpm: 112, snap: false,
      notes: [{ t: 3.1875, pad: 16, vel: 57 }], mutedPads: [16] }
    expect(saveJam(sketch)).toBe(true)
    expect(loadJam()).toEqual(sketch)
    expect(localStorage.getItem('padlab-profile-v1')).toBeNull()
    expect(localStorage.getItem('padlab-progress-v1')).toBeNull()
  })

  it('salvages valid notes and sanitizes settings from partial storage', () => {
    const clean = sanitizeJamSketch({ name: 'x'.repeat(80), bpm: 200, snap: 'yes',
      notes: [{ t: 1, pad: 3, vel: 70 }, null], mutedPads: [3, 3, 17, '2', null, 1] })
    expect(clean).toEqual({ name: 'x'.repeat(60), bpm: 180, snap: true,
      notes: [{ t: 1, pad: 3, vel: 70 }], mutedPads: [1, 3] })
    expect(sanitizeJamSketch({ bpm: NaN }).bpm).toBe(96)
  })

  it.each(['broken json', 'null', '{"version":2}', '[]'])('opens safely after malformed or unsupported storage: %s', (stored) => {
    localStorage.setItem('padlab-jam-v1', stored)
    expect(loadJam()).toEqual(createEmptyJam())
  })

  it('reports unavailable persistence rather than claiming a save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    expect(saveJam(createEmptyJam())).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable') })
    expect(loadJam()).toEqual(createEmptyJam())
  })
})
