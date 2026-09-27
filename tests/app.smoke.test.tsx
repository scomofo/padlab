/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('../src/audio/audio', () => ({
  unlockAudio: vi.fn(),
  setMasterVolume: vi.fn(),
  getAudioContext: vi.fn(),
  getMaster: vi.fn(),
}))

vi.mock('../src/audio/drumSynth', () => ({
  playSound: vi.fn(),
}))

import App from '../src/App'
import { padBus } from '../src/input/inputBus'

describe('App smoke', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    // jsdom has no 2d canvas; Highway would throw on getContext('2d')!.
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
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
        setTimeout(() => cb(Date.now()), 16) as unknown as number
      globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
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

  async function search(query: string) {
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    return input
  }

  async function level(value: string) {
    const select = host.querySelector<HTMLSelectElement>('.library-level select')!
    await act(async () => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function click(selector: string) {
    const button = host.querySelector<HTMLButtonElement>(selector)!
    expect(button).toBeTruthy()
    await act(async () => button.click())
  }

  it('combines search, pad layout and level without changing full-course progress', async () => {
    await act(async () => root.render(createElement(App)))
    const count = host.querySelector('.course-count')!.textContent
    await search(' FIRST   taps ')
    await level('1')
    await click('.filter-row button:nth-child(2)')
    expect(host.querySelectorAll('.lesson-card')).toHaveLength(1)
    expect(host.querySelector('.lesson-card h3')!.textContent).toBe('First Taps')
    expect(host.querySelector('.course-count')!.textContent).toBe(count)
    expect(host.querySelector('[role="status"]')!.textContent).toBe('1 lesson · 0 guides')
    await level('2')
    expect(host.querySelectorAll('.lesson-card')).toHaveLength(0)
    expect(host.textContent).toContain('No matching grooves')
    await click('.library-empty button')
    expect(host.querySelectorAll('.lesson-card').length).toBeGreaterThan(1)
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('')
    expect(document.activeElement).toBe(host.querySelector('input[type="search"]'))
    expect(host.querySelector<HTMLSelectElement>('.library-level select')!.value).toBe('all')
    expect(host.querySelector('.filter-row button')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('preserves discovery context after a lesson and keeps typing off the pad bus', async () => {
    await act(async () => root.render(createElement(App)))
    const emit = vi.spyOn(padBus, 'emit')
    const input = await search('first')
    input.focus()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })))
    expect(emit).not.toHaveBeenCalled()
    await level('1')
    await click('.filter-row button:nth-child(2)')
    const browser = host.querySelector<HTMLElement>('.browser')!
    browser.scrollTop = 540
    await act(async () => browser.dispatchEvent(new Event('scroll')))
    await click('.lesson-grid .lesson-card')
    const back = [...host.querySelectorAll('button')].find((button) => button.textContent === '‹ Studio')!
    await act(async () => back.click())
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('first')
    expect(host.querySelector<HTMLSelectElement>('.library-level select')!.value).toBe('1')
    expect(host.querySelector('.filter-row button:nth-child(2)')!.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector<HTMLElement>('.browser')!.scrollTop).toBe(540)
    await click('.search-clear')
    expect(document.activeElement).toBe(host.querySelector('input[type="search"]'))
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('')
  })

  it('boots on the studio home, opens Device Setup, then a lesson', async () => {
    await act(async () => {
      root.render(createElement(App))
    })

    expect(host.textContent).toContain('PadLab')
    expect(host.textContent).toMatch(/Start here|Continue/)
    expect(host.textContent).toContain('Daily groove')
    expect(host.textContent).toContain('The deck')
    expect(host.textContent).toContain('First Taps')

    const deviceChip = host.querySelector<HTMLButtonElement>('button.device-chip')
    expect(deviceChip).toBeTruthy()
    expect(deviceChip!.textContent).toMatch(/MIDI|device|keyboard/i)

    await act(async () => {
      deviceChip!.click()
    })
    expect(host.textContent).toContain('Device & settings')
    expect(host.textContent).toContain('Learn 8 pads')

    const close = [...host.querySelectorAll('button')].find((b) => b.textContent === '✕')
    expect(close).toBeTruthy()
    await act(async () => {
      close!.click()
    })
    expect(host.textContent).not.toContain('Device & settings')
    expect(host.textContent).toContain('Daily groove')

    const lessonCard = [...host.querySelectorAll<HTMLButtonElement>('button.lesson-card')].find((b) =>
      (b.textContent ?? '').includes('First Taps'),
    )
    expect(lessonCard).toBeTruthy()
    await act(async () => {
      lessonCard!.click()
    })
    expect(host.textContent).toContain('First Taps')
    expect(host.textContent).toContain('‹ Studio')
    expect(host.textContent).not.toContain('Daily groove')

    const back = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Studio'),
    )
    await act(async () => {
      back!.click()
    })
    expect(host.textContent).toContain('Daily groove')
  })
})
