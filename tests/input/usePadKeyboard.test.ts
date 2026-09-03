/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { padBus, type PadEvent } from '../../src/input/inputBus'
import { usePadKeyboard } from '../../src/input/usePadKeyboard'

vi.mock('../../src/audio/audio', () => ({
  unlockAudio: vi.fn(),
  setMasterVolume: vi.fn(),
  getAudioContext: vi.fn(),
  getMaster: vi.fn(),
}))

function Harness({ maxPad }: { maxPad: number }) {
  usePadKeyboard(maxPad)
  return createElement('div', { 'data-testid': 'harness' })
}

function keydown(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

describe('usePadKeyboard', () => {
  let root: Root
  let host: HTMLDivElement
  let hits: PadEvent[]
  let off: () => void

  beforeEach(() => {
    hits = []
    off = padBus.subscribe((e) => hits.push(e))
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    off()
    act(() => root.unmount())
    host.remove()
  })

  it('maps Z X C V to pads 1-4 and publishes them on the bus', () => {
    act(() => root.render(createElement(Harness, { maxPad: 8 })))
    act(() => {
      keydown({ key: 'z' })
      keydown({ key: 'X' })
      keydown({ key: 'c' })
      keydown({ key: 'v' })
    })
    expect(hits.map((h) => h.pad)).toEqual([1, 2, 3, 4])
    expect(hits.every((h) => h.source === 'keyboard' && h.velocity === 100)).toBe(true)
  })

  it('ignores keys outside the map, modifiers, and auto-repeat', () => {
    act(() => root.render(createElement(Harness, { maxPad: 8 })))
    act(() => {
      keydown({ key: 'g' })
      keydown({ key: 'z', metaKey: true })
      keydown({ key: 'z', ctrlKey: true })
      keydown({ key: 'z', altKey: true })
      keydown({ key: 'z', repeat: true })
    })
    expect(hits).toEqual([])
  })

  it('ignores mapped keys typed into form fields', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => root.render(createElement(Harness, { maxPad: 8 })))
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }))
    })
    expect(hits).toEqual([])
    input.remove()
  })

  it('drops pads above maxPad so an 8-pad layout cannot fire pad 9', () => {
    act(() => root.render(createElement(Harness, { maxPad: 8 })))
    act(() => {
      keydown({ key: 'q' }) // pad 9
      keydown({ key: 'f' }) // pad 8
    })
    expect(hits.map((h) => h.pad)).toEqual([8])
  })

  it('removes the listener on unmount so later keydowns do not score', () => {
    act(() => root.render(createElement(Harness, { maxPad: 8 })))
    act(() => root.unmount())
    act(() => keydown({ key: 'z' }))
    expect(hits).toEqual([])
  })
})
