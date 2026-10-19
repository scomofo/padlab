/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('../../src/audio/audio', () => ({
  unlockAudio: vi.fn(),
  setMasterVolume: vi.fn(),
  getAudioContext: vi.fn(),
  getMaster: vi.fn(),
}))

vi.mock('../../src/audio/drumSynth', () => ({
  playSound: vi.fn(),
}))

import { LessonPlayer } from '../../src/components/LessonPlayer'
import { GuideViewer } from '../../src/components/GuideViewer'
import { PadGrid } from '../../src/components/PadGrid'
import { LESSONS } from '../../src/lessons'
import { GUIDES } from '../../src/guides'
import type { Profile } from '../../src/store/profile'

const mockProfile: Profile = {
  xp: 0,
  streak: 0,
  longestStreak: 0,
  lastGoalDate: null,
  lastLessonId: null,
  notesHit: 0,
  sessions: 0,
  secondsPracticed: 0,
  dailyXp: 0,
  dailyXpDate: null,
  dailyChallengeDone: false,
  dailyChallengeDate: null,
  badges: [],
  week: {},
  freezes: 0,
  freezesEarned: 0,
}

describe('Greater-ness pass polish features', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 0 }),
      save: vi.fn(),
      restore: vi.fn(),
      roundRect: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('cycles playback mode when M is pressed in LessonPlayer', async () => {
    await act(async () => {
      root.render(createElement(LessonPlayer, {
        lesson: LESSONS[0],
        settings: { latencyMs: 20, volume: 0.9, metronome: true },
        profile: mockProfile,
        history: [],
        onHistory: vi.fn(),
        onExit: vi.fn(),
        onProgressChange: vi.fn(),
        onProfile: vi.fn(),
        onOpenLesson: vi.fn(),
      }))
    })

    const segmented = host.querySelector('.segmented')!
    expect(segmented.querySelector('[aria-pressed="true"]')?.textContent).toBe('Listen')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))
    })

    expect(segmented.querySelector('[aria-pressed="true"]')?.textContent).toBe('Practice')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))
    })

    expect(segmented.querySelector('[aria-pressed="true"]')?.textContent).toBe('Play')
  })

  it('toggles focus view when F is pressed in LessonPlayer', async () => {
    await act(async () => {
      root.render(createElement(LessonPlayer, {
        lesson: LESSONS[0],
        settings: { latencyMs: 20, volume: 0.9, metronome: true },
        profile: mockProfile,
        history: [],
        onHistory: vi.fn(),
        onExit: vi.fn(),
        onProgressChange: vi.fn(),
        onProfile: vi.fn(),
        onOpenLesson: vi.fn(),
      }))
    })

    const player = host.querySelector('.player')!
    expect(player.classList.contains('is-focused')).toBe(false)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })

    expect(player.classList.contains('is-focused')).toBe(true)
  })

  it('renders progressbar accessibility attributes in GuideViewer', async () => {
    await act(async () => {
      root.render(createElement(GuideViewer, {
        guide: GUIDES[0],
        onExit: vi.fn(),
        onProgressChange: vi.fn(),
      }))
    })

    const progressbar = host.querySelector('[role="progressbar"]')!
    expect(progressbar.getAttribute('aria-valuenow')).toBe('1')
    expect(progressbar.getAttribute('aria-valuemax')).toBe(String(GUIDES[0].steps.length))
  })

  it('renders descriptive titles on PadGrid pad buttons', async () => {
    await act(async () => {
      root.render(createElement(PadGrid, {
        padCount: 8,
        lesson: LESSONS[0],
      }))
    })

    const firstPad = host.querySelector('button[data-pad="1"]')!
    expect(firstPad.getAttribute('title')).toContain('Pad 1')
  })
})
