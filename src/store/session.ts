import type { Lesson } from '../engine/types'
import { isSessionResult, type PracticeSession, type SessionRound, type SessionResult } from '../lib/session'

const KEY = 'padlab-session-v1'
const TEMPOS = [50, 60, 70, 80, 90, 100, 105, 110, 115, 120]

/** Restore only configurations that the current lesson can still play. Never rewrite older saves. */
export function loadSession(lessons: Lesson[]): PracticeSession | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const saved = value as Record<string, unknown>
    if (typeof saved.lessonId !== 'string' || !saved.lessonId || saved.lessonId.length > 200) return null
    const lesson = lessons.find((candidate) => candidate.id === saved.lessonId)
    if (!lesson || !Array.isArray(saved.rounds) || saved.rounds.length !== 3
      || !Array.isArray(saved.results) || saved.results.length > saved.rounds.length
      || typeof saved.startedAt !== 'string' || saved.startedAt.length > 32
      || !Number.isFinite(Date.parse(saved.startedAt))
      || new Date(saved.startedAt).toISOString() !== saved.startedAt) return null

    const rounds: SessionRound[] = []
    for (const item of saved.rounds) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const round = item as Record<string, unknown>
      if (typeof round.stepIndex !== 'number' || !Number.isInteger(round.stepIndex)
        || round.stepIndex < 0 || round.stepIndex >= lesson.steps.length
        || typeof round.tempoPct !== 'number' || !TEMPOS.includes(round.tempoPct)
        || typeof round.label !== 'string' || !round.label.trim() || round.label.length > 100) return null
      const step = lesson.steps[round.stepIndex]
      if (!lesson.events.some((event) => step.playerPads === 'all' || step.playerPads.includes(event.pad))) return null
      rounds.push({ stepIndex: round.stepIndex, tempoPct: round.tempoPct, label: round.label })
    }

    const results: SessionResult[] = []
    for (let index = 0; index < saved.results.length; index++) {
      const result: unknown = saved.results[index]
      const pads = lesson.steps[rounds[index].stepIndex].playerPads
      const count = lesson.events.filter((event) => pads === 'all' || pads.includes(event.pad)).length
      if (!isSessionResult(result, count)) return null
      results.push({ accuracy: result.accuracy, notesHit: result.notesHit, mode: result.mode })
    }
    return { lessonId: lesson.id, rounds, results, startedAt: saved.startedAt }
  } catch {
    return null
  }
}

export function saveSession(session: PracticeSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // The in-memory session can continue when storage is blocked or full.
  }
}
