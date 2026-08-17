import { getAudioContext } from '../audio/audio'

export type TransportState = 'stopped' | 'playing' | 'paused'

/**
 * Beat-domain clock anchored to AudioContext time.
 * Beat 0 is the start of the chart; count-in occupies negative beats.
 * bpm/tempoScale must only change while stopped (mapping is re-anchored on start).
 */
export class Transport {
  bpm = 120
  tempoScale = 1
  state: TransportState = 'stopped'

  private anchorBeat = 0
  private anchorCtxTime = 0

  get secPerBeat(): number {
    return 60 / (this.bpm * this.tempoScale)
  }

  start(fromBeat: number): void {
    const ctx = getAudioContext()
    this.anchorBeat = fromBeat
    this.anchorCtxTime = ctx.currentTime + 0.1 // small offset so the first events schedule cleanly
    this.state = 'playing'
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.anchorBeat = this.now()
    this.anchorCtxTime = getAudioContext().currentTime
    this.state = 'paused'
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.anchorCtxTime = getAudioContext().currentTime
    this.state = 'playing'
  }

  stop(): void {
    this.state = 'stopped'
    this.anchorBeat = 0
  }

  /** Current position in beats. */
  now(): number {
    if (this.state === 'playing') {
      return this.anchorBeat + (getAudioContext().currentTime - this.anchorCtxTime) / this.secPerBeat
    }
    return this.anchorBeat
  }

  beatToCtxTime(beat: number): number {
    return this.anchorCtxTime + (beat - this.anchorBeat) * this.secPerBeat
  }
}
