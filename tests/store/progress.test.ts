/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadCustomMap,
  loadGuideProgress,
  loadProgress,
  loadSettings,
  saveCustomMap,
  saveGuideProgress,
  saveLessonResult,
  saveSettings,
} from '../../src/store/progress'

const PROGRESS_KEY = 'padlab-progress-v1'
const GUIDES_KEY = 'padlab-guides-v1'
const SETTINGS_KEY = 'padlab-settings-v1'
const MIDIMAP_KEY = 'padlab-midimap-v1'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('lesson progress', () => {
  it('starts empty', () => {
    expect(loadProgress()).toEqual({})
  })

  it('round-trips a result', () => {
    saveLessonResult('first-beats', 82, 2)
    expect(loadProgress()['first-beats']).toEqual({ bestAccuracy: 82, stars: 2 })
  })

  it('keeps the best accuracy, not the latest', () => {
    saveLessonResult('first-beats', 91, 3)
    saveLessonResult('first-beats', 40, 0)
    expect(loadProgress()['first-beats']).toEqual({ bestAccuracy: 91, stars: 3 })
  })

  it('keeps the best stars across runs', () => {
    saveLessonResult('first-beats', 60, 1)
    saveLessonResult('first-beats', 95, 3)
    saveLessonResult('first-beats', 70, 1)
    expect(loadProgress()['first-beats'].stars).toBe(3)
  })

  it('tracks lessons independently', () => {
    saveLessonResult('a', 90, 3)
    saveLessonResult('b', 50, 0)
    expect(loadProgress()).toEqual({
      a: { bestAccuracy: 90, stars: 3 },
      b: { bestAccuracy: 50, stars: 0 },
    })
  })

  it('returns the full updated map, so callers need not reload', () => {
    saveLessonResult('a', 90, 3)
    expect(saveLessonResult('b', 20, 0)).toHaveProperty('a')
  })

  it('recovers from corrupt stored JSON instead of throwing', () => {
    localStorage.setItem(PROGRESS_KEY, '{not json')
    expect(loadProgress()).toEqual({})
    expect(() => saveLessonResult('a', 50, 1)).not.toThrow()
  })

  it('does not throw when storage rejects the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => saveLessonResult('a', 90, 3)).not.toThrow()
  })
})

describe('guide progress', () => {
  it('starts empty', () => {
    expect(loadGuideProgress()).toEqual({})
  })

  it('round-trips a position', () => {
    saveGuideProgress('sp404-bus-fx', 2, false)
    expect(loadGuideProgress()['sp404-bus-fx']).toEqual({ lastStep: 2, completed: false })
  })

  it('keeps the furthest step reached, so going back does not lose your place', () => {
    saveGuideProgress('g', 5, false)
    saveGuideProgress('g', 1, false)
    expect(loadGuideProgress().g.lastStep).toBe(5)
  })

  it('is sticky once completed', () => {
    saveGuideProgress('g', 5, true)
    saveGuideProgress('g', 1, false)
    expect(loadGuideProgress().g.completed).toBe(true)
  })

  it('recovers from corrupt stored JSON', () => {
    localStorage.setItem(GUIDES_KEY, 'nope')
    expect(loadGuideProgress()).toEqual({})
  })
})

describe('settings', () => {
  it('returns documented defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual({ latencyMs: 20, volume: 0.9, metronome: true })
  })

  it('round-trips a saved change', () => {
    saveSettings({ latencyMs: 45, volume: 0.5, metronome: false })
    expect(loadSettings()).toEqual({ latencyMs: 45, volume: 0.5, metronome: false })
  })

  it('fills in fields missing from an older stored shape', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ latencyMs: 55 }))
    expect(loadSettings()).toEqual({ latencyMs: 55, volume: 0.9, metronome: true })
  })

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{{{')
    expect(loadSettings()).toEqual({ latencyMs: 20, volume: 0.9, metronome: true })
  })

  /**
   * Pins a real gap rather than endorsing it: `loadSettings` spreads stored
   * values over the defaults with no validation, so a hand-edited or corrupt
   * `padlab-settings-v1` puts a string straight into the timing maths
   * (latencyMs feeds beat arithmetic in PlayerRuntime). Worth a guard.
   */
  it('does not currently validate stored value types', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ latencyMs: 'abc', volume: null }))
    const s = loadSettings()
    expect(s.latencyMs).toBe('abc' as unknown as number)
    expect(s.volume).toBeNull()
  })
})

describe('custom MIDI map', () => {
  it('is null before anything is learned', () => {
    expect(loadCustomMap()).toBeNull()
  })

  it('round-trips a learned map', () => {
    saveCustomMap({ 36: 1, 37: 2 })
    expect(loadCustomMap()).toEqual({ 36: 1, 37: 2 })
  })

  it('removes the key entirely when cleared, rather than storing null', () => {
    saveCustomMap({ 36: 1 })
    saveCustomMap(null)
    expect(localStorage.getItem(MIDIMAP_KEY)).toBeNull()
    expect(loadCustomMap()).toBeNull()
  })

  it('does not throw when storage rejects removal', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(() => saveCustomMap(null)).not.toThrow()
  })

  it('survives a corrupt stored map', () => {
    localStorage.setItem(MIDIMAP_KEY, 'garbage')
    expect(loadCustomMap()).toBeNull()
  })
})

describe('storage keys', () => {
  it('namespaces every key so unrelated app state is never clobbered', () => {
    saveLessonResult('a', 1, 0)
    saveGuideProgress('g', 0, false)
    saveSettings({ latencyMs: 20, volume: 0.9, metronome: true })
    saveCustomMap({ 36: 1 })
    for (const key of Object.keys(localStorage)) expect(key).toMatch(/^padlab-/)
  })

  it('keeps the four stores separate', () => {
    saveLessonResult('a', 1, 0)
    saveGuideProgress('g', 0, false)
    saveSettings({ latencyMs: 20, volume: 0.9, metronome: true })
    saveCustomMap({ 36: 1 })
    expect(new Set(Object.keys(localStorage))).toEqual(
      new Set([PROGRESS_KEY, GUIDES_KEY, SETTINGS_KEY, MIDIMAP_KEY]),
    )
  })
})
