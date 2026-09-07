import { describe, expect, it } from 'vitest'
import { ACCEPTANCE_CHECKS, appendCapture, createAcceptanceReport, summarizeCapture, type AcceptanceResults } from '../../src/midi/acceptance'
import type { MidiDiagnosticEvent } from '../../src/midi/midiManager'
const event = (delay: number): MidiDiagnosticEvent => ({ inputId: 'test', inputName: 'Synthetic fixture',
  channel: 0, data: [144, 36, 100], pad: 1, disposition: 'mapped', timeStamp: 100,
  receivedAtMs: 100 + delay, timestampSource: 'event' })
const base = { build: 'test-only', controller: 'synthetic', firmware: '', audioOutput: 'fake',
  checks: {} as AcceptanceResults, notes: '', events: [], environment: {} }
describe('hardware acceptance evidence', () => {
  it('never turns device detection or an empty capture into a pass', () => {
    const report = createAcceptanceReport(base)
    expect(report.status).toBe('incomplete')
    expect(Object.values(report.checks).every((c) => c.result === 'not-run')).toBe(true)
    expect(report.capture.summary.deliveryMedianMs).toBeNull()
  })
  it('distinguishes failure, incomplete metadata and explicit operator passes', () => {
    const checks = Object.fromEntries(ACCEPTANCE_CHECKS.map(([id]) => [id, 'pass'])) as AcceptanceResults
    expect(createAcceptanceReport({ ...base, checks }).status).toBe('operator-reported-pass')
    expect(createAcceptanceReport({ ...base, checks, controller: '' }).status).toBe('incomplete')
    expect(createAcceptanceReport({ ...base, checks: { ...checks, reconnect: 'fail' } }).status).toBe('failed')
  })
  it('bounds memory and excludes fallback timestamps from delivery percentiles', () => {
    let events: MidiDiagnosticEvent[] = []
    for (let i = 0; i < 250; i++) events = appendCapture(events, event(i))
    expect(events).toHaveLength(200); expect(events[0].receivedAtMs).toBe(150)
    expect(summarizeCapture([event(10), event(30), { ...event(999), timestampSource: 'fallback' }]))
      .toMatchObject({ deliveryMedianMs: 10, deliveryP95Ms: 30, deliveryMaxMs: 30, fallbackTimestamps: 1 })
  })
})
