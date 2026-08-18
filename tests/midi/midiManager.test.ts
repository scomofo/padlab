/**
 * @vitest-environment jsdom
 *
 * `midi` is a module-level singleton that caches its MIDIAccess and reads
 * localStorage at construction, so each test imports a fresh copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakeInput,
  fakeMidiAccess,
  noteOff,
  noteOn,
  stubMidiAccess,
  type FakeInput,
  type FakeMidiAccess,
} from '../helpers/fakeMidi'

async function freshMidi() {
  vi.resetModules()
  const mod = await import('../../src/midi/midiManager')
  return mod.midi
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('init', () => {
  it('reports unsupported when the browser has no Web MIDI', async () => {
    stubMidiAccess(null)
    const midi = await freshMidi()
    await midi.init()
    expect(midi.status).toBe('unsupported')
    expect(midi.inputs).toEqual([])
  })

  it('reports denied when the user refuses the prompt', async () => {
    stubMidiAccess('deny')
    const midi = await freshMidi()
    await midi.init()
    expect(midi.status).toBe('denied')
  })

  it('reports ready and lists inputs on success', async () => {
    stubMidiAccess(fakeMidiAccess([fakeInput('MPK Mini MK4')]))
    const midi = await freshMidi()
    await midi.init()
    expect(midi.status).toBe('ready')
    expect(midi.inputs).toHaveLength(1)
    expect(midi.inputs[0].profile.id).toBe('mpk-mini-mk4')
  })

  it('does not retry after being denied', async () => {
    stubMidiAccess('deny')
    const midi = await freshMidi()
    await midi.init()
    const request = navigator.requestMIDIAccess as ReturnType<typeof vi.fn>
    await midi.init()
    expect(request).toHaveBeenCalledOnce()
  })

  it('picks up devices plugged in after init', async () => {
    const access = fakeMidiAccess([])
    stubMidiAccess(access)
    const midi = await freshMidi()
    await midi.init()
    expect(midi.inputs).toHaveLength(0)

    access.connect(fakeInput('SP-404 MKII'))
    expect(midi.inputs).toHaveLength(1)
    expect(midi.inputs[0].profile.id).toBe('sp404-mk2')
  })

  it('names an input with no name rather than showing undefined', async () => {
    const input = fakeInput('x')
    ;(input as { name: string | null }).name = null as unknown as string
    stubMidiAccess(fakeMidiAccess([input]))
    const midi = await freshMidi()
    await midi.init()
    expect(midi.inputs[0].name).toBe('Unknown device')
  })
})

describe('message filtering', () => {
  let midi: Awaited<ReturnType<typeof freshMidi>>
  let input: FakeInput
  let access: FakeMidiAccess

  beforeEach(async () => {
    input = fakeInput('SP-404 MKII')
    access = fakeMidiAccess([input])
    stubMidiAccess(access)
    midi = await freshMidi()
    await midi.init()
  })

  it('forwards a note-on as a pad hit', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    input.send(noteOn(38, 96)) // SP-404 pad 3
    expect(pads).toHaveBeenCalledWith(3, 96)
  })

  it('ignores note-off messages', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    input.send(noteOff(38))
    expect(pads).not.toHaveBeenCalled()
  })

  it('ignores a zero-velocity note-on, which is a note-off in disguise', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    input.send(noteOn(38, 0))
    expect(pads).not.toHaveBeenCalled()
  })

  it('ignores non-note traffic like CC from knobs', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    input.send([0xb0, 74, 100]) // control change
    input.send([0xe0, 0, 64]) // pitch bend
    expect(pads).not.toHaveBeenCalled()
  })

  it('survives short or absent message data', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    expect(() => {
      input.send([0x90])
      input.send([0x90, 38])
      input.send(null)
    }).not.toThrow()
    expect(pads).not.toHaveBeenCalled()
  })

  it('accepts note-ons on any MIDI channel', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    input.send(noteOn(38, 100, 5))
    expect(pads).toHaveBeenCalledWith(3, 100)
  })

  it('drops notes the profile does not map to a pad', async () => {
    const mpk = fakeInput('MPK Mini MK4')
    access.connect(mpk)
    const pads = vi.fn()
    midi.onPad(pads)
    mpk.send(noteOn(60)) // outside both MPK banks
    expect(pads).not.toHaveBeenCalled()
  })
})

describe('MIDI Learn (custom mapping)', () => {
  let midi: Awaited<ReturnType<typeof freshMidi>>
  let input: FakeInput

  beforeEach(async () => {
    input = fakeInput('MPK Mini MK4')
    stubMidiAccess(fakeMidiAccess([input]))
    midi = await freshMidi()
    await midi.init()
  })

  it('routes through the learned map instead of the profile', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    midi.setCustomMap({ 60: 1, 62: 2 })
    input.send(noteOn(60))
    expect(pads).toHaveBeenCalledWith(1, 100)
  })

  /**
   * The README promises a learned mapping is authoritative: "notes outside it
   * (keybed, knobs, transport buttons) are ignored, so nothing but your pads
   * can trigger a sound." Without this, the profile fallback would still fire.
   */
  it('ignores notes outside the learned map rather than falling back', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    midi.setCustomMap({ 60: 1 })
    input.send(noteOn(36)) // pad 1 under the MPK profile, but not in the map
    expect(pads).not.toHaveBeenCalled()
  })

  it('restores the profile when the map is cleared', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    midi.setCustomMap({ 60: 1 })
    midi.setCustomMap(null)
    input.send(noteOn(36))
    expect(pads).toHaveBeenCalledWith(1, 100)
  })

  it('persists the map and reloads it on the next session', async () => {
    midi.setCustomMap({ 60: 7 })
    const reloaded = await freshMidi()
    expect(reloaded.customMap).toEqual({ 60: 7 })
  })

  it('clearing the map also clears it from storage', async () => {
    midi.setCustomMap({ 60: 7 })
    midi.setCustomMap(null)
    const reloaded = await freshMidi()
    expect(reloaded.customMap).toBeNull()
  })

  it('an empty learned map silences every note', async () => {
    const pads = vi.fn()
    midi.onPad(pads)
    midi.setCustomMap({})
    for (let n = 0; n <= 127; n++) input.send(noteOn(n))
    expect(pads).not.toHaveBeenCalled()
  })
})

describe('listeners', () => {
  let midi: Awaited<ReturnType<typeof freshMidi>>
  let input: FakeInput

  beforeEach(async () => {
    input = fakeInput('SP-404 MKII')
    stubMidiAccess(fakeMidiAccess([input]))
    midi = await freshMidi()
    await midi.init()
  })

  it('gives raw listeners every note-on, mapped or not', async () => {
    const raw = vi.fn()
    midi.onRaw(raw)
    midi.setCustomMap({}) // nothing maps to a pad
    input.send(noteOn(60, 77))
    expect(raw).toHaveBeenCalledWith(60, 77, 'SP-404 MKII')
  })

  it('stops calling listeners after they unsubscribe', async () => {
    const pad = vi.fn()
    const raw = vi.fn()
    midi.onPad(pad)()
    midi.onRaw(raw)()
    input.send(noteOn(38))
    expect(pad).not.toHaveBeenCalled()
    expect(raw).not.toHaveBeenCalled()
  })

  it('notifies status listeners when the mapping changes', async () => {
    const status = vi.fn()
    midi.onStatusChange(status)
    midi.setCustomMap({ 60: 1 })
    expect(status).toHaveBeenCalled()
  })

  it('notifies status listeners when a device connects', async () => {
    const access = fakeMidiAccess([])
    stubMidiAccess(access)
    const fresh = await freshMidi()
    await fresh.init()
    const status = vi.fn()
    fresh.onStatusChange(status)
    access.connect(fakeInput('MPK Mini MK4'))
    expect(status).toHaveBeenCalled()
  })
})
