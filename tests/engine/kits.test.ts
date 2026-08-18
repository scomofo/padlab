import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KIT_8,
  DEFAULT_KIT_16,
  PAD_COLORS,
  padColor,
  padSoundFor,
} from '../../src/engine/kits'
import { SOUND_NAMES } from '../../src/engine/types'
import { makeLesson } from '../helpers/chart'

describe('default kits', () => {
  it('have one sound per pad', () => {
    expect(DEFAULT_KIT_8).toHaveLength(8)
    expect(DEFAULT_KIT_16).toHaveLength(16)
  })

  it('only use sounds the synth knows about', () => {
    for (const s of [...DEFAULT_KIT_8, ...DEFAULT_KIT_16]) expect(SOUND_NAMES).toContain(s)
  })

  it('agree on the first 8 pads, so an 8-pad lesson sounds the same on 16-pad gear', () => {
    expect(DEFAULT_KIT_16.slice(0, 8)).toEqual(DEFAULT_KIT_8)
  })
})

describe('padSoundFor', () => {
  const lesson = makeLesson({ pads: { '1': 'kick', '2': 'clap', '5': 'shaker' } })

  it('prefers the lesson mapping over the default kit', () => {
    expect(padSoundFor(lesson, 8, 2)).toBe('clap') // default kit 8 has 'snare' here
    expect(padSoundFor(lesson, 8, 5)).toBe('shaker') // default has 'hatClosed'
  })

  it('falls back to the default kit for pads the lesson does not map', () => {
    expect(padSoundFor(lesson, 8, 4)).toBe(DEFAULT_KIT_8[3])
    expect(padSoundFor(lesson, 16, 12)).toBe(DEFAULT_KIT_16[11])
  })

  it('uses the default kit throughout when there is no lesson', () => {
    expect(padSoundFor(null, 8, 1)).toBe(DEFAULT_KIT_8[0])
    expect(padSoundFor(null, 16, 16)).toBe(DEFAULT_KIT_16[15])
  })

  it('returns null outside 1..padCount', () => {
    expect(padSoundFor(lesson, 8, 0)).toBeNull()
    expect(padSoundFor(lesson, 8, 9)).toBeNull()
    expect(padSoundFor(lesson, 16, 17)).toBeNull()
    expect(padSoundFor(lesson, 8, -1)).toBeNull()
  })

  it('respects padCount even when the lesson maps a higher pad', () => {
    // An 8-pad view of a 16-pad lesson must not sound pads the grid cannot show.
    const wide = makeLesson({ padCount: 16, pads: { '1': 'kick', '12': 'cowbell' } })
    expect(padSoundFor(wide, 16, 12)).toBe('cowbell')
    expect(padSoundFor(wide, 8, 12)).toBeNull()
  })

  it('resolves every pad in range to a real sound', () => {
    for (const padCount of [8, 16] as const) {
      for (let p = 1; p <= padCount; p++) {
        const sound = padSoundFor(null, padCount, p)
        expect(sound).not.toBeNull()
        expect(SOUND_NAMES).toContain(sound!)
      }
    }
  })
})

describe('padColor', () => {
  it('gives each of the 16 pads its own colour', () => {
    const colors = Array.from({ length: 16 }, (_, i) => padColor(i + 1))
    expect(new Set(colors).size).toBe(16)
  })

  it('is stable — the same pad always gets the same colour', () => {
    expect(padColor(3)).toBe(padColor(3))
  })

  it('wraps past the end of the palette instead of returning undefined', () => {
    expect(padColor(17)).toBe(PAD_COLORS[0])
    expect(padColor(33)).toBe(PAD_COLORS[0])
  })

  it('returns a usable colour for every pad a profile can emit', () => {
    for (let p = 1; p <= 16; p++) expect(padColor(p)).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
