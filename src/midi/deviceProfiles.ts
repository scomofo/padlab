// Pad mappings for known controllers. Anything unknown falls back to the
// generic chromatic profile, and MIDI Learn (DeviceSetup) can override any of it.

export interface DeviceProfile {
  id: string
  label: string
  padCount: 8 | 16
  matches: (inputName: string) => boolean
  /** MIDI note -> 1-based pad index, or null if the note isn't a pad. */
  noteToPad: (note: number) => number | null
}

export const AKAI_MPK_MINI_MK4: DeviceProfile = {
  id: 'mpk-mini-mk4',
  label: 'Akai MPK Mini MK4',
  padCount: 8,
  matches: (name) => /mpk\s*mini/i.test(name),
  // Factory pad banks: Bank A notes 36-43, Bank B notes 44-51 — both map to pads 1-8.
  noteToPad: (note) => {
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
  // Pads 1-16 send notes 36-51 in the MKII's MIDI pad mode.
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
