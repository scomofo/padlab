/** Maximum event-delivery backlog accepted by a live run, not a wider hit window. */
export const INPUT_DELIVERY_GRACE_MS = 250

export interface InputTiming {
  /** Monotonic milliseconds in the performance.now() time domain. */
  timeStamp: number
  receivedAtMs: number
  timestampSource: 'event' | 'fallback'
}

/** Invalid/legacy epoch timestamps fall back to receipt; old valid events stay old. */
export function captureInputTiming(timeStamp?: number, receivedAtMs = performance.now()): InputTiming {
  const valid = typeof timeStamp === 'number' && Number.isFinite(timeStamp)
    && timeStamp >= 0 && timeStamp <= receivedAtMs
  return {
    timeStamp: valid ? timeStamp : receivedAtMs,
    receivedAtMs,
    timestampSource: valid ? 'event' : 'fallback',
  }
}

/**
 * Estimate render-clock time from a recent DOM timestamp. Deliberately NOT the
 * output clock: existing user calibration still accounts for device/output delay.
 * Call before synthesis or visual feedback. AudioContext must be running.
 */
export function eventAudioTime(timeStamp: number, contextTime: number, nowMs: number): number {
  return contextTime - (nowMs - timeStamp) / 1000
}
