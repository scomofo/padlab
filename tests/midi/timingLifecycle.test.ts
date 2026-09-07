/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeInput, fakeMidiAccess, noteOn, stubMidiAccess } from '../helpers/fakeMidi'
beforeEach(() => { vi.resetModules(); localStorage.clear() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function setup() {
  const input = fakeInput('SP-404 MKII')
  const access = fakeMidiAccess([input]); stubMidiAccess(access)
  const { midi } = await import('../../src/midi/midiManager'); await midi.init()
  return { midi, input, access }
}
describe('MIDI timing and port lifecycle', () => {
  it('forwards original event timestamps and distinguishes ignored controls', async () => {
    const { midi, input } = await setup(); const hit = vi.fn(), observed = vi.fn()
    const off = midi.onPad(hit), offMessage = midi.onMessage(observed)
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    input.onmidimessage?.({ data: new Uint8Array(noteOn(36)), timeStamp: 920 } as Parameters<NonNullable<typeof input.onmidimessage>>[0])
    expect(hit).toHaveBeenCalledWith(1, 100, 920)
    input.send([0xb0, 1, 100]); input.send([0x90, 36, 0])
    expect(hit).toHaveBeenCalledOnce()
    expect(observed.mock.calls[0][0]).toMatchObject({ timeStamp: 920, receivedAtMs: 1000, pad: 1, disposition: 'mapped' })
    expect(observed.mock.calls[1][0].disposition).toBe('not-note-on')
    off(); offMessage(); input.send(noteOn(36)); expect(observed).toHaveBeenCalledTimes(3)
  })
  it('detaches disconnected and replaced ports, then reconnects once', async () => {
    const { midi, input, access } = await setup(); const hit = vi.fn(); midi.onPad(hit)
    Object.assign(input, { state: 'disconnected' }); access.onstatechange?.()
    expect(midi.inputs).toHaveLength(0); expect(input.onmidimessage).toBeNull()
    input.send(noteOn(36)); expect(hit).not.toHaveBeenCalled()
    Object.assign(input, { state: 'connected' }); access.onstatechange?.()
    input.send(noteOn(36)); expect(hit).toHaveBeenCalledTimes(1)
    const replacement = fakeInput('SP-404 MKII', input.id); access.connect(replacement)
    expect(input.onmidimessage).toBeNull(); replacement.send(noteOn(36))
    expect(hit).toHaveBeenCalledTimes(2); expect(midi.inputs).toHaveLength(1)
  })
  it('shares an in-flight permission request across concurrent mounts', async () => {
    stubMidiAccess(fakeMidiAccess())
    const { midi } = await import('../../src/midi/midiManager')
    await Promise.all([midi.init(), midi.init()])
    expect(navigator.requestMIDIAccess).toHaveBeenCalledOnce()
  })
})
