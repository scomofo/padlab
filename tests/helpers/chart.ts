import type { Lesson, LessonStep, NoteEvent, SoundName } from '../../src/engine/types'

/** secPerBeat for a tempo. 120 BPM => 0.5 s/beat, the default across these tests. */
export function secPerBeat(bpm = 120): number {
  return 60 / bpm
}

/**
 * A beat offset that lands exactly `ms` away from a note, at the given tempo.
 * Timing windows are specified in ms but matching happens in beats, so tests
 * that probe a window edge must convert the same way the engine does.
 */
export function beatsFromMs(ms: number, bpm = 120): number {
  return ms / 1000 / secPerBeat(bpm)
}

export function note(t: number, pad: number, vel = 100): NoteEvent {
  return { t, pad, vel }
}

/** Minimal lesson, overridable per test. Defaults are validator-legal. */
export function makeLesson(over: Partial<Lesson> = {}): Lesson {
  const steps: LessonStep[] = over.steps ?? [
    { name: 'Kick only', playerPads: [1] },
    { name: 'Add snare', playerPads: [1, 2] },
    { name: 'Perform', playerPads: 'all' },
  ]
  const pads: Record<string, SoundName> = over.pads ?? { '1': 'kick', '2': 'snare', '5': 'hatClosed' }
  return {
    id: 'test-lesson',
    title: 'Test Lesson',
    course: 'foundations',
    genre: 'Test',
    level: 1,
    padCount: 8,
    bpm: 120,
    bars: 4,
    ...over,
    pads,
    steps,
    events: over.events ?? [note(0, 1), note(2, 2), note(4, 1), note(6, 2)],
  }
}

/** Four-on-the-floor kick + backbeat snare over `bars` bars. */
export function fourOnTheFloor(bars = 4): NoteEvent[] {
  const events: NoteEvent[] = []
  for (let b = 0; b < bars * 4; b++) {
    events.push(note(b, 1))
    if (b % 4 === 1 || b % 4 === 3) events.push(note(b, 2))
  }
  return events.sort((a, b) => a.t - b.t || a.pad - b.pad)
}
