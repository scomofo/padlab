// Shared AudioContext + master output chain.

let ctx: AudioContext | null = null
let master: GainNode | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 4
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(comp)
    comp.connect(ctx.destination)
  }
  return ctx
}

export function getMaster(): GainNode {
  getAudioContext()
  return master!
}

/** Call from a user gesture; browsers start AudioContexts suspended. */
export function unlockAudio(): void {
  const c = getAudioContext()
  if (c.state === 'suspended') void c.resume()
}

export function setMasterVolume(v: number): void {
  getMaster().gain.value = Math.max(0, Math.min(1, v))
}
