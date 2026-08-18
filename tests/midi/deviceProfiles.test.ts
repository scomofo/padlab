import { describe, expect, it } from 'vitest'
import {
  AKAI_MPK_MINI_MK4,
  GENERIC,
  PROFILES,
  ROLAND_SP404_MK2,
  profileForInput,
} from '../../src/midi/deviceProfiles'

describe('AKAI_MPK_MINI_MK4', () => {
  it('maps bank A notes 36-43 to pads 1-8', () => {
    for (let n = 36; n <= 43; n++) expect(AKAI_MPK_MINI_MK4.noteToPad(n)).toBe(n - 35)
  })

  it('folds bank B notes 44-51 onto the same pads 1-8', () => {
    for (let n = 44; n <= 51; n++) expect(AKAI_MPK_MINI_MK4.noteToPad(n)).toBe(n - 43)
  })

  it('rejects notes just outside both banks', () => {
    expect(AKAI_MPK_MINI_MK4.noteToPad(35)).toBeNull()
    expect(AKAI_MPK_MINI_MK4.noteToPad(52)).toBeNull()
    expect(AKAI_MPK_MINI_MK4.noteToPad(0)).toBeNull()
    expect(AKAI_MPK_MINI_MK4.noteToPad(127)).toBeNull()
  })

  it('never produces a pad outside its declared padCount', () => {
    for (let n = 0; n <= 127; n++) {
      const pad = AKAI_MPK_MINI_MK4.noteToPad(n)
      if (pad !== null) {
        expect(pad).toBeGreaterThanOrEqual(1)
        expect(pad).toBeLessThanOrEqual(AKAI_MPK_MINI_MK4.padCount)
      }
    }
  })

  it('matches its device name in the forms drivers report', () => {
    for (const name of ['MPK Mini MK4', 'mpk mini', 'MPKmini', 'Akai MPK Mini Mk4 MIDI 1']) {
      expect(AKAI_MPK_MINI_MK4.matches(name)).toBe(true)
    }
    expect(AKAI_MPK_MINI_MK4.matches('SP-404 MKII')).toBe(false)
  })
})

describe('ROLAND_SP404_MK2', () => {
  it('maps notes 36-51 to pads 1-16', () => {
    for (let n = 36; n <= 51; n++) expect(ROLAND_SP404_MK2.noteToPad(n)).toBe(n - 35)
  })

  it('rejects notes outside the pad range', () => {
    expect(ROLAND_SP404_MK2.noteToPad(35)).toBeNull()
    expect(ROLAND_SP404_MK2.noteToPad(52)).toBeNull()
  })

  it('never produces a pad outside its declared padCount', () => {
    for (let n = 0; n <= 127; n++) {
      const pad = ROLAND_SP404_MK2.noteToPad(n)
      if (pad !== null) {
        expect(pad).toBeGreaterThanOrEqual(1)
        expect(pad).toBeLessThanOrEqual(ROLAND_SP404_MK2.padCount)
      }
    }
  })

  it('matches hyphenated and unhyphenated device names', () => {
    for (const name of ['SP-404 MKII', 'SP404MK2', 'Roland SP-404MKII']) {
      expect(ROLAND_SP404_MK2.matches(name)).toBe(true)
    }
    expect(ROLAND_SP404_MK2.matches('MPK Mini')).toBe(false)
  })
})

describe('GENERIC', () => {
  it('matches anything, including an empty name', () => {
    expect(GENERIC.matches('')).toBe(true)
    expect(GENERIC.matches('Some Unknown Controller')).toBe(true)
  })

  it('wraps every note in 0-127 into pads 1-16 so unknown gear is playable', () => {
    for (let n = 0; n <= 127; n++) {
      const pad = GENERIC.noteToPad(n)
      expect(pad).toBeGreaterThanOrEqual(1)
      expect(pad).toBeLessThanOrEqual(16)
    }
  })

  it('anchors note 36 at pad 1, like the dedicated profiles', () => {
    expect(GENERIC.noteToPad(36)).toBe(1)
    expect(GENERIC.noteToPad(51)).toBe(16)
    expect(GENERIC.noteToPad(52)).toBe(1) // wraps
  })

  /**
   * Deliberate ("wrap any note into 16 pads so unknown gear is playable out of
   * the box") but worth stating: on an unrecognised device the keybed and
   * transport buttons all trigger drum sounds. MIDI Learn is the documented
   * escape hatch — see midiManager.test.ts.
   */
  it('never rejects a note, so non-pad keys also fire sounds', () => {
    for (const n of [0, 24, 60, 127]) expect(GENERIC.noteToPad(n)).not.toBeNull()
  })
})

describe('profileForInput', () => {
  it('picks the specific profile over the catch-all', () => {
    expect(profileForInput('MPK Mini MK4').id).toBe('mpk-mini-mk4')
    expect(profileForInput('SP-404 MKII').id).toBe('sp404-mk2')
  })

  it('falls back to generic for unknown gear', () => {
    expect(profileForInput('Novation Launchpad').id).toBe('generic')
    expect(profileForInput('').id).toBe('generic')
  })

  it('always resolves to some profile', () => {
    for (const name of ['', 'x', 'MIDI Device 1', '???']) {
      expect(PROFILES).toContain(profileForInput(name))
    }
  })

  it('orders GENERIC last, or it would shadow every other profile', () => {
    expect(PROFILES[PROFILES.length - 1]).toBe(GENERIC)
  })
})
