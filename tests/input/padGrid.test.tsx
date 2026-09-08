/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('../../src/audio/audio', () => ({ unlockAudio: vi.fn() }))
import { PadGrid } from '../../src/components/PadGrid'
import { padBus } from '../../src/input/inputBus'

describe('accessible pad activation', () => {
  let host: HTMLDivElement
  let root: Root
  const heard = vi.fn()
  let off: () => void
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    heard.mockClear()
    off = padBus.subscribe(heard)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root.render(createElement(PadGrid, { padCount: 16 })))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    off()
    vi.unstubAllGlobals()
  })

  it('plays a focused pad activated through the keyboard or assistive click', async () => {
    const pad = host.querySelector<HTMLButtonElement>('[data-pad="16"]')!
    pad.focus()
    await act(async () => pad.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })))
    expect(heard).toHaveBeenCalledOnce()
    expect(heard.mock.calls[0][0]).toMatchObject({ pad: 16, source: 'keyboard', velocity: 100 })
  })

  it('does not replay a pointer strike when the subsequent click arrives', async () => {
    const pad = host.querySelector<HTMLButtonElement>('[data-pad="1"]')!
    await act(async () => {
      pad.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      pad.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    expect(heard).toHaveBeenCalledOnce()
    expect(heard.mock.calls[0][0]).toMatchObject({ pad: 1, source: 'pointer' })
  })
})
