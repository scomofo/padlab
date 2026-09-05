/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { RuntimeOptions } from '../src/engine/player'
import type { ScoreKeeper } from '../src/engine/scoring'
import type { NoteEvent } from '../src/engine/types'

interface TestRuntime {
  opts: RuntimeOptions
  score: ScoreKeeper | null
  playerEvents: NoteEvent[]
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}
const { runs } = vi.hoisted(() => ({ runs: [] as TestRuntime[] }))

vi.mock('../src/audio/audio', () => ({ unlockAudio: vi.fn(), setMasterVolume: vi.fn() }))
vi.mock('../src/audio/drumSynth', () => ({ playSound: vi.fn() }))
vi.mock('../src/components/Highway', () => ({
  Highway: ({ fadeBeats }: { fadeBeats: number }) => createElement('div', { 'data-testid': 'highway', 'data-fade': fadeBeats }),
}))
vi.mock('../src/engine/player', async () => {
  const { ScoreKeeper } = await import('../src/engine/scoring')
  return { PlayerRuntime: class {
    opts: RuntimeOptions
    score: ScoreKeeper | null
    playerEvents: NoteEvent[]
    start = vi.fn()
    stop = vi.fn()
    setMetronome = vi.fn()
    handlePad = vi.fn()
    constructor(opts: RuntimeOptions) {
      this.opts = opts
      const pads = opts.lesson.steps[opts.stepIndex].playerPads
      const events = opts.lesson.events.filter((e) => pads === 'all' || pads.includes(e.pad))
      this.playerEvents = events
      this.score = opts.mode === 'play' ? new ScoreKeeper(events, 60 / opts.lesson.bpm) : null
      runs.push(this)
    }
  } }
})

import App from '../src/App'
import { loadHistory, savePerformance } from '../src/store/history'
import { loadProgress, saveLessonResult } from '../src/store/progress'
import { loadProfile, saveProfile } from '../src/store/profile'
import { loadSession, saveSession } from '../src/store/session'
import { buildSession } from '../src/lib/session'
import { todayKey } from '../src/lib/dates'
import * as daily from '../src/lib/daily'
import * as curriculum from '../src/lib/curriculum'
import { LESSONS } from '../src/lessons'

describe('personal practice loop integration', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    runs.length = 0
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
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
  async function chooseTempo(value: number) {
    const select = host.querySelector<HTMLSelectElement>('.tempo-select')!
    await act(async () => {
      select.value = String(value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  async function finish(misses = 0) {
    const rt = runs.at(-1)!
    expect(rt.start).toHaveBeenCalledOnce()
    if (rt.score) {
      rt.score.events.forEach((e, i) => {
        e.judgement = i < misses ? 'miss' : 'perfect'
        if (i >= misses) e.deltaMs = 0
      })
      rt.score.maxCombo = rt.score.events.length - misses
    }
    await act(async () => rt.opts.onFinish(rt.score?.summary() ?? null))
  }
  async function openPerform() {
    await click('First Taps', host.querySelector('.lesson-grid')!)
    await click('Perform', host.querySelector('.step-strip')!)
    await click('Play', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
  }

  it('goes from a weak performance through a drill to a better full run, then replays it after reopening', async () => {
    await mount()
    await openPerform()
    await finish(8)
    expect(loadHistory()).toHaveLength(1)
    expect(host.textContent).toContain('Your first recorded run')
    const progressBefore = loadProgress()
    const profileBefore = loadProfile()
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    expect(document.activeElement).toBe(dialog)
    const actions = dialog.querySelectorAll('button')
    actions[actions.length - 1].focus()
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
    expect(document.activeElement).toBe(actions[0])
    // Space must not start a background performance while results own focus.
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(runs).toHaveLength(1)
    await click('Practice bars 1–2', dialog)
    expect(runs.at(-1)!.opts).toMatchObject({ mode: 'play', stepIndex: 0, tempoPct: 80 })
    expect(runs.at(-1)!.opts.lesson.events).toHaveLength(32)
    // Even a perfect drill at full tempo cannot mint full-chart rewards.
    await chooseTempo(100)
    await click('Start', host.querySelector('.player-controls')!)
    await finish()
    expect(loadProgress()).toEqual(progressBefore)
    expect(loadHistory()).toHaveLength(1)
    expect(loadProfile().streak).toBe(profileBefore.streak)
    expect(loadProfile().xp).toBeGreaterThan(profileBefore.xp)
    await click('Back to Perform', host.querySelector('[role="dialog"]')!)
    expect(runs.at(-1)!.opts).toMatchObject({ stepIndex: 2, tempoPct: 100, lesson: { id: 'first-taps', bars: 4 } })
    await finish()
    expect(loadHistory()).toHaveLength(2)
    expect(host.textContent).toContain('+50 points since last time')
    expect(host.textContent).not.toContain('A smaller part to work on')
    await click('Back to studio')
    expect(host.textContent).toContain('Your last groove')
    act(() => root.unmount())
    root = createRoot(host)
    await mount()
    await click('Replay Perform')
    // The ordinary resume point is still practice step 0; replay skips to Perform.
    expect(runs.at(-1)!.opts).toMatchObject({ stepIndex: 2, mode: 'play', tempoPct: 100 })
  })

  it('never ticks off a practice step from its drill, including wait-mode completion', async () => {
    await mount()
    await click('Play now')
    await finish(12)
    expect(loadProgress()).toEqual({})
    await click('Practice bars')
    await finish()
    expect(loadProgress()).toEqual({})
    expect(loadHistory()).toEqual([])
    await click('Repeat phrase')
    await click('Practice', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
    await finish()
    expect(loadProgress()).toEqual({})
    expect(host.textContent).toContain('Practice complete')
    await click('Back to The pulse', host.querySelector('[role="dialog"]')!)
    expect(runs.at(-1)!.opts).toMatchObject({ mode: 'play', stepIndex: 0, tempoPct: 100 })
  })

  it('removes the Fade twist for a drill, restores it afterward, and grants daily credit only on the full chart', async () => {
    vi.spyOn(daily, 'dailyModifier').mockReturnValue(daily.DAILY_MODIFIERS.fade)
    vi.spyOn(curriculum, 'dailyLesson').mockReturnValue(LESSONS.find((lesson) => lesson.id === 'first-taps')!)
    await mount()
    await click('Daily groove')
    await click('Perform', host.querySelector('.step-strip')!)
    await click('Start', host.querySelector('.player-controls')!)
    await finish(runs.at(-1)!.score!.events.length)
    expect(loadProfile().dailyChallengeDone).toBe(false)
    await click('Practice bars')
    expect(host.querySelector('[data-testid="highway"]')!.getAttribute('data-fade')).toBe('0')
    await chooseTempo(100)
    await click('Start', host.querySelector('.player-controls')!)
    await finish()
    expect(loadProfile().dailyChallengeDone).toBe(false)
    expect(loadHistory()).toHaveLength(1)
    await click('Back to Perform', host.querySelector('[role="dialog"]')!)
    expect(host.querySelector('[data-testid="highway"]')!.getAttribute('data-fade')).toBe('1.5')
    await finish()
    expect(loadProfile().dailyChallengeDone).toBe(true)
    expect(loadHistory().map((r) => r.variant)).toEqual(['fade', 'fade'])
    await click('Back to studio')
    expect(host.textContent).not.toContain('Your last groove')
  })

  it('excludes slowed and aborted runs, and keeps the tempo of a saved ladder replay', async () => {
    saveLessonResult('first-taps', 95, 3)
    savePerformance({ lessonId: 'first-taps', completedAt: new Date().toISOString(), tempoPct: 115,
      variant: 'standard', accuracy: 92, maxCombo: 14, misses: 1, total: 16 }, [])
    await mount()
    await click('Replay Perform')
    expect(runs.at(-1)!.opts.tempoPct).toBe(115)
    await chooseTempo(80)
    expect(loadHistory()).toHaveLength(1)
    await click('Start', host.querySelector('.player-controls')!)
    await finish()
    expect(loadHistory()).toHaveLength(1)
    expect(host.textContent).not.toContain('since last time')
    await click('Retry')
    await click('Studio', host.querySelector('.player-bar')!)
    expect(loadHistory()).toHaveLength(1)
  })

  it('finishes three rounds with a pause and reload in the middle, then presents a saved recap', async () => {
    await mount()
    await click('Start 3 rounds')
    expect(runs.at(-1)!.opts).toMatchObject({ lesson: { id: 'first-taps' }, stepIndex: 0, tempoPct: 100 })
    await finish()
    expect(loadSession(LESSONS)?.results).toHaveLength(1)
    // Replaying the first round must not turn it into a completed second round.
    await click('Retry', host.querySelector('[role="dialog"]')!)
    await finish()
    expect(loadSession(LESSONS)?.results).toHaveLength(1)
    await click('Next round')
    expect(runs.at(-1)!.opts.stepIndex).toBe(1)
    await click('Pause session')
    expect(runs.at(-1)!.stop).toHaveBeenCalled()
    act(() => root.unmount())
    root = createRoot(host)
    await mount()
    expect(host.querySelector('.session-card')!.textContent).toContain('1/3 rounds')
    await click('Resume session')
    expect(runs.at(-1)!.opts.stepIndex).toBe(1)
    await finish()
    await click('Next round')
    expect(runs.at(-1)!.opts.stepIndex).toBe(2)
    await finish()
    expect(loadSession(LESSONS)?.results).toHaveLength(3)
    await click('Finish session')
    expect(host.querySelector('.session-card')!.textContent).toContain('Session complete')
    expect(host.querySelector('.session-card')!.textContent).toContain('48 notes landed')
    await click('Start another session')
    expect(loadSession(LESSONS)?.results).toHaveLength(0)
  })

  it('requires engagement and does not count focus drills or Listen as session rounds', async () => {
    await mount()
    await click('Start 3 rounds')
    await finish(16)
    expect(loadProfile().xp).toBe(0)
    expect(loadSession(LESSONS)?.results).toHaveLength(0)
    expect(host.querySelector('[role="dialog"]')!.textContent).not.toContain('Next round')
    await click('Practice bars')
    await finish()
    expect(loadSession(LESSONS)?.results).toHaveLength(0)
    expect(loadProfile().badges).not.toContain('three-star')
    await click('Back to The pulse', host.querySelector('[role="dialog"]')!)
    await click('Listen', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
    await finish()
    expect(loadSession(LESSONS)?.results).toHaveLength(0)
    await click('Play', host.querySelector('.segmented')!)
    await click('Start', host.querySelector('.player-controls')!)
    await finish()
    expect(loadSession(LESSONS)?.results).toHaveLength(1)
  })

  it('celebrates wait-mode completion without a fake score and preserves Practice-only lesson continuity', async () => {
    await mount()
    await click('Start 3 rounds')
    for (let i = 0; i < 3; i++) {
      await click('Practice', host.querySelector('.segmented')!)
      await click('Start', host.querySelector('.player-controls')!)
      await finish()
      const dialog = host.querySelector('[role="dialog"]')!
      expect(dialog.textContent).toContain('Practice complete')
      expect(dialog.querySelector('.accuracy')).toBeNull()
      expect(dialog.querySelector('.stars')).toBeNull()
      expect(loadSession(LESSONS)?.results).toHaveLength(i + 1)
      if (i < 2) await click('Next round')
    }
    expect(loadHistory()).toEqual([])
    expect(loadProfile().xp).toBe(0)
    expect(loadProfile().lastLessonId).toBe('first-taps')
    expect(loadProgress()['first-taps'].stars).toBe(0)
    await click('Finish session')
    await click('Start another session')
    expect(runs.at(-1)!.opts).toMatchObject({ lesson: { id: 'first-taps' }, stepIndex: 2, tempoPct: 80 })
  })

  it('holds a mastered session to its planned tempos, including its final ladder rung', async () => {
    const progress = Object.fromEntries(LESSONS.map((l) => [l.id, { stars: 3, bestAccuracy: 95 }]))
    localStorage.setItem('padlab-progress-v1', JSON.stringify(progress))
    const plan = buildSession(LESSONS, progress, 'first-taps')!
    saveSession(plan)
    await mount()
    await click('Resume session')
    expect(runs.at(-1)!.opts.tempoPct).toBe(80)
    expect(host.querySelector<HTMLSelectElement>('.tempo-select')!.disabled).toBe(true)
    expect(host.querySelector('.ladder')).toBeNull()
    expect([...host.querySelectorAll<HTMLButtonElement>('.step-pill')].every((b) => b.disabled)).toBe(true)
    await finish()
    await click('Next round')
    expect(runs.at(-1)!.opts.tempoPct).toBe(100)
    await finish()
    await click('Next round')
    expect(runs.at(-1)!.opts.tempoPct).toBe(105)
    expect(host.querySelector<HTMLSelectElement>('.tempo-select')!.value).toBe('105')
  })

  it('refreshes yesterday’s goal and daily challenge when the studio regains focus after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 5, 23, 59))
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    saveProfile({ ...loadProfile(), dailyXp: 170, dailyXpDate: todayKey(),
      dailyChallengeDone: true, dailyChallengeDate: todayKey() })
    await mount()
    expect(host.querySelector('.daily-status')!.textContent).toBe('Cleared today')
    vi.setSystemTime(new Date(2026, 8, 6, 0, 1))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.querySelector('.daily-status')!.textContent).toBe('Take it on ›')
    expect(host.querySelector('.stat-card.goal .stat-value')!.textContent).toBe('0 / 150 XP')
  })
})
