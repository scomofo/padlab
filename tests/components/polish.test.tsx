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

import { LessonBrowser } from '../../src/components/LessonBrowser'
import { GuideViewer } from '../../src/components/GuideViewer'
import { DeviceSetup } from '../../src/components/DeviceSetup'
import { Results } from '../../src/components/Results'
import { ReplayCard } from '../../src/components/ReplayCard'
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

describe('Greatness pass polish features', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

  it('resets filters when Escape is pressed in LessonBrowser', async () => {
    const onFiltersChange = vi.fn()
    const scrollPositionRef = { current: 0 }
    await act(async () => {
      root.render(createElement(LessonBrowser, {
        lessons: LESSONS,
        guides: GUIDES,
        progress: {},
        guideProgress: {},
        profile: mockProfile,
        history: [],
        session: null,
        filters: { query: 'first', padCount: 'all', level: 'all' },
        onFiltersChange,
        scrollPositionRef,
        onStartSession: vi.fn(),
        onOpen: vi.fn(),
        onOpenGuide: vi.fn(),
        onOpenSetup: vi.fn(),
        onOpenJam: vi.fn(),
      }))
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onFiltersChange).toHaveBeenCalledWith({ query: '', padCount: 'all', level: 'all' })
  })

  it('exits guide view when Escape is pressed in GuideViewer', async () => {
    const onExit = vi.fn()
    await act(async () => {
      root.render(createElement(GuideViewer, {
        guide: GUIDES[0],
        onExit,
        onProgressChange: vi.fn(),
      }))
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onExit).toHaveBeenCalled()
  })

  it('closes DeviceSetup when Escape is pressed and formats positive/negative latency hints', async () => {
    const onClose = vi.fn()
    await act(async () => {
      root.render(createElement(DeviceSetup, {
        settings: { latencyMs: 25, volume: 0.9, metronome: true },
        onChange: vi.fn(),
        onClose,
      }))
    })

    expect(host.textContent).toContain('Shifts judging 25 ms earlier')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onClose).toHaveBeenCalled()
  })

  it('triggers primary action when Enter is pressed in Results', async () => {
    const onNext = vi.fn()
    await act(async () => {
      root.render(createElement(Results, {
        summary: { accuracy: 95, stars: 3, perfect: 10, great: 0, good: 0, miss: 0, stray: 0, total: 10, maxCombo: 10, deltas: [] },
        newBest: true,
        lessonTitle: 'First Taps',
        stepName: 'Perform',
        scored: true,
        award: null,
        nextLesson: null,
        onRetry: vi.fn(),
        onNext,
        onExit: vi.fn(),
      }))
    })

    const overlay = host.querySelector<HTMLElement>('.overlay')!
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onNext).toHaveBeenCalled()
  })

  it('renders ReplayCard with descriptive aria-label on action button', async () => {
    const history = [{
      lessonId: 'first-taps', completedAt: new Date().toISOString(), accuracy: 100,
      tempoPct: 100, variant: 'standard' as const, maxCombo: 16, misses: 0, total: 16,
    }]
    await act(async () => {
      root.render(createElement(ReplayCard, {
        lessons: LESSONS,
        history,
        onReplay: vi.fn(),
      }))
    })

    const button = host.querySelector('button')!
    expect(button.getAttribute('aria-label')).toContain('Replay Perform step for First Taps at 100% tempo')
  })
})
