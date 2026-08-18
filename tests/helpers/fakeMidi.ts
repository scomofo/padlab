import { vi } from 'vitest'

export interface FakeInput {
  id: string
  name: string
  onmidimessage: ((e: { data: Uint8Array | null }) => void) | null
  /** Push a raw MIDI message as if the device sent it. */
  send(bytes: number[] | null): void
}

export function fakeInput(name: string, id = name): FakeInput {
  const input: FakeInput = {
    id,
    name,
    onmidimessage: null,
    send(bytes) {
      input.onmidimessage?.({ data: bytes === null ? null : new Uint8Array(bytes) })
    },
  }
  return input
}

export const noteOn = (note: number, velocity = 100, channel = 0) => [0x90 | channel, note, velocity]
export const noteOff = (note: number, channel = 0) => [0x80 | channel, note, 0]

export interface FakeMidiAccess {
  inputs: Map<string, FakeInput>
  onstatechange: (() => void) | null
  /** Add an input after init, then fire the state-change the browser would. */
  connect(input: FakeInput): void
}

export function fakeMidiAccess(inputs: FakeInput[] = []): FakeMidiAccess {
  const map = new Map(inputs.map((i) => [i.id, i]))
  const access: FakeMidiAccess = {
    inputs: map,
    onstatechange: null,
    connect(input) {
      map.set(input.id, input)
      access.onstatechange?.()
    },
  }
  return access
}

/**
 * Installs `navigator.requestMIDIAccess`. Pass null to simulate a browser
 * without Web MIDI, or 'deny' to simulate the user refusing the prompt.
 */
export function stubMidiAccess(access: FakeMidiAccess | null | 'deny'): void {
  if (access === null) {
    // Deleting is what makes the `'requestMIDIAccess' in navigator` check fail.
    vi.stubGlobal('navigator', { ...globalThis.navigator })
    delete (globalThis.navigator as unknown as Record<string, unknown>).requestMIDIAccess
    return
  }
  const impl =
    access === 'deny'
      ? vi.fn().mockRejectedValue(new Error('SecurityError'))
      : vi.fn().mockResolvedValue(access)
  vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: impl })
}
