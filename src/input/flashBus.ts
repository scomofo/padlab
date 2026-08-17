// Pad-light feedback for engine-driven (auto-played) notes, separate from the
// real input bus so auto flashes never register as player hits.

type Listener = (pad: number) => void

class AutoFlashBus {
  private listeners = new Set<Listener>()

  emit(pad: number): void {
    for (const l of this.listeners) l(pad)
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}

export const autoFlashBus = new AutoFlashBus()
