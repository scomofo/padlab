import { createEmptyJam, sanitizeJamSketch, type JamSketch } from '../lib/jam'

const KEY = 'padlab-jam-v1'

export function loadJam(): JamSketch {
  try {
    if (typeof localStorage === 'undefined') return createEmptyJam()
    const stored = localStorage.getItem(KEY)
    if (!stored || stored.length > 512_000) return createEmptyJam()
    const value = JSON.parse(stored)
    return value?.version === 1 ? sanitizeJamSketch(value) : createEmptyJam()
  } catch {
    return createEmptyJam()
  }
}

/** The UI must only claim the sketch is saved when this returns true. */
export function saveJam(sketch: JamSketch): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ...sanitizeJamSketch(sketch) }))
    return true
  } catch {
    return false
  }
}
