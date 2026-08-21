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

export function loadProgress(): Record<string, LessonProgress> {
  return read<Record<string, LessonProgress>>(PROGRESS_KEY) ?? {}
}

export function saveLessonResult(lessonId: string, accuracy: number, stars: number): Record<string, LessonProgress> {
  const all = loadProgress()
  const prev = all[lessonId]
  all[lessonId] = {
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
    stars: Math.max(prev?.stars ?? 0, stars),
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
  return read<Record<string, GuideProgress>>(GUIDES_KEY) ?? {}
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

export function loadCustomMap(): Record<number, number> | null {
  return read<Record<number, number>>(MIDIMAP_KEY)
}

export function saveCustomMap(map: Record<number, number> | null): void {
  if (map === null) {
    try {
      localStorage.removeItem(MIDIMAP_KEY)
    } catch { /* ignore */ }
  } else {
    write(MIDIMAP_KEY, map)
  }
}
