// Pad mappings for known controllers. Anything unknown falls back to the
// generic chromatic profile, and MIDI Learn (DeviceSetup) can override any of it.

export interface DeviceProfile {
  id: string
  label: string
  padCount: 8 | 16
  matches: (inputName: string) => boolean
  /**
   * MIDI note -> 1-based pad index, or null if the note isn't a pad.
   * `channel` is the 0-based MIDI channel (display channel minus one); profiles
   * for controllers that share one port between pads and other controls use it
   * to keep those controls from triggering pads.
   */
  noteToPad: (note: number, channel: number) => number | null
}

/**
 * The MPK's keybed shares the USB port with the pads and its factory channel
 * is 1 (0-based 0), while the pads ship on channel 10. The keybed's lower
 * octaves overlap the Bank B note range, so without a channel check playing
 * low keys would score phantom pad hits. Excluding the keybed's factory
 * channel — rather than requiring the pads' — keeps pads working on units
 * whose pad channel was reassigned; anyone who moved the *keybed* off
 * channel 1 is on a custom program and has MIDI Learn.
 */
const MPK_KEYBED_CHANNEL = 0

export const AKAI_MPK_MINI_MK4: DeviceProfile = {
  id: 'mpk-mini-mk4',
  label: 'Akai MPK Mini MK4',
  padCount: 8,
  matches: (name) => /mpk\s*mini/i.test(name),
  // Factory pad banks: Bank A notes 36-43, Bank B notes 44-51 — both map to pads 1-8.
  noteToPad: (note, channel) => {
    if (channel === MPK_KEYBED_CHANNEL) return null
    if (note >= 36 && note <= 43) return note - 35
    if (note >= 44 && note <= 51) return note - 43
    return null
  },
}

export const ROLAND_SP404_MK2: DeviceProfile = {
  id: 'sp404-mk2',
  label: 'Roland SP-404 MKII',
  padCount: 16,
  matches: (name) => /sp-?404/i.test(name),
  // Pads 1-16 send notes 36-51 in the MKII's MIDI pad mode. No keybed shares
  // the port, so the channel doesn't matter: knobs send CC, already filtered.
  noteToPad: (note) => (note >= 36 && note <= 51 ? note - 35 : null),
}

export const GENERIC: DeviceProfile = {
  id: 'generic',
  label: 'Generic controller',
  padCount: 16,
  // Wrap any note into 16 pads so unknown gear is playable out of the box.
  noteToPad: (note) => ((((note - 36) % 16) + 16) % 16) + 1,
  matches: () => true,
}

export const PROFILES: DeviceProfile[] = [AKAI_MPK_MINI_MK4, ROLAND_SP404_MK2, GENERIC]

export function profileForInput(inputName: string): DeviceProfile {
  return PROFILES.find((p) => p.matches(inputName)) ?? GENERIC
}
