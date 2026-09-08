/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const { ctx } = vi.hoisted(() => ({ ctx: { currentTime: 10, state: 'running' } }))
vi.mock('../src/audio/audio', () => ({
  getAudioContext: () => ctx, unlockAudio: vi.fn(), setMasterVolume: vi.fn(),
}))
vi.mock('../src/audio/drumSynth', () => ({ playSound: vi.fn(), playClick: vi.fn() }))
vi.mock('../src/components/Highway', () => ({
  Highway: () => createElement('div', { 'data-testid': 'highway' }),
}))

import App from '../src/App'
import { PlayerRuntime } from '../src/engine/player'
import { padBus } from '../src/input/inputBus'
import { loadHistory, savePerformance, type PerformanceRun } from '../src/store/history'
import { loadProgress, saveSettings } from '../src/store/progress'
import { loadProfile } from '../src/store/profile'

describe('groove goals through real playback', () => {
  let host: HTMLDivElement
  let root: Root
  let wall = 1000
  const runs: PlayerRuntime[] = []

  beforeEach(() => {
    localStorage.clear()
    saveSettings({ latencyMs: 0, volume: 0.9, metronome: false })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 8, 12))
    wall = 1000
    ctx.currentTime = 10
    ctx.state = 'running'
    runs.length = 0
    vi.spyOn(performance, 'now').mockImplementation(() => wall)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    // Observe construction without replacing playback, scoring, or completion.
    const start = PlayerRuntime.prototype.start
    vi.spyOn(PlayerRuntime.prototype, 'start').mockImplementation(function (this: PlayerRuntime) {
      runs.push(this)
      start.call(this)
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
    const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))
    expect(button, `Button containing ${text}`).toBeTruthy()
    await act(async () => button!.click())
  }
  async function openPerform() {
    await click('First Taps', host.querySelector('.lesson-grid')!)
    await click('Perform', host.querySelector('.step-strip')!)
    await click('Play', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
  }
  function latest() { return runs.at(-1)! }
  function moveClock(time: number) {
    expect(time).toBeGreaterThanOrEqual(ctx.currentTime)
    wall += (time - ctx.currentTime) * 1000
    ctx.currentTime = time
    vi.advanceTimersByTime(100)
  }
  async function hitNotes(runtime: PlayerRuntime, from = 0, to = runtime.playerEvents.length) {
    for (const note of runtime.playerEvents.slice(from, to)) {
      await act(async () => {
        moveClock(runtime.transport.beatToCtxTime(note.t))
        padBus.emit({ pad: note.pad, velocity: 100, source: 'midi', timeStamp: wall })
        vi.advanceTimersByTime(100)
      })
    }
  }
  async function finish(runtime: PlayerRuntime) {
    // Let the actual engine pass its chart tail, latency and delivery grace.
    await act(async () => moveClock(runtime.transport.beatToCtxTime(runtime.totalBeats + 2)))
    expect(runtime.transport.state).toBe('stopped')
  }
  const stage = () => host.querySelector('.groove-stage')
  const recap = () => host.querySelector('.groove-recap')
  function seedHistory(overrides: Partial<PerformanceRun> = {}) {
    return savePerformance({ lessonId: 'first-taps', completedAt: new Date().toISOString(),
      tempoPct: 100, variant: 'standard', accuracy: 70, maxCombo: 10, misses: 4, total: 16,
      ...overrides }, loadHistory())
  }

  it('updates goals from timed MIDI hits, celebrates a complete run, and resets on retry', async () => {
    await mount()
    await openPerform()
    const runtime = latest()
    expect(stage()).not.toBeNull()
    expect(stage()!.textContent).toContain('0/3')
    await hitNotes(runtime, 0, 9)
    expect(runtime.score!.summary().perfect).toBe(9)
    expect(stage()!.textContent).toContain('1/3')
    expect(loadHistory()).toHaveLength(0)
    await hitNotes(runtime, 9)
    await finish(runtime)
    expect(recap()!.textContent).toContain('3/3')
    expect(loadHistory()).toHaveLength(1)
    expect(loadProgress()['first-taps']).toMatchObject({ stars: 3, bestAccuracy: 100 })
    await click('Retry', host.querySelector('[role="dialog"]')!)
    expect(latest()).not.toBe(runtime)
    expect(recap()).toBeNull()
    expect(stage()!.textContent).toContain('0/3')
    expect(latest().score!.summary().perfect).toBe(0)
  })

  it('does not award a stopped run or invent scored goals in Listen and Practice', async () => {
    await mount()
    await openPerform()
    const before = loadProfile()
    await hitNotes(latest(), 0, 5)
    await click('Stop', host.querySelector('.player-controls')!)
    expect(loadHistory()).toEqual([])
    expect(loadProgress()).toEqual({})
    expect(loadProfile()).toEqual(before)
    expect(recap()).toBeNull()
    await click('Listen', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
    expect(stage()).toBeNull()
    await finish(latest())
    expect(recap()).toBeNull()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await click('Practice', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
    expect(stage()).toBeNull()
    const practice = latest()
    await hitNotes(practice)
    await finish(practice)
    expect(host.querySelector('[role="dialog"]')!.textContent).toContain('Practice complete')
    expect(recap()).toBeNull()
    expect(loadHistory()).toEqual([])
    expect(loadProgress()).toEqual({})
    expect(loadProfile().xp).toBe(0)
  })

  it('freezes the matching personal best before saving the new performance', async () => {
    seedHistory()
    seedHistory({ lessonId: 'backbeat', accuracy: 100 })
    seedHistory({ tempoPct: 110, accuracy: 100 })
    seedHistory({ variant: 'fade', accuracy: 100 })
    seedHistory({ total: 32, accuracy: 100 })
    await mount()
    await openPerform()
    expect(stage()!.textContent).toContain('71%')
    const runtime = latest()
    await hitNotes(runtime, 4)
    await finish(runtime)
    expect(runtime.score!.summary().accuracy).toBe(75)
    expect(loadHistory()).toHaveLength(6)
    expect(recap()!.textContent).toContain('Target reached · 71%')
    await click('Retry', host.querySelector('[role="dialog"]')!)
    expect(stage()!.textContent).toContain('76%')
  })

  it('keeps focus goals separate from personal bests and full-performance progress', async () => {
    seedHistory()
    await mount()
    await openPerform()
    const runtime = latest()
    await hitNotes(runtime, 8)
    await finish(runtime)
    const progressBefore = loadProgress()
    const profileBefore = loadProfile()
    const historyBefore = loadHistory()
    await click('Practice bars 1–2', host.querySelector('[role="dialog"]')!)
    const drill = latest()
    expect(drill.lesson.id).toContain('::focus:')
    expect(stage()).not.toBeNull()
    expect(stage()!.textContent).not.toContain('71%')
    expect(stage()!.querySelector('.groove-best')).toBeNull()
    await hitNotes(drill)
    await finish(drill)
    expect(recap()!.textContent).toContain('3/3')
    expect(recap()!.querySelector('.groove-best')).toBeNull()
    expect(loadProgress()).toEqual(progressBefore)
    expect(loadHistory()).toEqual(historyBefore)
    expect(loadProfile().streak).toBe(profileBefore.streak)
    expect(loadProfile().xp).toBeGreaterThan(profileBefore.xp)
  })
})
