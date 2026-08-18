import { describe, expect, it, vi } from 'vitest'
import { KEY_TO_PAD, keyLabelForPad, padBus, type PadEvent } from '../../src/input/inputBus'
import { autoFlashBus } from '../../src/input/flashBus'

const hit = (over: Partial<PadEvent> = {}): PadEvent => ({
  pad: 1,
  velocity: 100,
  source: 'keyboard',
  ...over,
})

describe('padBus', () => {
  it('delivers an event to every subscriber', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = padBus.subscribe(a)
    const offB = padBus.subscribe(b)
    padBus.emit(hit({ pad: 3 }))
    expect(a).toHaveBeenCalledWith(expect.objectContaining({ pad: 3 }))
    expect(b).toHaveBeenCalledOnce()
    offA()
    offB()
  })

  it('stops delivering after unsubscribe', () => {
    const l = vi.fn()
    padBus.subscribe(l)()
    padBus.emit(hit())
    expect(l).not.toHaveBeenCalled()
  })

  it('unsubscribing twice is harmless', () => {
    const off = padBus.subscribe(vi.fn())
    off()
    expect(() => off()).not.toThrow()
  })

  it('passes source and velocity through untouched', () => {
    const l = vi.fn()
    const off = padBus.subscribe(l)
    padBus.emit(hit({ pad: 9, velocity: 27, source: 'midi' }))
    expect(l).toHaveBeenCalledWith({ pad: 9, velocity: 27, source: 'midi' })
    off()
  })

  it('drops a duplicate subscription — the same function subscribes once', () => {
    const l = vi.fn()
    const off1 = padBus.subscribe(l)
    const off2 = padBus.subscribe(l)
    padBus.emit(hit())
    expect(l).toHaveBeenCalledOnce()
    off1()
    off2()
  })

  it('emitting with no subscribers does not throw', () => {
    expect(() => padBus.emit(hit())).not.toThrow()
  })
})

describe('autoFlashBus', () => {
  it('is a separate channel from padBus, so auto-played notes never score', () => {
    const padListener = vi.fn()
    const flashListener = vi.fn()
    const offPad = padBus.subscribe(padListener)
    const offFlash = autoFlashBus.subscribe(flashListener)

    autoFlashBus.emit(4)
    expect(flashListener).toHaveBeenCalledWith(4)
    expect(padListener).not.toHaveBeenCalled()

    offPad()
    offFlash()
  })
})

describe('KEY_TO_PAD', () => {
  it('covers all 16 pads exactly once', () => {
    const pads = Object.values(KEY_TO_PAD).sort((a, b) => a - b)
    expect(pads).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
  })

  it('puts pads 1-4 on the bottom row, matching MPC/SP-404 layout', () => {
    // The README documents Z X C V as pads 1-4.
    expect([KEY_TO_PAD.z, KEY_TO_PAD.x, KEY_TO_PAD.c, KEY_TO_PAD.v]).toEqual([1, 2, 3, 4])
  })

  it('lays out rows in ascending order bottom to top', () => {
    expect(['z', 'x', 'c', 'v'].map((k) => KEY_TO_PAD[k])).toEqual([1, 2, 3, 4])
    expect(['a', 's', 'd', 'f'].map((k) => KEY_TO_PAD[k])).toEqual([5, 6, 7, 8])
    expect(['q', 'w', 'e', 'r'].map((k) => KEY_TO_PAD[k])).toEqual([9, 10, 11, 12])
    expect(['1', '2', '3', '4'].map((k) => KEY_TO_PAD[k])).toEqual([13, 14, 15, 16])
  })

  it('uses only lowercase keys, since lookup lowercases the event key', () => {
    for (const k of Object.keys(KEY_TO_PAD)) expect(k).toBe(k.toLowerCase())
  })
})

describe('keyLabelForPad', () => {
  it('returns the uppercase key for each mapped pad', () => {
    expect(keyLabelForPad(1)).toBe('Z')
    expect(keyLabelForPad(8)).toBe('F')
    expect(keyLabelForPad(16)).toBe('4')
  })

  it('round-trips against KEY_TO_PAD for every pad', () => {
    for (let pad = 1; pad <= 16; pad++) {
      const label = keyLabelForPad(pad)
      expect(label).not.toBeNull()
      expect(KEY_TO_PAD[label!.toLowerCase()]).toBe(pad)
    }
  })

  it('returns null for pads with no key', () => {
    expect(keyLabelForPad(17)).toBeNull()
    expect(keyLabelForPad(0)).toBeNull()
  })
})
