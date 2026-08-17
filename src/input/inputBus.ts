// Central pad-input bus. MIDI, keyboard, and on-screen pads all publish here;
// the lesson player and pad grid subscribe.

export type InputSource = 'midi' | 'keyboard' | 'pointer'

export interface PadEvent {
  pad: number
  velocity: number
  source: InputSource
}

type Listener = (e: PadEvent) => void

class InputBus {
  private listeners = new Set<Listener>()

  emit(e: PadEvent): void {
    for (const l of this.listeners) l(e)
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
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
