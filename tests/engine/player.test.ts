/**
 * @vitest-environment jsdom
 *
 * PlayerRuntime owns the transport, audio scheduling, wait-mode logic and the
 * scorekeeper. Tests drive it with a fake AudioContext clock and fake timers,
 * so a whole run takes microseconds and is exactly reproducible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { ctx, playSound, playClick } = vi.hoisted(() => ({
  ctx: { currentTime: 0 },
  playSound: vi.fn(),
  playClick: vi.fn(),
}))
vi.mock('../../src/audio/audio', () => ({
  getAudioContext: () => ctx,
  getMaster: () => ({}),
  unlockAudio: () => {},
  setMasterVolume: () => {},
}))
vi.mock('../../src/audio/drumSynth', () => ({ playSound, playClick }))

import { COUNT_IN_BEATS, PlayerRuntime, type PlayMode } from '../../src/engine/player'
import type { ScoreSummary } from '../../src/engine/scoring'
import type { Lesson, NoteEvent } from '../../src/engine/types'
import { makeLesson, note } from '../helpers/chart'

/** Matches TICK_MS in player.ts. */
const TICK_MS = 25

interface Harness {
  runtime: PlayerRuntime
  summary: ScoreSummary | null | undefined
  finished: boolean
  autoPlayed: number[]
  advance(seconds: number): void
  /** Run to completion, hitting every player note as it reaches the line. */
  playPerfectly(): void
  /** Run to completion touching nothing. */
  playNothing(): void
}

function harness(
  over: {
    lesson?: Lesson
    mode?: PlayMode
    stepIndex?: number
    tempoPct?: number
    metronome?: boolean
    latencyMs?: number
  } = {},
): Harness {
  const lesson = over.lesson ?? makeLesson()
  const latencyMs = over.latencyMs ?? 0
  const h = {
    summary: undefined as ScoreSummary | null | undefined,
    finished: false,
    autoPlayed: [] as number[],
  }
  const runtime = new PlayerRuntime({
    lesson,
    stepIndex: over.stepIndex ?? lesson.steps.length - 1,
    mode: over.mode ?? 'play',
    tempoPct: over.tempoPct ?? 100,
    metronome: over.metronome ?? false,
    latencyMs,
    onAutoPlay: (pad) => h.autoPlayed.push(pad),
    onFinish: (summary) => {
      h.finished = true
      h.summary = summary
    },
  })

  const advance = (seconds: number) => {
    const ticks = Math.round((seconds * 1000) / TICK_MS)
    for (let i = 0; i < ticks; i++) {
      ctx.currentTime += TICK_MS / 1000
      vi.advanceTimersByTime(TICK_MS)
    }
  }

  /** Long enough for count-in plus the chart plus the finish tail. */
  const fullRunSeconds = () =>
    ((runtime.totalBeats + COUNT_IN_BEATS + 2) * runtime.transport.secPerBeat) + 1

  return {
    runtime,
    get summary() { return h.summary },
    get finished() { return h.finished },
    get autoPlayed() { return h.autoPlayed },
    advance,
    playPerfectly() {
      runtime.start()
      // The latency setting exists because hits *arrive* late by that much, so
      // a player in perfect time produces note-ons offset by exactly latencyMs.
      const latBeats = latencyMs / 1000 / runtime.transport.secPerBeat
      const pending = new Set<NoteEvent>(runtime.playerEvents)
      const ticks = Math.round((fullRunSeconds() * 1000) / TICK_MS)
      for (let i = 0; i < ticks && !h.finished; i++) {
        ctx.currentTime += TICK_MS / 1000
        vi.advanceTimersByTime(TICK_MS)
        const now = runtime.transport.now()
        for (const e of pending) {
          if (now >= e.t + latBeats) {
            runtime.handlePad(e.pad)
            pending.delete(e)
          }
        }
      }
    },
    playNothing() {
      runtime.start()
      advance(fullRunSeconds())
    },
  }
}

beforeEach(() => {
  ctx.currentTime = 0
  playSound.mockClear()
  playClick.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('step setup', () => {
  it('splits events into the player’s pads and the backing track', () => {
    const lesson = makeLesson({
      steps: [
        { name: 'Kick only', playerPads: [1] },
        { name: 'Perform', playerPads: 'all' },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const { runtime } = harness({ lesson, stepIndex: 0 })
    expect(runtime.playerPadSet).toEqual(new Set([1]))
    expect(runtime.playerEvents.every((e) => e.pad === 1)).toBe(true)
    expect(runtime.backingEvents.every((e) => e.pad !== 1)).toBe(true)
    expect(runtime.playerEvents.length + runtime.backingEvents.length).toBe(lesson.events.length)
  })

  it('gives the player every charted pad on an "all" step', () => {
    const { runtime } = harness()
    expect(runtime.backingEvents).toEqual([])
    expect(runtime.playerEvents).toHaveLength(makeLesson().events.length)
  })

  it('sorts events by time regardless of the order in the JSON', () => {
    const lesson = makeLesson({ events: [note(6, 2), note(0, 1), note(4, 1), note(2, 2)] })
    const { runtime } = harness({ lesson })
    expect(runtime.playerEvents.map((e) => e.t)).toEqual([0, 2, 4, 6])
  })

  it('derives the chart length from the bar count', () => {
    expect(harness({ lesson: makeLesson({ bars: 4 }) }).runtime.totalBeats).toBe(16)
    expect(harness({ lesson: makeLesson({ bars: 8 }) }).runtime.totalBeats).toBe(32)
  })

  it('combines the step tempo with the user tempo', () => {
    const lesson = makeLesson({
      steps: [
        { name: 'Slow', playerPads: [1], tempoScale: 0.5 },
        { name: 'Perform', playerPads: 'all' },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const { runtime } = harness({ lesson, stepIndex: 0, tempoPct: 80 })
    expect(runtime.transport.tempoScale).toBeCloseTo(0.4, 9) // 0.5 * 0.80
  })

  it('clamps a very slow combination to a floor of 0.25', () => {
    const lesson = makeLesson({
      steps: [
        { name: 'Slow', playerPads: [1], tempoScale: 0.5 },
        { name: 'Perform', playerPads: 'all' },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const { runtime } = harness({ lesson, stepIndex: 0, tempoPct: 40 }) // 0.2 unclamped
    expect(runtime.transport.tempoScale).toBe(0.25)
  })

  it('takes the lesson bpm', () => {
    const { runtime } = harness({ lesson: makeLesson({ bpm: 174 }) })
    expect(runtime.transport.bpm).toBe(174)
  })
})

describe('count-in and metronome', () => {
  it('starts four beats before the chart', () => {
    const { runtime, advance } = harness()
    runtime.start()
    advance(TICK_MS / 1000)
    expect(runtime.transport.now()).toBeLessThan(-COUNT_IN_BEATS + 1)
  })

  it('clicks through the count-in even with the metronome off', () => {
    const { runtime, advance } = harness({ metronome: false })
    runtime.start()
    advance(2.5) // count-in is 4 beats = 2 s at 120 BPM
    expect(playClick).toHaveBeenCalledTimes(COUNT_IN_BEATS)
  })

  it('stops clicking once the chart starts when the metronome is off', () => {
    const h = harness({ metronome: false })
    h.playNothing()
    expect(playClick).toHaveBeenCalledTimes(COUNT_IN_BEATS)
  })

  it('clicks every beat when the metronome is on', () => {
    const h = harness({ metronome: true })
    h.playNothing()
    // 4 count-in beats plus one per beat of the chart.
    expect(playClick).toHaveBeenCalledTimes(COUNT_IN_BEATS + h.runtime.totalBeats)
  })

  it('accents the downbeat of each bar', () => {
    const h = harness({ metronome: true })
    h.playNothing()
    const accents = playClick.mock.calls.filter(([, accent]) => accent === true)
    expect(accents).toHaveLength((COUNT_IN_BEATS + h.runtime.totalBeats) / 4)
  })

  it('can be toggled mid-run', () => {
    const { runtime, advance } = harness({ metronome: false })
    runtime.start()
    advance(2.5)
    expect(playClick).toHaveBeenCalledTimes(COUNT_IN_BEATS)
    runtime.setMetronome(true)
    advance(2)
    expect(playClick.mock.calls.length).toBeGreaterThan(COUNT_IN_BEATS)
  })
})

describe('audio scheduling', () => {
  it('plays the chart for you in listen mode', () => {
    const h = harness({ mode: 'listen' })
    h.playNothing()
    expect(playSound).toHaveBeenCalledTimes(makeLesson().events.length)
  })

  it('stays silent in play mode — the notes are yours to hit', () => {
    const h = harness({ mode: 'play' })
    h.playNothing()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('plays the backing pads but not the player’s in a partial step', () => {
    const lesson = makeLesson({
      steps: [
        { name: 'Kick only', playerPads: [1] },
        { name: 'Perform', playerPads: 'all' },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const h = harness({ lesson, stepIndex: 0, mode: 'play' })
    h.playNothing()
    expect(playSound).toHaveBeenCalledTimes(h.runtime.backingEvents.length)
    expect(playSound.mock.calls.map(([sound]) => sound)).not.toContain('kick')
  })

  it('schedules each note once and only once', () => {
    const h = harness({ mode: 'listen' })
    h.playNothing()
    const times = playSound.mock.calls.map(([, at]) => at)
    expect(new Set(times).size).toBe(times.length)
  })

  it('schedules notes ahead of the context clock, never in the past', () => {
    const { runtime, advance } = harness({ mode: 'listen' })
    runtime.start()
    for (let i = 0; i < 100; i++) {
      const before = ctx.currentTime
      advance(TICK_MS / 1000)
      for (const [, at] of playSound.mock.calls) expect(at).toBeGreaterThanOrEqual(before)
      playSound.mockClear()
    }
  })

  it('reports auto-played pads for the pad lights', () => {
    const h = harness({ mode: 'listen' })
    h.playNothing()
    expect(h.autoPlayed.sort()).toEqual(makeLesson().events.map((e) => e.pad).sort())
  })

  it('passes each note’s velocity through to the synth', () => {
    const lesson = makeLesson({ events: [note(0, 1, 50), note(2, 2, 122)] })
    const h = harness({ lesson, mode: 'listen' })
    h.playNothing()
    expect(playSound.mock.calls.map(([, , vel]) => vel)).toEqual([50, 122])
  })
})

describe('play mode scoring', () => {
  it('scores a clean run at full marks', () => {
    const h = harness({ mode: 'play' })
    h.playPerfectly()
    expect(h.finished).toBe(true)
    expect(h.summary?.accuracy).toBe(100)
    expect(h.summary?.stars).toBe(3)
    expect(h.summary?.miss).toBe(0)
  })

  it('scores a run where nothing was played as all misses', () => {
    const h = harness({ mode: 'play' })
    h.playNothing()
    expect(h.summary?.miss).toBe(makeLesson().events.length)
    expect(h.summary?.accuracy).toBe(0)
    expect(h.summary?.stars).toBe(0)
  })

  it('reports no summary in listen mode', () => {
    const h = harness({ mode: 'listen' })
    h.playNothing()
    expect(h.finished).toBe(true)
    expect(h.summary).toBeNull()
  })

  it('waits indefinitely in practice mode rather than finishing without you', () => {
    const h = harness({ mode: 'practice' })
    h.playNothing()
    expect(h.finished).toBe(false)
    expect(h.runtime.transport.state).toBe('paused')
  })

  it('ignores pad hits during the count-in, so warming up is free', () => {
    const { runtime, advance } = harness({ mode: 'play' })
    runtime.start()
    advance(1) // still two beats of count-in to go
    for (let i = 0; i < 20; i++) runtime.handlePad(1)
    expect(runtime.score?.stray).toBe(0)
  })

  it('keeps the whole count-in free, right up to the first note\'s window', () => {
    // With the transport's 0.1 s anchor offset, 1.85 s in is half a beat
    // before the chart. The "good" window is only 0.27 beats at 120 BPM, so
    // this hit cannot claim anything — it must be free, not a stray.
    const { runtime, advance } = harness({ mode: 'play' })
    runtime.start()
    advance(1.85)
    runtime.handlePad(1)
    expect(runtime.score?.stray).toBe(0)
  })

  it('judges an early strike at the first note instead of ignoring it', () => {
    const { runtime, advance } = harness({ mode: 'play' })
    runtime.start()
    // The transport anchors 0.1 s ahead, so 2.0 s in is 0.2 beats before the
    // chart — inside beat 0's ±0.27-beat window at 120 BPM.
    advance(2.0)
    runtime.handlePad(1) // pad 1 has a note at t=0
    expect(runtime.score?.stray).toBe(0)
    expect(runtime.score?.events.find((e) => e.t === 0 && e.pad === 1)?.judgement).toBeDefined()
  })

  it('records feedback for the highway', () => {
    const { runtime, advance } = harness({ mode: 'play' })
    runtime.start()
    advance(2.5)
    runtime.handlePad(7) // uncharted pad, mid-chart
    expect(runtime.feedback.at(-1)).toMatchObject({ pad: 7, judgement: 'stray' })
  })

  it('pushes a miss into the feedback stream when a note goes by', () => {
    const { runtime, advance } = harness({ mode: 'play' })
    runtime.start()
    advance(2.8) // past beat 0's window
    expect(runtime.feedback.some((f) => f.judgement === 'miss')).toBe(true)
  })
})

describe('input latency compensation', () => {
  /**
   * The whole slider range the device panel offers (-50..150 ms). At the top of
   * that range the offset exceeds the 135 ms "good" window, so if the miss
   * sweep ever stops using the same compensated position that hits are judged
   * at, a valid late hit is force-missed before its event arrives. That is the
   * bug the comment in player.ts guards against; 150 ms is the case that
   * actually catches it.
   */
  it.each([-50, 0, 20, 100, 150])('does not turn hits into misses at %d ms', (latencyMs) => {
    const h = harness({ mode: 'play', latencyMs })
    h.playPerfectly()
    expect(h.summary?.miss).toBe(0)
    expect(h.summary?.accuracy).toBe(100)
  })

  it('still finishes the run with latency applied', () => {
    const h = harness({ mode: 'play', latencyMs: 150 })
    h.playNothing()
    expect(h.finished).toBe(true)
  })
})

describe('practice (wait) mode', () => {
  const soloLesson = makeLesson({
    pads: { '1': 'kick' },
    events: [note(0, 1), note(4, 1), note(8, 1), note(12, 1)],
    steps: [
      { name: 'Kick', playerPads: [1] },
      { name: 'Kick', playerPads: [1] },
      { name: 'Perform', playerPads: 'all' },
    ],
  })

  it('pauses when the first note reaches the line', () => {
    const { runtime, advance } = harness({ lesson: soloLesson, mode: 'practice' })
    runtime.start()
    advance(2.5)
    expect(runtime.transport.state).toBe('paused')
    expect(runtime.waitingPads).toEqual(new Set([1]))
  })

  it('resumes when the waited-for pad is hit', () => {
    const { runtime, advance } = harness({ lesson: soloLesson, mode: 'practice' })
    runtime.start()
    advance(2.5)
    runtime.handlePad(1)
    expect(runtime.transport.state).toBe('playing')
    expect(runtime.waitingPads).toBeNull()
  })

  it('stays paused when the wrong pad is hit', () => {
    const { runtime, advance } = harness({ lesson: soloLesson, mode: 'practice' })
    runtime.start()
    advance(2.5)
    runtime.handlePad(5)
    expect(runtime.transport.state).toBe('paused')
  })

  it('waits for every pad of a chord before resuming', () => {
    const chordLesson = makeLesson({
      events: [note(0, 1), note(0, 2), note(4, 1)],
      steps: [
        { name: 'Both', playerPads: [1, 2] },
        { name: 'Both', playerPads: [1, 2] },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const { runtime, advance } = harness({ lesson: chordLesson, mode: 'practice' })
    runtime.start()
    advance(2.5)
    expect(runtime.waitingPads).toEqual(new Set([1, 2]))
    runtime.handlePad(1)
    expect(runtime.transport.state).toBe('paused')
    runtime.handlePad(2)
    expect(runtime.transport.state).toBe('playing')
  })

  it('does not schedule audio past the wait line while frozen', () => {
    // WebAudio cannot be paused, so anything scheduled beyond the wait point
    // would sound during the freeze and be skipped on resume.
    const withBacking = makeLesson({
      events: [note(0, 1), note(1, 2), note(2, 2), note(3, 2), note(4, 1)],
      steps: [
        { name: 'Kick', playerPads: [1] },
        { name: 'Kick', playerPads: [1] },
        { name: 'Perform', playerPads: 'all' },
      ],
    })
    const { runtime, advance } = harness({ lesson: withBacking, mode: 'practice' })
    runtime.start()
    advance(2.5)
    expect(runtime.transport.state).toBe('paused')
    const scheduledWhilePaused = playSound.mock.calls.length
    advance(5) // sit at the wait line
    expect(playSound.mock.calls.length).toBe(scheduledWhilePaused)
  })

  it('lets an early hit satisfy a note so playback never pauses on it', () => {
    const { runtime, advance } = harness({ lesson: soloLesson, mode: 'practice' })
    runtime.start()
    advance(1.95) // just before beat 0, inside the early window
    runtime.handlePad(1)
    advance(0.3)
    expect(runtime.transport.state).toBe('playing')
  })

  it('completes a full run when every note is answered', () => {
    const h = harness({ lesson: soloLesson, mode: 'practice' })
    h.runtime.start()
    for (let i = 0; i < 2000 && !h.finished; i++) {
      ctx.currentTime += TICK_MS / 1000
      vi.advanceTimersByTime(TICK_MS)
      if (h.runtime.waitingPads) {
        for (const pad of [...h.runtime.waitingPads]) h.runtime.handlePad(pad)
      }
    }
    expect(h.finished).toBe(true)
    expect(h.summary).toBeNull()
  })

  it('does not score in practice mode', () => {
    const { runtime, advance } = harness({ lesson: soloLesson, mode: 'practice' })
    runtime.start()
    advance(2.5)
    expect(runtime.score).toBeNull()
  })
})

describe('stopping', () => {
  it('halts the transport and stops ticking', () => {
    const { runtime, advance } = harness({ mode: 'listen' })
    runtime.start()
    advance(2.5)
    runtime.stop()
    const callsAtStop = playSound.mock.calls.length
    advance(5)
    expect(runtime.transport.state).toBe('stopped')
    expect(playSound.mock.calls.length).toBe(callsAtStop)
  })

  it('does not fire onFinish when stopped early', () => {
    const h = harness({ mode: 'play' })
    h.runtime.start()
    h.advance(2.5)
    h.runtime.stop()
    h.advance(20)
    expect(h.finished).toBe(false)
  })

  it('is safe to call twice', () => {
    const { runtime } = harness()
    runtime.start()
    runtime.stop()
    expect(() => runtime.stop()).not.toThrow()
  })

  it('reports finish exactly once', () => {
    const onFinish = vi.fn()
    const lesson = makeLesson()
    const runtime = new PlayerRuntime({
      lesson,
      stepIndex: lesson.steps.length - 1,
      mode: 'play',
      tempoPct: 100,
      metronome: false,
      latencyMs: 0,
      onFinish,
    })
    runtime.start()
    for (let i = 0; i < 2000; i++) {
      ctx.currentTime += TICK_MS / 1000
      vi.advanceTimersByTime(TICK_MS)
    }
    expect(onFinish).toHaveBeenCalledOnce()
  })
})

describe('soundFor', () => {
  it('resolves a pad through the lesson mapping', () => {
    const { runtime } = harness({ lesson: makeLesson({ pads: { '1': 'cowbell', '2': 'snare' } }) })
    expect(runtime.soundFor(1)).toBe('cowbell')
  })

  it('returns null for a pad outside the controller', () => {
    const { runtime } = harness({ lesson: makeLesson({ padCount: 8 }) })
    expect(runtime.soundFor(9)).toBeNull()
  })
})
