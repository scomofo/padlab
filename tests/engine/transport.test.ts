import { beforeEach, describe, expect, it, vi } from 'vitest'

// The transport is anchored to AudioContext time, so tests drive a fake clock.
const { ctx } = vi.hoisted(() => ({ ctx: { currentTime: 0 } }))
vi.mock('../../src/audio/audio', () => ({
  getAudioContext: () => ctx,
  getMaster: () => ({}),
  unlockAudio: () => {},
  setMasterVolume: () => {},
}))

import { Transport } from '../../src/engine/transport'

/** start() anchors 0.1 s ahead so the first events have room to schedule. */
const START_OFFSET = 0.1

beforeEach(() => {
  ctx.currentTime = 0
})

describe('secPerBeat', () => {
  it('derives from bpm', () => {
    const t = new Transport()
    t.bpm = 120
    expect(t.secPerBeat).toBe(0.5)
    t.bpm = 60
    expect(t.secPerBeat).toBe(1)
  })

  it('is stretched by tempoScale', () => {
    const t = new Transport()
    t.bpm = 120
    t.tempoScale = 0.5
    expect(t.secPerBeat).toBe(1) // half speed = twice as long per beat
    t.tempoScale = 1.2
    expect(t.secPerBeat).toBeCloseTo(0.4167, 4)
  })
})

describe('lifecycle', () => {
  it('starts stopped at beat 0', () => {
    const t = new Transport()
    expect(t.state).toBe('stopped')
    expect(t.now()).toBe(0)
  })

  it('reports the start beat immediately after starting', () => {
    const t = new Transport()
    t.start(0)
    ctx.currentTime = START_OFFSET
    expect(t.now()).toBeCloseTo(0, 9)
  })

  it('advances one beat per secPerBeat of context time', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    ctx.currentTime = START_OFFSET + 0.5
    expect(t.now()).toBeCloseTo(1, 9)
    ctx.currentTime = START_OFFSET + 2
    expect(t.now()).toBeCloseTo(4, 9)
  })

  it('counts in from a negative beat', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(-4)
    ctx.currentTime = START_OFFSET
    expect(t.now()).toBeCloseTo(-4, 9)
    ctx.currentTime = START_OFFSET + 2 // four beats at 120 BPM
    expect(t.now()).toBeCloseTo(0, 9)
  })

  it('runs slower when tempoScale is reduced', () => {
    const t = new Transport()
    t.bpm = 120
    t.tempoScale = 0.5
    t.start(0)
    ctx.currentTime = START_OFFSET + 0.5
    expect(t.now()).toBeCloseTo(0.5, 9) // half as far as at full speed
  })

  it('stops and resets to beat 0', () => {
    const t = new Transport()
    t.start(0)
    ctx.currentTime = START_OFFSET + 4
    t.stop()
    expect(t.state).toBe('stopped')
    expect(t.now()).toBe(0)
  })

  it('re-anchors on each start, so a second run does not inherit the first', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    ctx.currentTime = 10
    t.stop()
    t.start(0)
    ctx.currentTime = 10 + START_OFFSET
    expect(t.now()).toBeCloseTo(0, 9)
  })
})

describe('pause and resume', () => {
  it('freezes the position while paused', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    ctx.currentTime = START_OFFSET + 1 // beat 2
    t.pause()
    expect(t.state).toBe('paused')
    expect(t.now()).toBeCloseTo(2, 9)

    ctx.currentTime += 5 // wall clock runs on while the player thinks
    expect(t.now()).toBeCloseTo(2, 9)
  })

  it('resumes from where it paused, losing no beats to the wait', () => {
    // Practice mode can sit paused indefinitely; that time must not be counted.
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    ctx.currentTime = START_OFFSET + 1
    t.pause()
    ctx.currentTime += 60
    t.resume()
    expect(t.now()).toBeCloseTo(2, 9)

    ctx.currentTime += 0.5
    expect(t.now()).toBeCloseTo(3, 9)
  })

  it('survives repeated pause/resume cycles without drifting', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    for (let i = 0; i < 10; i++) {
      ctx.currentTime += 0.5 // one beat
      t.pause()
      ctx.currentTime += 3 // idle
      t.resume()
    }
    expect(t.now()).toBeCloseTo(10 - START_OFFSET / 0.5, 6)
  })

  it('ignores pause when not playing', () => {
    const t = new Transport()
    t.pause()
    expect(t.state).toBe('stopped')
    t.start(0)
    t.pause()
    t.pause()
    expect(t.state).toBe('paused')
  })

  it('ignores resume when not paused', () => {
    const t = new Transport()
    t.resume()
    expect(t.state).toBe('stopped')
    t.start(0)
    t.resume()
    expect(t.state).toBe('playing')
  })
})

describe('beatToCtxTime', () => {
  it('maps the anchor beat to the anchor time', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    expect(t.beatToCtxTime(0)).toBeCloseTo(START_OFFSET, 9)
  })

  it('spaces beats by secPerBeat', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    expect(t.beatToCtxTime(4) - t.beatToCtxTime(0)).toBeCloseTo(2, 9)
  })

  it('is the exact inverse of now()', () => {
    const t = new Transport()
    t.bpm = 174
    t.start(-4)
    for (const beat of [-4, -1, 0, 3.5, 16]) {
      ctx.currentTime = t.beatToCtxTime(beat)
      expect(t.now()).toBeCloseTo(beat, 9)
    }
  })

  it('places count-in beats before the chart starts', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(-4)
    expect(t.beatToCtxTime(-4)).toBeLessThan(t.beatToCtxTime(0))
  })

  it('tracks the anchor across a pause, so scheduling stays aligned', () => {
    const t = new Transport()
    t.bpm = 120
    t.start(0)
    ctx.currentTime = START_OFFSET + 1
    t.pause()
    ctx.currentTime += 10
    t.resume()
    // Beat 2 is now, beat 3 is half a second out.
    expect(t.beatToCtxTime(2)).toBeCloseTo(ctx.currentTime, 9)
    expect(t.beatToCtxTime(3)).toBeCloseTo(ctx.currentTime + 0.5, 9)
  })
})
