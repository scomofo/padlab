/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const { ctx, master } = vi.hoisted(() => {
  function createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime(value: number) { this.value = value },
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
  }
  return {
    master: createGain(),
    ctx: {
      currentTime: 10,
      state: 'running',
      async resume() { this.state = 'running' },
      createGain,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  }
})
vi.mock('../src/audio/audio', () => ({
  getAudioContext: () => ctx, getMaster: () => master,
  unlockAudio: vi.fn(), setMasterVolume: vi.fn(),
}))
vi.mock('../src/audio/drumSynth', () => ({ playSound: vi.fn(), playClick: vi.fn() }))

import App from '../src/App'
import { JamRuntime } from '../src/engine/jam'
import { playSound } from '../src/audio/drumSynth'
import { padBus } from '../src/input/inputBus'
import { createEmptyJam, JAM_BEATS } from '../src/lib/jam'
import { loadJam, saveJam } from '../src/store/jam'
import { loadHistory } from '../src/store/history'
import { loadProfile } from '../src/store/profile'
import { loadProgress, saveSettings } from '../src/store/progress'
import { buildSession } from '../src/lib/session'
import { loadSession, saveSession } from '../src/store/session'
import { LESSONS } from '../src/lessons'

describe('Jam studio through real recording and playback', () => {
  let host: HTMLDivElement
  let root: Root
  let wall = 1000
  const runs: JamRuntime[] = []

  beforeEach(() => {
    localStorage.clear()
    saveSettings({ latencyMs: 0, volume: 0.9, metronome: false })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 8, 12))
    wall = 1000
    ctx.currentTime = 10
    ctx.state = 'running'
    runs.length = 0
    vi.mocked(playSound).mockClear()
    vi.spyOn(performance, 'now').mockImplementation(() => wall)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(wall), 16))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    // Observe the actual runtime; recording, scheduling and commit callbacks remain real.
    const start = JamRuntime.prototype.start
    vi.spyOn(JamRuntime.prototype, 'start').mockImplementation(function (this: JamRuntime, mode) {
      runs.push(this)
      start.call(this, mode)
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function mount() { await act(async () => root.render(createElement(App))) }
  async function click(text: string, scope: ParentNode = host) {
    const button = [...scope.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes(text) || b.getAttribute('aria-label')?.includes(text))
    expect(button, `Button containing ${text}`).toBeTruthy()
    expect(button!.disabled, `${text} should be enabled`).toBe(false)
    await act(async () => button!.click())
  }
  async function openJam() {
    await mount()
    await click('Open Jam')
  }
  async function typeInto(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  function latest() {
    expect(runs.length).toBeGreaterThan(0)
    return runs.at(-1)!
  }
  async function advanceTo(time: number) {
    expect(time + 0.000001).toBeGreaterThanOrEqual(ctx.currentTime)
    await act(async () => {
      // Keep event, performance and render clocks aligned while timers run normally.
      while (ctx.currentTime < time - 0.000001) {
        const delta = Math.min(0.025, time - ctx.currentTime)
        ctx.currentTime += delta
        wall += delta * 1000
        vi.advanceTimersByTime(delta * 1000)
      }
      ctx.currentTime = time
    })
  }
  async function moveToBeat(runtime: JamRuntime, beat: number) {
    await advanceTo(runtime.transport.beatToCtxTime(beat))
  }
  async function hit(runtime: JamRuntime, beat: number, pad: number, velocity = 100) {
    await moveToBeat(runtime, beat)
    await act(async () => padBus.emit({ pad, velocity, source: 'midi', timeStamp: wall }))
  }
  async function finishTake(runtime: JamRuntime, start = 0) {
    // Include the real engine's bounded MIDI-delivery grace after the fourth bar.
    await advanceTo(runtime.transport.beatToCtxTime(start + JAM_BEATS) + 0.35)
    expect(runtime.readStatus().phase).toBe('playing')
  }

  it('records four bars, loops the result, overdubs another part and undoes only the latest take', async () => {
    await openJam()
    const tempo = host.querySelector<HTMLInputElement>('input[aria-label="Tempo in BPM"]')!
    await typeInto(tempo, '')
    await typeInto(tempo, '120')
    await act(async () => tempo.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    await click('Record four bars')
    const first = latest()
    expect(first.transport.bpm).toBe(120)
    expect(first.readStatus().phase).toBe('count-in')
    await hit(first, 0, 1, 111)
    await hit(first, 4, 2, 83)
    await hit(first, 15, 5, 62)
    expect(loadJam().notes).toEqual([])
    expect(host.querySelectorAll('.jam-track')).toHaveLength(0)
    await finishTake(first)
    const original = [{ t: 0, pad: 1, vel: 111 }, { t: 4, pad: 2, vel: 83 }, { t: 15, pad: 5, vel: 62 }]
    expect(loadJam().notes).toEqual(original)
    expect(host.querySelectorAll('.jam-track')).toHaveLength(3)
    expect(host.textContent).toContain('Your loop is playing')
    expect(vi.mocked(playSound).mock.calls.some(([sound, at, velocity, destination]) =>
      sound === 'kick' && at === first.transport.beatToCtxTime(16) && velocity === 111 && destination,
    )).toBe(true)
    await click('Overdub')
    const start = first.readStatus().recordStart!
    expect(start).toBe(32)
    expect(first.readStatus().phase).toBe('armed')
    await hit(first, start + 2, 7, 74)
    expect(loadJam().notes).toEqual(original)
    await finishTake(first, start)
    expect(loadJam().notes).toEqual([
      original[0], { t: 2, pad: 7, vel: 74 }, original[1], original[2],
    ])
    await click('Stop')
    await click('Undo last take')
    expect(loadJam().notes).toEqual(original)
    await click('Play loop')
    expect(latest().notes).toEqual(original)
  })

  it('mutes loop tracks without muting live pads and discards unfinished takes on Stop and exit', async () => {
    const original = [{ t: 0, pad: 1, vel: 110 }, { t: 8, pad: 2, vel: 80 }]
    saveJam({ ...createEmptyJam(), notes: original })
    await openJam()
    await click('Play loop')
    const playing = latest()
    await moveToBeat(playing, 1)
    const kickOutput = vi.mocked(playSound).mock.calls.find(([sound, , , destination]) => sound === 'kick' && destination)?.[3] as GainNode
    expect(kickOutput).toBeTruthy()
    await click('Mute Kick')
    expect(kickOutput.gain.value).toBe(0)
    expect(loadJam().mutedPads).toEqual([1])
    vi.mocked(playSound).mockClear()
    const pad = host.querySelector<HTMLElement>('.pad-grid [data-pad="1"]')!
    await act(async () => pad.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })))
    expect(playSound).toHaveBeenCalledTimes(1)
    expect(playSound).toHaveBeenLastCalledWith('kick', undefined, 100)
    await click('Overdub')
    const start = playing.readStatus().recordStart!
    await hit(playing, start + 1, 5)
    expect(playing.readStatus().pendingNotes).toBe(1)
    await click('Stop')
    expect(playing.transport.state).toBe('stopped')
    expect(playing.readStatus().pendingNotes).toBe(0)
    expect(loadJam().notes).toEqual(original)
    await click('Record a layer')
    const unfinished = latest()
    await hit(unfinished, 1, 8)
    await click('Back to lessons')
    expect(unfinished.transport.state).toBe('stopped')
    vi.mocked(playSound).mockClear()
    await advanceTo(ctx.currentTime + 15)
    expect(playSound).not.toHaveBeenCalled()
    act(() => root.unmount())
    root = createRoot(host)
    await openJam()
    expect(loadJam()).toMatchObject({ notes: original, mutedPads: [1] })
    await click('Play loop')
    const restored = latest()
    expect(restored.notes).toEqual(original)
    await moveToBeat(restored, 1)
    const restoredOutput = vi.mocked(playSound).mock.calls.find(([sound, , , destination]) => sound === 'kick' && destination)?.[3] as GainNode
    expect(restoredOutput.gain.value).toBe(0)
    act(() => root.unmount())
    expect(restored.transport.state).toBe('stopped')
    root = createRoot(host)
    vi.mocked(playSound).mockClear()
    await advanceTo(ctx.currentTime + 15)
    expect(playSound).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps typing out of the pad input and leaves lesson progress and practice sessions untouched', async () => {
    const session = buildSession(LESSONS, {}, null)!
    saveSession(session)
    const before = { progress: loadProgress(), history: loadHistory(), profile: loadProfile(), session: loadSession(LESSONS) }
    await openJam()
    const name = host.querySelector<HTMLInputElement>('input[aria-label="Sketch name"]')!
    expect(name).toBeTruthy()
    await act(async () => name.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })))
    expect(playSound).not.toHaveBeenCalled()
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })))
    // Exactly one live-monitor listener owns pads after leaving the home screen.
    expect(playSound).toHaveBeenCalledTimes(1)
    await click('Record four bars')
    const runtime = latest()
    await hit(runtime, 0, 1)
    await hit(runtime, 1, 5)
    await finishTake(runtime)
    await click('Stop')
    await click('Back to lessons')
    expect({ progress: loadProgress(), history: loadHistory(), profile: loadProfile(), session: loadSession(LESSONS) }).toEqual(before)
  })

  it('keeps a completed groove playable and reports an unsaved sketch when storage fails', async () => {
    await openJam()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    await typeInto(host.querySelector<HTMLInputElement>('input[aria-label="Sketch name"]')!, 'After hours')
    await click('Record four bars')
    const runtime = latest()
    await hit(runtime, 0, 1)
    await finishTake(runtime)
    expect(runtime.notes).toEqual([{ t: 0, pad: 1, vel: 100 }])
    expect(loadJam().notes).toEqual([])
    expect(host.textContent).toContain('Save unavailable')
    await click('Stop')
    await click('Play loop')
    expect(latest().notes).toEqual([{ t: 0, pad: 1, vel: 100 }])
    await click('Back to lessons')
    await click('Open Jam')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Sketch name"]')!.value).toBe('After hours')
    expect(host.textContent).toContain('Save unavailable')
    await click('Play loop')
    expect(latest().notes).toEqual([{ t: 0, pad: 1, vel: 100 }])
  })

  it('discards an interrupted take when browser audio suspends and can resume recording after the pause', async () => {
    await openJam()
    await click('Record four bars')
    const interrupted = latest()
    await hit(interrupted, 0, 1)
    expect(interrupted.readStatus().pendingNotes).toBe(1)
    ctx.state = 'suspended'
    await advanceTo(ctx.currentTime + 0.2)
    expect(interrupted.transport.state).toBe('stopped')
    expect(loadJam().notes).toEqual([])
    expect(host.textContent).toContain('Audio paused')
    expect(host.textContent).toContain('unfinished take was discarded')
    // The Record gesture resumes the context and creates a fresh recorder.
    await click('Record four bars')
    const resumed = latest()
    expect(resumed).not.toBe(interrupted)
    expect(ctx.state).toBe('running')
    expect(resumed.readStatus().phase).toBe('count-in')
    await hit(resumed, 0, 2, 87)
    await finishTake(resumed)
    expect(loadJam().notes).toEqual([{ t: 0, pad: 2, vel: 87 }])
  })
})
