/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { ctx } = vi.hoisted(() => ({ ctx: { currentTime: 10, state: 'running' } }))
vi.mock('../../src/audio/audio', () => ({ getAudioContext: () => ctx }))
vi.mock('../../src/audio/drumSynth', () => ({ playSound: vi.fn(), playClick: vi.fn() }))
import { PlayerRuntime } from '../../src/engine/player'
import { INPUT_DELIVERY_GRACE_MS } from '../../src/input/timing'
import { makeLesson, note } from '../helpers/chart'

let wall = 1000
let runtime: PlayerRuntime
beforeEach(() => {
  vi.useFakeTimers(); wall = 1000; ctx.currentTime = 10; ctx.state = 'running'
  vi.spyOn(performance, 'now').mockImplementation(() => wall)
})
afterEach(() => { runtime?.stop(); vi.restoreAllMocks(); vi.useRealTimers() })
function start(latencyMs = 0, roll = false) {
  const lesson = makeLesson({ bpm: roll ? 174 : 120, events: roll ? [note(0, 1), note(.125, 1)] : [note(0, 1), note(4, 2)] })
  runtime = new PlayerRuntime({ lesson, stepIndex: lesson.steps.length - 1, mode: 'play',
    tempoPct: roll ? 120 : 100, metronome: false, latencyMs, onFinish: vi.fn() })
  runtime.start()
  return runtime
}
function deliverAt(beat: number, physicalOffsetMs: number, delayMs: number) {
  ctx.currentTime = runtime.transport.beatToCtxTime(beat) + (physicalOffsetMs + delayMs) / 1000
  wall = 1000 + (ctx.currentTime - 10) * 1000
  return wall - delayMs
}

describe('timestamped scoring', () => {
  it.each([0, 80, 200, 250])('keeps an on-time hit Perfect after %i ms of delivery delay', (delay) => {
    start(); const stamp = deliverAt(0, 0, delay)
    vi.advanceTimersByTime(25) // timer runs before the queued input task
    expect(runtime.score!.events[0].judgement).toBeUndefined()
    runtime.handlePad(1, stamp)
    expect(runtime.score!.events[0].judgement).toBe('perfect')
    expect(runtime.score!.events[0].deltaMs).toBeCloseTo(0, 6)
  })
  it.each([-50, 20, 150])('preserves %i ms calibration while removing callback delay', (latency) => {
    start(latency); const stamp = deliverAt(0, latency, 200)
    vi.advanceTimersByTime(25); runtime.handlePad(1, stamp)
    expect(runtime.score!.events[0].judgement).toBe('perfect')
  })
  it('does not widen judgement windows for an actually late strike', () => {
    start(); const stamp = deliverAt(0, 160, 80)
    runtime.handlePad(1, stamp)
    expect(runtime.score!.events[0].judgement).toBeUndefined()
    expect(runtime.score!.stray).toBe(1)
    deliverAt(0, 0, 500); vi.advanceTimersByTime(25)
    expect(runtime.score!.events[0].judgement).toBe('miss')
  })
  it('rejects events older than the bounded backlog without minting stray hits', () => {
    start(); runtime.handlePad(1, deliverAt(0, 0, INPUT_DELIVERY_GRACE_MS + 1))
    expect(runtime.staleInputs).toBe(1); expect(runtime.score!.stray).toBe(0)
    expect(runtime.score!.events[0].judgement).toBeUndefined()
  })
  it('keeps fast roll spacing when callbacks arrive together, but suppresses bounce', () => {
    start(0, true); const stamp = deliverAt(0, 0, 230)
    runtime.handlePad(1, stamp); runtime.handlePad(1, stamp + 3)
    runtime.handlePad(1, stamp + runtime.transport.secPerBeat * .125 * 1000)
    expect(runtime.score!.summary().perfect).toBe(2)
    expect(runtime.score!.ignored).toBe(1)
    expect(runtime.score!.stray).toBe(0)
  })
  it('does not let a previous-run event enter a new run', () => {
    start(); wall = 1005; runtime.handlePad(1, 999)
    expect(runtime.staleInputs).toBe(1)
  })
  it('ignores events while the audio clock is suspended or the run is stopped', () => {
    start(); const stamp = deliverAt(0, 0, 0); ctx.state = 'suspended'
    runtime.handlePad(1, stamp); expect(runtime.score!.summary().perfect).toBe(0)
    ctx.state = 'running'; runtime.stop(); runtime.handlePad(1, stamp)
    expect(runtime.score!.summary().perfect).toBe(0)
  })
  it.each([undefined, NaN, Infinity, -10, 1700000000000])('safely falls back for timestamp %s', (stamp) => {
    start(); deliverAt(0, 0, 0); runtime.handlePad(1, stamp)
    expect(runtime.score!.events[0].judgement).toBe('perfect')
  })
})
