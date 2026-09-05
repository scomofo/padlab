import type { LessonProgress } from '../engine/types'

const PROGRESS_KEY = 'padlab-progress-v1'
const GUIDES_KEY = 'padlab-guides-v1'
const SETTINGS_KEY = 'padlab-settings-v1'
const MIDIMAP_KEY = 'padlab-midimap-v1'

export interface Settings {
  latencyMs: number // subtracted from hit times to compensate input latency
  volume: number // 0-1
  metronome: boolean
}

const DEFAULT_SETTINGS: Settings = { latencyMs: 20, volume: 0.9, metronome: true }

// Bounds of the latency slider in DeviceSetup, which reads them from here so
// the control and the clamp below cannot drift apart. Stored numbers outside
// them are clamped rather than discarded, so a hand-edited value keeps its intent.
export const LATENCY_MIN = -50
export const LATENCY_MAX = 150

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — progress just won't persist
  }
}

/**
 * Everything below comes back from localStorage, which anything can write to,
 * so each shape is checked before it reaches arithmetic or the UI — the same
 * treatment `loadSettings` gives settings. A record whose value is unusable is
 * dropped (as if never saved); a salvageable field is clamped, not discarded.
 */
function sanitizeRecord<T>(stored: unknown, entry: (v: unknown) => T | null): Record<string, T> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(stored)) {
    const e = entry(v)
    if (e !== null) out[k] = e
  }
  return out
}

export function loadProgress(): Record<string, LessonProgress> {
  return sanitizeRecord<LessonProgress>(read<unknown>(PROGRESS_KEY), (v) => {
    if (typeof v !== 'object' || v === null) return null
    const p = v as Record<string, unknown>
    // A corrupt field would flow through Math.max on the next save and the
    // star totals in the browser; 0 (unearned) is the safe reading of garbage.
    const out: LessonProgress = {
      stars: Math.round(numberOr(p.stars, 0, 0, 3)),
      bestAccuracy: Math.round(numberOr(p.bestAccuracy, 0, 0, 100)),
    }
    const steps = sanitizeSteps(p.stepsDone)
    if (steps.length) out.stepsDone = steps
    const tempo = Math.round(numberOr(p.bestTempoPct, 100, 100, 120))
    if (tempo > 100) out.bestTempoPct = tempo
    return out
  })
}

/** Distinct small non-negative integers, sorted; anything else is dropped. */
function sanitizeSteps(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const set = new Set<number>()
  for (const x of v) {
    if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 100) set.add(x)
  }
  return [...set].sort((a, b) => a - b)
}

/** Record a completed practice step. Idempotent; the Perform step is saved via saveLessonResult. */
export function saveStepDone(lessonId: string, stepIndex: number): Record<string, LessonProgress> {
  const all = loadProgress()
  const prev = all[lessonId]
  const steps = sanitizeSteps([...(prev?.stepsDone ?? []), stepIndex])
  all[lessonId] = {
    bestAccuracy: prev?.bestAccuracy ?? 0,
    stars: prev?.stars ?? 0,
    ...(steps.length ? { stepsDone: steps } : {}),
    ...(prev?.bestTempoPct ? { bestTempoPct: prev.bestTempoPct } : {}),
  }
  write(PROGRESS_KEY, all)
  return all
}

/**
 * Save a Perform result. `tempoPct` above 100 with 3 stars raises the tempo
 * ladder's best rung; stars and accuracy are kept at their best regardless.
 */
export function saveLessonResult(
  lessonId: string,
  accuracy: number,
  stars: number,
  tempoPct = 100,
): Record<string, LessonProgress> {
  const all = loadProgress()
  const prev = all[lessonId]
  const ladder = stars >= 3 && tempoPct > 100
    ? Math.max(prev?.bestTempoPct ?? 100, Math.min(120, Math.round(tempoPct)))
    : prev?.bestTempoPct ?? 100
  all[lessonId] = {
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
    stars: Math.max(prev?.stars ?? 0, stars),
    ...(prev?.stepsDone?.length ? { stepsDone: prev.stepsDone } : {}),
    ...(ladder > 100 ? { bestTempoPct: ladder } : {}),
  }
  write(PROGRESS_KEY, all)
  return all
}

export interface GuideProgress {
  /** Highest step index the user has reached. */
  lastStep: number
  completed: boolean
}

export function loadGuideProgress(): Record<string, GuideProgress> {
  return sanitizeRecord<GuideProgress>(read<unknown>(GUIDES_KEY), (v) => {
    if (typeof v !== 'object' || v === null) return null
    const p = v as Record<string, unknown>
    // GuideViewer clamps the resume step to the guide's length, so the cap
    // here only needs to keep the number finite and non-negative.
    return {
      lastStep: Math.floor(numberOr(p.lastStep, 0, 0, 10_000)),
      completed: booleanOr(p.completed, false),
    }
  })
}

export function saveGuideProgress(
  guideId: string,
  lastStep: number,
  completed: boolean,
): Record<string, GuideProgress> {
  const all = loadGuideProgress()
  const prev = all[guideId]
  all[guideId] = {
    lastStep: Math.max(prev?.lastStep ?? 0, lastStep),
    completed: (prev?.completed ?? false) || completed,
  }
  write(GUIDES_KEY, all)
  return all
}

function numberOr(value: unknown, fallback: number, min: number, max: number): number {
  // Number.isFinite also rejects NaN and +/-Infinity, which are `typeof number`
  // but poison the beat arithmetic in PlayerRuntime just as badly as a string.
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Settings come back from localStorage, which anything can write to, so every
 * field is checked against its declared type before it reaches the timing maths
 * (`latencyMs`) or the audio graph (`volume`). Anything unusable falls back to
 * its default; anything out of range is clamped; unknown keys are dropped.
 */
export function loadSettings(): Settings {
  const stored = read<unknown>(SETTINGS_KEY)
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { ...DEFAULT_SETTINGS }
  }
  const s = stored as Record<string, unknown>
  return {
    latencyMs: numberOr(s.latencyMs, DEFAULT_SETTINGS.latencyMs, LATENCY_MIN, LATENCY_MAX),
    volume: numberOr(s.volume, DEFAULT_SETTINGS.volume, 0, 1),
    metronome: booleanOr(s.metronome, DEFAULT_SETTINGS.metronome),
  }
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s)
}

/** A key is "<channel>:<note>", or a bare note from maps learned before channels were stored. */
const MAP_KEY_SHAPE = /^(?:(\d|1[0-5]):)?(\d{1,3})$/

/**
 * Null when nothing was learned; an empty map is meaningful (it silences every
 * note), so a stored object is kept even if all its entries are dropped.
 * Entries must be a legal key shape mapping to a real pad number, or a
 * corrupted map could emit pads no lesson or grid position can have.
 */
export function loadCustomMap(): Record<string, number> | null {
  const stored = read<unknown>(MIDIMAP_KEY)
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(stored)) {
    const m = MAP_KEY_SHAPE.exec(k)
    if (!m || Number(m[2]) > 127) continue
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 16) continue
    out[k] = v
  }
  return out
}

export function saveCustomMap(map: Record<string, number> | null): void {
  if (map === null) {
    try {
      localStorage.removeItem(MIDIMAP_KEY)
    } catch { /* ignore */ }
  } else {
    write(MIDIMAP_KEY, map)
  }
}
