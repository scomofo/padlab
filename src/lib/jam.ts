export const JAM_BEATS = 16
export const MAX_JAM_NOTES = 1024

export interface JamNote {
  /** Position within the four-bar loop, in beats. */
  t: number
  pad: number
  vel: number
}

export interface JamSketch {
  name: string
  bpm: number
  snap: boolean
  notes: JamNote[]
  mutedPads: number[]
}

export function createEmptyJam(): JamSketch {
  return { name: 'My first groove', bpm: 96, snap: true, notes: [], mutedPads: [] }
}

/** One note per pad/position: an overdub replaces that note's velocity. */
export function normalizeJamNotes(notes: readonly JamNote[]): JamNote[] {
  const unique = new Map<string, JamNote>()
  for (const note of notes) {
    if (!note || typeof note !== 'object' || !Number.isFinite(note.t) || note.t < 0 || note.t >= JAM_BEATS
      || !Number.isInteger(note.pad) || note.pad < 1 || note.pad > 16
      || !Number.isFinite(note.vel) || note.vel < 1 || note.vel > 127) continue
    const t = Math.min(JAM_BEATS - 0.000001, Math.round(note.t * 1e6) / 1e6)
    const key = `${t}|${note.pad}`
    if (!unique.has(key) && unique.size >= MAX_JAM_NOTES) continue
    unique.set(key, { t, pad: note.pad, vel: Math.round(note.vel) })
  }
  return [...unique.values()].sort((a, b) => a.t - b.t || a.pad - b.pad)
}

/** Salvage valid parts of an older or partially damaged local sketch. */
export function sanitizeJamSketch(value: unknown): JamSketch {
  const fallback = createEmptyJam()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const raw = value as Record<string, unknown>
  return {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : fallback.name,
    bpm: typeof raw.bpm === 'number' && Number.isFinite(raw.bpm)
      ? Math.max(60, Math.min(180, Math.round(raw.bpm))) : fallback.bpm,
    snap: typeof raw.snap === 'boolean' ? raw.snap : fallback.snap,
    notes: Array.isArray(raw.notes) ? normalizeJamNotes(raw.notes) : [],
    mutedPads: Array.isArray(raw.mutedPads) ? [...new Set(raw.mutedPads.filter(
      (pad): pad is number => Number.isInteger(pad) && pad >= 1 && pad <= 16,
    ))].sort((a, b) => a - b) : [],
  }
}
