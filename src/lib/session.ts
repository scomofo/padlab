import type { Lesson, LessonProgress } from '../engine/types'
import { recommendLesson, resumeStep } from './curriculum'
import { nextRung } from './ladder'

export interface SessionRound {
  stepIndex: number
  tempoPct: number
  label: string
}

export interface SessionResult {
  accuracy: number | null
  notesHit: number
  mode: 'play' | 'practice'
}

export interface PracticeSession {
  lessonId: string
  rounds: SessionRound[]
  results: SessionResult[]
  startedAt: string
}

/** Three runs with a clear stopping point, continuing the player's current learning path. */
export function buildSession(
  lessons: Lesson[],
  progress: Record<string, LessonProgress>,
  lastId: string | null,
  now = new Date(),
): PracticeSession | null {
  if (lessons.length === 0) return null
  const last = lessons.find((lesson) => lesson.id === lastId)
  const hasProgress = lessons.some((lesson) => {
    const p = progress[lesson.id]
    return p && (p.stars > 0 || p.bestAccuracy > 0 || (p.stepsDone?.length ?? 0) > 0 || (p.bestTempoPct ?? 100) > 100)
  })
  const allMastered = lessons.every((lesson) => (progress[lesson.id]?.stars ?? 0) >= 3)
  const lesson = !last && !hasProgress
    ? lessons.find((candidate) => candidate.id === 'first-taps') ?? recommendLesson(lessons, progress, lastId)
    : allMastered && last ? last : recommendLesson(lessons, progress, lastId)
  if (!lesson.steps.length) return null

  const perform = lesson.steps.length - 1
  // Older saves can have Perform stars without recording any of the earlier steps.
  const current = (progress[lesson.id]?.stars ?? 0) >= 3 ? perform : resumeStep(lesson, progress[lesson.id])
  const remaining = lesson.steps.length - current
  let rounds: SessionRound[]
  if (remaining >= 3) {
    rounds = Array.from({ length: 3 }, (_, offset) => ({
      stepIndex: current + offset,
      tempoPct: 100,
      label: lesson.steps[current + offset].name,
    }))
  } else if (remaining === 2) {
    rounds = [
      { stepIndex: current, tempoPct: 100, label: lesson.steps[current].name },
      { stepIndex: perform, tempoPct: 80, label: 'Warm up the full groove' },
      { stepIndex: perform, tempoPct: 100, label: 'Perform' },
    ]
  } else {
    const stretch = nextRung(progress[lesson.id])
    rounds = [
      { stepIndex: perform, tempoPct: 80, label: 'Warm up' },
      { stepIndex: perform, tempoPct: 100, label: 'Perform' },
      { stepIndex: perform, tempoPct: stretch ?? 100, label: stretch ? `Try ${stretch}% tempo` : 'Make it stick' },
    ]
  }
  return { lessonId: lesson.id, rounds, results: [], startedAt: now.toISOString() }
}

/** Playing time, rounded up; Practice pauses and time between rounds can extend a session. */
export function estimateSessionMinutes(lesson: Lesson, rounds: SessionRound[]): number {
  const seconds = rounds.reduce((sum, round) => {
    const step = lesson.steps[round.stepIndex]
    if (!step || !Number.isFinite(lesson.bpm) || lesson.bpm <= 0) return sum
    const scale = Math.min(1.2, Math.max(0.25, (step.tempoScale ?? 1) * round.tempoPct / 100))
    // PlayerRuntime uses four count-in beats and one tail beat; Transport starts 0.1s ahead.
    return sum + (lesson.bars * 4 + 4 + 1) * 60 / (lesson.bpm * scale) + 0.1
  }, 0)
  return Math.max(1, Math.ceil(seconds / 60))
}

/** Shared validation for live completions and restored results. Listen never counts as practice. */
export function isSessionResult(value: unknown, maxNotes = 100_000): value is SessionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  if (typeof result.notesHit !== 'number' || !Number.isInteger(result.notesHit)
    || result.notesHit <= 0 || result.notesHit > maxNotes) return false
  if (result.mode === 'practice') return result.accuracy === null
  return result.mode === 'play' && typeof result.accuracy === 'number'
    && Number.isFinite(result.accuracy) && result.accuracy >= 0 && result.accuracy <= 100
}

/** Only a finished, engaged run for the next round can advance the session. */
export function completeSessionRound(session: PracticeSession, index: number, result: SessionResult): PracticeSession {
  if (!Number.isInteger(index) || index !== session.results.length || index >= session.rounds.length
    || !isSessionResult(result)) return session
  return {
    ...session,
    results: [...session.results, { accuracy: result.accuracy, notesHit: result.notesHit, mode: result.mode }],
  }
}

export function sessionCompleted(session: PracticeSession): boolean {
  return session.rounds.length > 0 && session.results.length === session.rounds.length
}
