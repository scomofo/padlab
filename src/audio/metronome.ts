import { getAudioContext } from './audio'
import { playClick } from './drumSynth'

const TICK_MS = 25
const LOOKAHEAD_SEC = 0.15

/** Standalone click track for the hardware guides (accent every 4th beat). */
export class Metronome {
  bpm = 90
  private timer: number | null = null
  private nextBeat = 0
  private nextTime = 0

  get running(): boolean {
    return this.timer !== null
  }

  start(bpm: number): void {
    this.stop()
    this.bpm = bpm
    this.nextBeat = 0
    this.nextTime = getAudioContext().currentTime + 0.1
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    const ctx = getAudioContext()
    const secPerBeat = 60 / this.bpm
    // Throttle catch-up: backgrounded tab leaves nextTime seconds behind —
    // skip missed beats instead of bursting them all at once on return.
    if (this.nextTime < ctx.currentTime - 0.25) {
      const missed = Math.ceil((ctx.currentTime - this.nextTime) / secPerBeat)
      this.nextBeat += missed
      this.nextTime += missed * secPerBeat
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      playClick(this.nextTime, this.nextBeat % 4 === 0)
      this.nextBeat++
      this.nextTime += secPerBeat
    }
  }
}
