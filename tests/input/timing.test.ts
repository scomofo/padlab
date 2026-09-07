import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureInputTiming, eventAudioTime } from '../../src/input/timing'
import { padBus } from '../../src/input/inputBus'
afterEach(() => vi.restoreAllMocks())

describe('input timing boundary', () => {
  it.each([undefined, NaN, Infinity, -1, 1700000000000, 101])('falls back safely for %s', (stamp) => {
    expect(captureInputTiming(stamp, 100)).toEqual({ timeStamp: 100, receivedAtMs: 100, timestampSource: 'fallback' })
  })
  it('retains a valid old event rather than silently making it current', () => {
    expect(captureInputTiming(10, 1000)).toMatchObject({ timeStamp: 10, timestampSource: 'event' })
    expect(eventAudioTime(920, 8, 1000)).toBeCloseTo(7.92)
  })
  it('captures before subscribers run and prioritizes scoring over pad flashes', () => {
    let wall = 1000; vi.spyOn(performance, 'now').mockImplementation(() => wall)
    const order: string[] = []; const stamps: number[] = []
    const visual = padBus.subscribe((e) => { order.push('visual'); stamps.push(e.timeStamp) }, 'visual')
    const realtime = padBus.subscribe((e) => { order.push('realtime'); stamps.push(e.timeStamp); wall += 90 })
    try {
      padBus.emit({ pad: 1, velocity: 100, source: 'midi', timeStamp: 970 })
      expect(order).toEqual(['realtime', 'visual']); expect(stamps).toEqual([970, 970])
    } finally { visual(); realtime() }
  })
})
