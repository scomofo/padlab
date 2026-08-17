import { profileForInput, type DeviceProfile } from './deviceProfiles'
import { loadCustomMap, saveCustomMap } from '../store/progress'

export type MidiStatus = 'idle' | 'unsupported' | 'denied' | 'ready'

export interface ConnectedInput {
  id: string
  name: string
  profile: DeviceProfile
}

type PadListener = (pad: number, velocity: number) => void
type RawListener = (note: number, velocity: number, inputName: string) => void
type StatusListener = () => void

/**
 * Owns Web MIDI access. Note-ons are mapped to pad numbers through a per-device
 * profile, unless the user has recorded a custom mapping via MIDI Learn.
 */
class MidiManager {
  status: MidiStatus = 'idle'
  inputs: ConnectedInput[] = []
  /** note -> pad override recorded by MIDI Learn (applies to all inputs). */
  customMap: Record<number, number> | null = loadCustomMap()

  private access: MIDIAccess | null = null
  private padListeners = new Set<PadListener>()
  private rawListeners = new Set<RawListener>()
  private statusListeners = new Set<StatusListener>()

  async init(): Promise<void> {
    if (this.access || this.status === 'unsupported' || this.status === 'denied') return
    if (!('requestMIDIAccess' in navigator)) {
      this.status = 'unsupported'
      this.notifyStatus()
      return
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
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
    this.inputs = []
    this.access.inputs.forEach((input) => {
      const name = input.name ?? 'Unknown device'
      this.inputs.push({ id: input.id, name, profile: profileForInput(name) })
      input.onmidimessage = (e: MIDIMessageEvent) => this.handleMessage(name, e)
    })
    this.notifyStatus()
  }

  private handleMessage(inputName: string, e: MIDIMessageEvent): void {
    const data = e.data
    if (!data || data.length < 3) return
    const type = data[0] & 0xf0
    const note = data[1]
    const velocity = data[2]
    if (type !== 0x90 || velocity === 0) return // note-on only

    for (const l of this.rawListeners) l(note, velocity, inputName)

    // A learned mapping is authoritative: notes outside it (keybed, transport
    // buttons) are ignored rather than falling back to the profile.
    const pad = this.customMap
      ? this.customMap[note] ?? null
      : profileForInput(inputName).noteToPad(note)
    if (pad !== null) {
      for (const l of this.padListeners) l(pad, velocity)
    }
  }

  setCustomMap(map: Record<number, number> | null): void {
    this.customMap = map
    saveCustomMap(map)
    this.notifyStatus()
  }

  onPad(l: PadListener): () => void {
    this.padListeners.add(l)
    return () => this.padListeners.delete(l)
  }

  /** Raw note-ons, used by MIDI Learn. */
  onRaw(l: RawListener): () => void {
    this.rawListeners.add(l)
    return () => this.rawListeners.delete(l)
  }

  onStatusChange(l: StatusListener): () => void {
    this.statusListeners.add(l)
    return () => this.statusListeners.delete(l)
  }

  private notifyStatus(): void {
    for (const l of this.statusListeners) l()
  }
}

export const midi = new MidiManager()
