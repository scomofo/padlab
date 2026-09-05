/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LESSONS } from '../../src/lessons'
import { buildSession, completeSessionRound } from '../../src/lib/session'
import { loadSession, saveSession } from '../../src/store/session'
import { makeLesson } from '../helpers/chart'

const KEY = 'padlab-session-v1'
const lesson = makeLesson()
const planned = () => buildSession([lesson], {}, null, new Date('2026-09-05T10:00:00.000Z'))!

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('saved quick session', () => {
  it('restores partial and completed sessions while preserving older progress and profile saves', () => {
    localStorage.setItem('padlab-progress-v1', '{"test-lesson":{"stars":2}}')
    localStorage.setItem('padlab-profile-v1', '{"xp":500}')
    expect(loadSession([lesson])).toBeNull()
    let session = completeSessionRound(planned(), 0, { mode: 'play', accuracy: 75, notesHit: 2 })
    saveSession(session)
    expect(loadSession([lesson])).toEqual(session)
    session = completeSessionRound(session, 1, { mode: 'practice', accuracy: null, notesHit: 4 })
    session = completeSessionRound(session, 2, { mode: 'play', accuracy: 100, notesHit: 4 })
    saveSession(session)
    expect(loadSession([lesson])).toEqual(session)
    expect(localStorage.getItem('padlab-progress-v1')).toBe('{"test-lesson":{"stars":2}}')
    expect(localStorage.getItem('padlab-profile-v1')).toBe('{"xp":500}')
  })

  it('fails safely for broken JSON, unusable shapes and a removed lesson', () => {
    for (const raw of ['{oops', 'null', '[]', '{}', '42']) {
      localStorage.setItem(KEY, raw)
      expect(loadSession([lesson])).toBeNull()
      expect(localStorage.getItem(KEY)).toBe(raw)
    }
    saveSession(planned())
    expect(loadSession([])).toBeNull()
  })

  it('rejects invalid round counts, indices, tempos, labels and dates', () => {
    const base = planned()
    const round = base.rounds[0]
    const invalid = [
      { ...base, rounds: base.rounds.slice(1) },
      { ...base, rounds: [...base.rounds, round] },
      ...[null, { ...round, stepIndex: -1 }, { ...round, stepIndex: 3 }, { ...round, stepIndex: 0.5 },
        { ...round, tempoPct: 101 }, { ...round, tempoPct: 40 }, { ...round, tempoPct: '100' },
        { ...round, label: ' ' }, { ...round, label: 'x'.repeat(101) }]
        .map((bad) => ({ ...base, rounds: [bad, ...base.rounds.slice(1)] })),
      ...['not a date', '1', '2026-02-30T10:00:00.000Z', 'x'.repeat(100)].map((startedAt) => ({ ...base, startedAt })),
      { ...base, results: [null] }, { ...base, results: {} },
    ]
    for (const saved of invalid) {
      localStorage.setItem(KEY, JSON.stringify(saved))
      expect(loadSession([lesson])).toBeNull()
    }
  })

  it('bounds each result by that step’s player events, excluding automatic backing notes', () => {
    const base = planned()
    const result = { mode: 'play', accuracy: 50, notesHit: 2 }
    for (const bad of [
      { ...result, notesHit: 3 }, { ...result, notesHit: 0 }, { ...result, notesHit: 1.5 },
      { ...result, accuracy: 101 }, { ...result, accuracy: null }, { ...result, mode: 'listen' },
      { ...result, mode: 'practice' },
    ]) {
      localStorage.setItem(KEY, JSON.stringify({ ...base, results: [bad] }))
      expect(loadSession([lesson])).toBeNull()
    }
    localStorage.setItem(KEY, JSON.stringify({ ...base, results: [result, result, result, result] }))
    expect(loadSession([lesson])).toBeNull()
    saveSession(completeSessionRound(base, 0, result as { mode: 'play'; accuracy: number; notesHit: number }))
    expect(loadSession([{ ...lesson, events: lesson.events.slice(0, 1) }])).toBeNull()
  })

  it('rejects removed steps and rounds with no playable notes in changed lesson content', () => {
    saveSession(planned())
    expect(loadSession([{ ...lesson, steps: lesson.steps.slice(1) }])).toBeNull()
    expect(loadSession([{ ...lesson, steps: [{ ...lesson.steps[0], playerPads: [8] }, ...lesson.steps.slice(1)] }])).toBeNull()
  })

  it('accepts the supported player tempos and planner configurations across the real catalog', () => {
    for (const tempoPct of [50, 60, 70, 80, 90, 100, 105, 110, 115, 120]) {
      const session = planned()
      session.rounds[0].tempoPct = tempoPct
      saveSession(session)
      expect(loadSession([lesson])).toEqual(session)
    }
    for (const chart of LESSONS) {
      for (let nextStep = 0; nextStep < chart.steps.length; nextStep++) {
        const progress = { [chart.id]: { stars: 0, bestAccuracy: 0, stepsDone: Array.from({ length: nextStep }, (_, i) => i) } }
        const session = buildSession([chart], progress, chart.id)!
        saveSession(session)
        expect(loadSession(LESSONS), `${chart.id}, step ${nextStep}`).toEqual(session)
      }
    }
  })

  it('does not interrupt the current visit when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(() => saveSession(planned())).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(loadSession([lesson])).toBeNull()
  })
})
