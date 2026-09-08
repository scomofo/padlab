/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const { ctx, gains, stateListeners, master } = vi.hoisted(() => {
  const gains: {
    gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn> }
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }[] = []
  const stateListeners = new Set<() => void>()
  return {
    gains,
    stateListeners,
    master: {},
    ctx: {
      currentTime: 10,
      state: 'running',
      createGain: vi.fn(() => {
        const gain = {
          value: 1,
          setValueAtTime: vi.fn((value: number) => { gain.value = value }),
          cancelScheduledValues: vi.fn(),
        }
        const node = { gain, connect: vi.fn(), disconnect: vi.fn() }
        gains.push(node)
        return node
      }),
      addEventListener: vi.fn((_name: string, callback: () => void) => { stateListeners.add(callback) }),
      removeEventListener: vi.fn((_name: string, callback: () => void) => { stateListeners.delete(callback) }),
    },
  }
})

vi.mock('../../src/audio/audio', () => ({ getAudioContext: () => ctx, getMaster: () => master }))
vi.mock('../../src/audio/drumSynth', () => ({ playSound: vi.fn(), playClick: vi.fn() }))

import { playClick, playSound } from '../../src/audio/drumSynth'
import { JamRuntime, type JamRuntimeOptions } from '../../src/engine/jam'
import { INPUT_DELIVERY_GRACE_MS } from '../../src/input/timing'
import type { JamNote } from '../../src/lib/jam'

let wall = 1000
let runtime: JamRuntime
let commit: Mock<JamRuntimeOptions['onCommit']>

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  wall = 1000
  ctx.currentTime = 10
  ctx.state = 'running'
  gains.length = 0
  stateListeners.clear()
  commit = vi.fn()
  vi.spyOn(performance, 'now').mockImplementation(() => wall)
})

afterEach(() => {
  runtime?.dispose()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function make(options: Partial<JamRuntimeOptions> = {}): JamRuntime {
  runtime = new JamRuntime({
    notes: [], bpm: 120, latencyMs: 0, snap: true, mutedPads: [], metronome: true,
    onCommit: commit, ...options,
  })
  return runtime
}

function atBeat(beat: number, tick = true): void {
  ctx.currentTime = runtime.transport.beatToCtxTime(beat)
  wall = 1000 + (ctx.currentTime - 10) * 1000
  if (tick) vi.advanceTimersByTime(25)
}

function hit(beat: number, pad = 1, velocity = 100): void {
  atBeat(beat, false)
  runtime.handlePad(pad, velocity, wall)
}

function delayedHitTime(beat: number, latency: number, delay: number): number {
  ctx.currentTime = runtime.transport.beatToCtxTime(beat) + (latency + delay) / 1000
  wall = 1000 + (ctx.currentTime - 10) * 1000
  return wall - delay
}

describe('Jam transport and overdub passes', () => {
  it('counts in four beats, ignores count-in hits, and does not replay newly captured notes during the take', () => {
    make().start('record')
    expect(runtime.readStatus()).toMatchObject({ phase: 'count-in', recordStart: 0, pass: 0 })
    expect(playClick).toHaveBeenCalledWith(runtime.transport.beatToCtxTime(-4), true, gains[18])
    hit(-2, 1)
    expect(runtime.readStatus().pendingNotes).toBe(0)
    hit(0, 1, 84)
    atBeat(2)
    expect(runtime.readStatus()).toMatchObject({ phase: 'recording', pendingNotes: 1, pass: 1 })
    expect(playSound).not.toHaveBeenCalled()
    expect(runtime.notes).toEqual([])
  })

  it('replays the first recorded kick on the next downbeat before the late-input save grace ends', () => {
    make().start('record')
    hit(0, 1, 78)
    hit(0.98, 2, 103)
    atBeat(15.9)
    expect(playSound).toHaveBeenCalledExactlyOnceWith('kick', runtime.transport.beatToCtxTime(16), 78, gains[1])
    expect(commit).not.toHaveBeenCalled()
    atBeat(16)
    expect(runtime.readStatus().phase).toBe('finishing')
    expect(playSound).toHaveBeenCalledTimes(1)
    atBeat(16.49)
    expect(commit).not.toHaveBeenCalled()
    atBeat(16.51)
    expect(runtime.readStatus()).toMatchObject({ phase: 'playing', pendingNotes: 0, recordStart: null })
    expect(commit).toHaveBeenCalledExactlyOnceWith([{ t: 0, pad: 1, vel: 78 }, { t: 1, pad: 2, vel: 103 }])
    atBeat(16.9)
    expect(playSound).toHaveBeenLastCalledWith('snare', runtime.transport.beatToCtxTime(17), 103, gains[2])
    atBeat(32.6)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('schedules both sides of a loop seam exactly once and in chronological order', () => {
    make({ notes: [{ t: 0, pad: 1, vel: 90 }, { t: 15.9, pad: 2, vel: 110 }] }).start('play')
    atBeat(15.75)
    atBeat(15.92)
    atBeat(15.96)
    atBeat(16)
    expect(vi.mocked(playSound).mock.calls.map(([name, at]) => [name, at])).toEqual([
      ['kick', runtime.transport.beatToCtxTime(0)],
      ['snare', runtime.transport.beatToCtxTime(15.9)],
      ['kick', runtime.transport.beatToCtxTime(16)],
    ])
  })

  it('arms one whole overdub at the next boundary and keeps existing notes audible', () => {
    make({ notes: [{ t: 0, pad: 1, vel: 100 }] }).start('play')
    atBeat(5)
    runtime.record()
    runtime.record()
    expect(runtime.readStatus()).toMatchObject({ phase: 'armed', recordStart: 16 })
    hit(15.5, 2)
    expect(runtime.readStatus().pendingNotes).toBe(0)
    atBeat(15.9)
    expect(playSound).toHaveBeenLastCalledWith('kick', runtime.transport.beatToCtxTime(16), 100, gains[1])
    hit(16, 2, 73)
    atBeat(31.9)
    const seam = vi.mocked(playSound).mock.calls.filter(([, at]) => at === runtime.transport.beatToCtxTime(32))
    expect(seam.map(([name]) => name)).toEqual(['kick', 'snare'])
    atBeat(32.6)
    expect(commit).toHaveBeenCalledExactlyOnceWith([{ t: 0, pad: 1, vel: 100 }, { t: 0, pad: 2, vel: 73 }])
    runtime.record()
    expect(runtime.readStatus().recordStart).toBe(48)
  })

  it('arms the following boundary when record is pressed exactly on a downbeat', () => {
    make().start('play')
    atBeat(16)
    runtime.record()
    expect(runtime.readStatus().recordStart).toBe(32)
  })

  it('does not duplicate a pad/grid shared by an existing note and an overdub at the seam', () => {
    make({ notes: [{ t: 0, pad: 1, vel: 90 }] }).start('record')
    hit(0, 1, 120)
    atBeat(15.9)
    expect(vi.mocked(playSound).mock.calls.filter(([, at]) => at === runtime.transport.beatToCtxTime(16))).toHaveLength(1)
    atBeat(16.6)
    expect(runtime.notes).toHaveLength(1)
  })

  it('leaves the saved loop alone and creates no undo entry for an empty take', () => {
    const notes = [{ t: 1.25, pad: 5, vel: 70 }]
    make({ notes }).record()
    atBeat(16.6)
    expect(runtime.readStatus().phase).toBe('playing')
    expect(runtime.notes).toEqual(notes)
    expect(commit).not.toHaveBeenCalled()
  })

  it('skips elapsed cycles after a stalled timer without scheduling catch-up sounds', () => {
    make({ notes: [{ t: 0, pad: 1, vel: 100 }, { t: 8.125, pad: 2, vel: 100 }] }).start('play')
    vi.mocked(playSound).mockClear()
    vi.mocked(playClick).mockClear()
    atBeat(1000.05)
    expect(playSound).toHaveBeenCalledExactlyOnceWith('snare', runtime.transport.beatToCtxTime(1000.125), 100, gains[2])
    expect(playClick).not.toHaveBeenCalled()
    expect(vi.mocked(playSound).mock.calls.every(([, at]) => at! >= ctx.currentTime)).toBe(true)
  })
})

describe('timestamped Jam recording', () => {
  it.each([-50, 20, 150])('preserves %i ms calibration and event velocity despite 200 ms delivery delay', (latencyMs) => {
    make({ latencyMs, snap: false }).start('record')
    const stamp = delayedHitTime(1, latencyMs, 200)
    runtime.handlePad(3, 58, stamp)
    atBeat(17)
    expect(runtime.notes).toHaveLength(1)
    expect(runtime.notes[0]).toMatchObject({ pad: 3, vel: 58 })
    expect(runtime.notes[0].t).toBeCloseTo(1, 6)
  })

  it('accepts a delayed tail event after the timer reaches finishing and excludes a next-pass hit', () => {
    make({ latencyMs: 150, snap: false }).start('record')
    const stamp = delayedHitTime(15.99, 150, 200)
    vi.advanceTimersByTime(25)
    expect(runtime.readStatus().phase).toBe('finishing')
    runtime.handlePad(2, 91, stamp)
    runtime.handlePad(3, 80, delayedHitTime(16.01, 150, 200))
    expect(runtime.readStatus().pendingNotes).toBe(1)
    atBeat(16.81)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(runtime.notes[0].t).toBeCloseTo(15.99, 6)
    expect(runtime.notes[0].pad).toBe(2)
  })

  it('does not emit a late-discovered beat-zero note as catch-up audio', () => {
    make().start('record')
    const stamp = delayedHitTime(15.99, 0, 100)
    vi.advanceTimersByTime(25)
    runtime.handlePad(1, 100, stamp) // snaps to the already elapsed seam
    atBeat(16.6)
    expect(playSound).not.toHaveBeenCalled()
    atBeat(31.9)
    expect(playSound).toHaveBeenCalledExactlyOnceWith('kick', runtime.transport.beatToCtxTime(32), 100, gains[1])
  })

  it('fills an upcoming seam when a newly recorded pad arrives after lookahead but before the seam sounds', () => {
    make().start('record')
    atBeat(15.8) // scheduling cursor is already beyond beat sixteen
    hit(15.94, 5, 77)
    expect(playSound).toHaveBeenCalledExactlyOnceWith('hatClosed', runtime.transport.beatToCtxTime(16), 77, gains[5])
    atBeat(15.96)
    atBeat(16.1)
    expect(playSound).toHaveBeenCalledTimes(1)
    atBeat(16.6)
    expect(runtime.notes).toEqual([{ t: 0, pad: 5, vel: 77 }])
  })

  it('keeps a queued voice once and applies an overdubbed velocity on subsequent loops', () => {
    make({ notes: [{ t: 0, pad: 1, vel: 65 }] }).start('record')
    atBeat(15.8)
    hit(15.94, 1, 120)
    atBeat(16.6)
    const firstSeam = vi.mocked(playSound).mock.calls.filter(([, at]) => at === runtime.transport.beatToCtxTime(16))
    expect(firstSeam).toHaveLength(1)
    expect(firstSeam[0][2]).toBe(65)
    expect(runtime.notes[0].vel).toBe(120)
    atBeat(31.9)
    expect(playSound).toHaveBeenLastCalledWith('kick', runtime.transport.beatToCtxTime(32), 120, gains[1])
  })

  it('counts capacity across existing layers and never reports new hits that would be dropped on save', () => {
    const notes = Array.from({ length: 1023 }, (_, i) => ({ t: i / 64, pad: 1, vel: 60 }))
    make({ notes }).start('record')
    hit(1, 2, 80)
    hit(2, 3, 90)
    hit(3, 4, 100)
    expect(runtime.readStatus().pendingNotes).toBe(1)
    hit(4, 1, 110) // replacing an existing note remains allowed at capacity
    expect(runtime.readStatus().pendingNotes).toBe(2)
    atBeat(16.6)
    expect(runtime.notes).toHaveLength(1024)
    expect(runtime.notes).toEqual(expect.arrayContaining([{ t: 1, pad: 2, vel: 80 }, { t: 4, pad: 1, vel: 110 }]))
    expect(runtime.notes.some((note) => note.pad === 3 || note.pad === 4)).toBe(false)
  })

  it('quantizes only new hits and wraps the final sixteenth to beat zero', () => {
    make({ notes: [{ t: 0.13, pad: 1, vel: 61 }] }).start('record')
    hit(1.19, 2, 83)
    hit(1.3, 2, 90) // same snapped grid, separate physical strike
    hit(15.94, 5, 70)
    atBeat(16.6)
    expect(runtime.notes).toHaveLength(3)
    expect(runtime.notes).toEqual(expect.arrayContaining([
      { t: 0.13, pad: 1, vel: 61 },
      expect.objectContaining({ t: 1.25, pad: 2 }),
      { t: 0, pad: 5, vel: 70 },
    ]))
  })

  it('suppresses same-pad bounce by original timestamps while retaining genuine rolls', () => {
    make({ snap: false }).start('record')
    const stamp = delayedHitTime(1, 0, 200)
    runtime.handlePad(1, 100, stamp)
    runtime.handlePad(1, 70, stamp + 3)
    runtime.handlePad(1, 95, stamp + 62.5)
    runtime.handlePad(2, 80, stamp + 3)
    expect(runtime.readStatus().pendingNotes).toBe(3)
    atBeat(16.6)
    expect(runtime.notes.filter((note) => note.pad === 1).map((note) => note.t)).toEqual([1, 1.125])
  })

  it('rejects stale and previous-run timestamps plus invalid pads and note-offs', () => {
    make().start('record')
    const stamp = delayedHitTime(2, 0, INPUT_DELIVERY_GRACE_MS + 1)
    runtime.handlePad(1, 100, stamp)
    runtime.handlePad(1, 100, 999)
    for (const pad of [0, 17, 2.5, NaN]) runtime.handlePad(pad, 100, wall)
    for (const velocity of [0, -5, NaN, Infinity]) runtime.handlePad(1, velocity, wall)
    expect(runtime.readStatus().pendingNotes).toBe(0)
  })

  it.each([undefined, NaN, Infinity, -1, 1700000000000])('falls back to receipt time for invalid timestamp %s', (stamp) => {
    make().start('record')
    atBeat(1, false)
    runtime.handlePad(1, 100, stamp)
    atBeat(16.6)
    expect(runtime.notes).toEqual([{ t: 1, pad: 1, vel: 100 }])
  })
})

describe('Jam audio isolation and lifecycle', () => {
  it('routes loop audio through per-pad gains so mute immediately affects scheduled notes', () => {
    make({ notes: [{ t: 0, pad: 1, vel: 100 }], mutedPads: [2] }).start('play')
    expect(playSound).toHaveBeenCalledWith('kick', runtime.transport.beatToCtxTime(0), 100, gains[1])
    expect(gains[1].connect).toHaveBeenCalledWith(gains[0])
    expect(gains[0].connect).toHaveBeenCalledWith(master)
    expect(gains[2].gain.value).toBe(0)
    runtime.setMuted([1])
    expect(gains[1].gain.value).toBe(0)
    expect(gains[2].gain.value).toBe(1)
    runtime.setMuted([])
    expect(gains[1].gain.value).toBe(1)
  })

  it('switches the metronome immediately without muting the count-in', () => {
    make().start('record')
    runtime.setMetronome(false)
    expect(gains[17].gain.value).toBe(0)
    expect(gains[18].gain.value).toBe(1)
    runtime.setMetronome(true)
    expect(gains[17].gain.value).toBe(1)
  })

  it('silences scheduled audio, clears flash/tick timers, and discards an unfinished take on stop', () => {
    const flash = vi.fn()
    make({ notes: [{ t: 0, pad: 1, vel: 100 }], onAutoPlay: flash }).start('record')
    hit(1, 2, 80)
    atBeat(15.9) // queue next-pass notes and their flashes before stopping
    const outputs = [...gains]
    runtime.stop()
    expect(runtime.readStatus()).toMatchObject({ phase: 'idle', pendingNotes: 0 })
    expect(runtime.notes).toEqual([{ t: 0, pad: 1, vel: 100 }])
    expect(commit).not.toHaveBeenCalled()
    expect(outputs[0].gain.value).toBe(0)
    expect(outputs.every((output) => output.disconnect.mock.calls.length === 1)).toBe(true)
    expect(stateListeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(500)
    expect(flash).not.toHaveBeenCalled()
    runtime.start('play')
    expect(gains[19]).not.toBe(outputs[0])
    expect(outputs[0].gain.value).toBe(0)
  })

  it('drops a suspended run and refuses to start while the audio context is suspended', () => {
    make().start('record')
    hit(1)
    ctx.state = 'suspended'
    runtime.handlePad(2, 100, wall)
    for (const listener of [...stateListeners]) listener()
    expect(runtime.readStatus()).toMatchObject({ phase: 'idle', pendingNotes: 0 })
    expect(commit).not.toHaveBeenCalled()
    runtime.start('record')
    expect(runtime.transport.state).toBe('stopped')
    expect(vi.getTimerCount()).toBe(0)
    ctx.state = 'running'
    runtime.start('record')
    expect(runtime.readStatus().phase).toBe('count-in')
  })

  it('returns independent saved-note snapshots and never mutates earlier commit callbacks', () => {
    const snapshots: JamNote[][] = []
    make({ onCommit: (notes) => { snapshots.push(notes) } }).start('record')
    hit(1, 1, 70)
    atBeat(16.6)
    const first = snapshots[0]
    const getterCopy = runtime.notes
    getterCopy[0].vel = 1
    expect(runtime.notes[0].vel).toBe(70)
    runtime.record()
    hit(33, 2, 90)
    atBeat(48.6)
    expect(first).toEqual([{ t: 1, pad: 1, vel: 70 }])
    expect(snapshots[1]).toHaveLength(2)
    snapshots[1][0].vel = 2
    expect(runtime.notes[0].vel).toBe(70)
  })

  it('does not start twice or restart a disposed runtime', () => {
    make().start('play')
    runtime.start('record')
    expect(vi.getTimerCount()).toBe(1)
    expect(runtime.readStatus().recordStart).toBeNull()
    runtime.dispose()
    runtime.start('play')
    runtime.record()
    expect(vi.getTimerCount()).toBe(0)
    expect(runtime.readStatus().phase).toBe('idle')
  })
})
