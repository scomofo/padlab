import { profileForInput, type DeviceProfile } from './deviceProfiles'
import { loadCustomMap, saveCustomMap } from '../store/progress'
import { captureInputTiming, type InputTiming } from '../input/timing'

export type MidiStatus = 'idle' | 'unsupported' | 'denied' | 'ready'
export interface ConnectedInput { id: string; name: string; profile: DeviceProfile }
export interface MidiDiagnosticEvent extends InputTiming {
  inputId: string
  inputName: string
  channel: number // zero based, matching learned mappings
  data: number[]
  pad: number | null
  disposition: 'mapped' | 'unmapped' | 'not-note-on'
}
type PadListener = (pad: number, velocity: number, timeStamp?: number) => void
type RawListener = (note: number, velocity: number, channel: number, inputName: string) => void
type StatusListener = () => void

/** Legacy note-only maps remain compatible; new maps isolate MIDI channels. */
export function customMapLookup(map: Record<string, number>, note: number, channel: number): number | null {
  return map[`${channel}:${note}`] ?? map[note] ?? null
}

class MidiManager {
  status: MidiStatus = 'idle'
  inputs: ConnectedInput[] = []
  customMap: Record<string, number> | null = loadCustomMap()
  private access: MIDIAccess | null = null
  private initializing: Promise<void> | null = null
  private attached = new Map<string, MIDIInput>()
  private padListeners = new Set<PadListener>()
  private rawListeners = new Set<RawListener>()
  private statusListeners = new Set<StatusListener>()
  private diagnosticListeners = new Set<(event: MidiDiagnosticEvent) => void>()

  async init(): Promise<void> {
    if (this.access || this.status === 'unsupported' || this.status === 'denied') return
    if (this.initializing) return this.initializing
    this.initializing = this.requestAccess()
    try { await this.initializing } finally { this.initializing = null }
  }

  private async requestAccess(): Promise<void> {
    if (!('requestMIDIAccess' in navigator)) {
      this.status = 'unsupported'
      this.notifyStatus()
      return
    }
    try { this.access = await navigator.requestMIDIAccess({ sysex: false }) }
    catch {
      this.status = 'denied'
      this.notifyStatus()
      return
    }
    this.status = 'ready'
    this.attachInputs()
    this.access.onstatechange = () => this.attachInputs()
  }

  private attachInputs(): void {
    if (!this.access) return
    const live = new Map<string, MIDIInput>()
    this.access.inputs.forEach((input) => {
      if (input.state !== 'disconnected') live.set(input.id, input)
    })
    // Browsers can retain disconnected ports or replace objects with the same ID.
    for (const [id, input] of this.attached) {
      if (live.get(id) !== input) input.onmidimessage = null
    }
    this.attached = live
    this.inputs = [...live.values()].map((input) => {
      const name = input.name ?? 'Unknown device'
      input.onmidimessage = (e: MIDIMessageEvent) => this.handleMessage(input.id, name, e)
      return { id: input.id, name, profile: profileForInput(name) }
    })
    this.notifyStatus()
  }

  private handleMessage(inputId: string, inputName: string, e: MIDIMessageEvent): void {
    const data = e.data
    if (!data || data.length < 1) return
    const timing = captureInputTiming(e.timeStamp)
    const type = data[0] & 0xf0
    const channel = data[0] & 0x0f
    const noteOn = data.length >= 3 && type === 0x90 && data[2] > 0
    let pad: number | null = null
    if (noteOn) {
      const note = data[1], velocity = data[2]
      for (const l of this.rawListeners) l(note, velocity, channel, inputName)
      // Learned maps are authoritative: unlearned notes never fall through.
      pad = this.customMap ? customMapLookup(this.customMap, note, channel)
        : profileForInput(inputName).noteToPad(note, channel)
      if (pad !== null) for (const l of this.padListeners) {
        if (e.timeStamp === undefined) l(pad, velocity) // legacy test adapters
        else l(pad, velocity, e.timeStamp)
      }
    }
    // Opt-in diagnostics run after scoring/audio, never before the live route.
    if (this.diagnosticListeners.size) {
      const event: MidiDiagnosticEvent = {
        ...timing, inputId, inputName, channel, data: Array.from(data.slice(0, 3)), pad,
        disposition: !noteOn ? 'not-note-on' : pad === null ? 'unmapped' : 'mapped',
      }
      for (const l of this.diagnosticListeners) l(event)
    }
  }

  onMessage(listener: (event: MidiDiagnosticEvent) => void): () => void {
    this.diagnosticListeners.add(listener)
    return () => { this.diagnosticListeners.delete(listener) }
  }

  setCustomMap(map: Record<string, number> | null): void {
    this.customMap = map
    saveCustomMap(map)
    this.notifyStatus()
  }

  onPad(l: PadListener): () => void {
    this.padListeners.add(l)
    return () => { this.padListeners.delete(l) }
  }

  onRaw(l: RawListener): () => void {
    this.rawListeners.add(l)
    return () => { this.rawListeners.delete(l) }
  }

  onStatusChange(l: StatusListener): () => void {
    this.statusListeners.add(l)
    return () => { this.statusListeners.delete(l) }
  }

  private notifyStatus(): void {
    for (const l of this.statusListeners) l()
  }
}

export const midi = new MidiManager()
