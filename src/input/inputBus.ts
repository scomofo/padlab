// Capture timing once, before any audio/UI subscriber can delay dispatch.
import { captureInputTiming, type InputTiming } from './timing'

export type InputSource = 'midi' | 'keyboard' | 'pointer'
export interface PadEvent extends InputTiming {
  pad: number
  velocity: number
  source: InputSource
}
export type PadInput = Pick<PadEvent, 'pad' | 'velocity' | 'source'> & { timeStamp?: number }
type Listener = (e: PadEvent) => void

class InputBus {
  private listeners = new Map<Listener, 'realtime' | 'visual'>()

  emit(input: PadInput): void {
    const event: PadEvent = { ...input, ...captureInputTiming(input.timeStamp) }
    // Scoring and audio always precede DOM pad flashes, regardless of mount order.
    for (const phase of ['realtime', 'visual'] as const) {
      for (const [listener, kind] of this.listeners) if (kind === phase) listener(event)
    }
  }

  subscribe(listener: Listener, phase: 'realtime' | 'visual' = 'realtime'): () => void {
    this.listeners.set(listener, phase)
    return () => { this.listeners.delete(listener) }
  }
}

export const padBus = new InputBus()

/** Keyboard rows mirror the hardware: bottom-left pad = 1 (MPC / SP-404 convention). */
export const KEY_TO_PAD: Record<string, number> = {
  z: 1, x: 2, c: 3, v: 4,
  a: 5, s: 6, d: 7, f: 8,
  q: 9, w: 10, e: 11, r: 12,
  '1': 13, '2': 14, '3': 15, '4': 16,
}

export function keyLabelForPad(pad: number): string | null {
  for (const [key, p] of Object.entries(KEY_TO_PAD)) {
    if (p === pad) return key.toUpperCase()
  }
  return null
}
