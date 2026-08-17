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

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) }
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
