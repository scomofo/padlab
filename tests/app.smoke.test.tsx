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

describe('App smoke', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
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
  })

  it('boots on the studio home, opens Device Setup, then a lesson', async () => {
    await act(async () => {
      root.render(createElement(App))
    })

    expect(host.textContent).toContain('PadLab')
    expect(host.textContent).toMatch(/Start here|Continue/)
    expect(host.textContent).toContain('Daily groove')
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
