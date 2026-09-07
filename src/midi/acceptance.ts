import type { MidiDiagnosticEvent } from './midiManager'

export const CAPTURE_LIMIT = 200
export const ACCEPTANCE_CHECKS = [
  ['factory', 'Factory mapping: every pad and both MPK banks'],
  ['learn', 'MIDI Learn: remapping survives reopening'],
  ['isolation', 'Keybed, knobs and transport never score pad hits'],
  ['compensation', 'Judging checked at -50, 20 and 150 ms'],
  ['rolls', 'Fast rolls preserved; duplicate strikes ignored'],
  ['reconnect', 'Unplug/replug recovers without restarting'],
  ['progress', 'Perform, daily credit and saved progress verified'],
  ['install', 'Release DMG mounts and installs into Applications'],
  ['launch', 'Installed app opens through documented Gatekeeper flow'],
  ['permission', 'Installed app detects the controller'],
  ['full-run', 'Installed app completes a real-controller run'],
  ['relaunch', 'Quit/relaunch preserves settings, mapping and progress'],
] as const
export type CheckId = typeof ACCEPTANCE_CHECKS[number][0]
export type CheckResult = 'not-run' | 'pass' | 'fail'
export type AcceptanceResults = Partial<Record<CheckId, CheckResult>>

export function appendCapture(events: MidiDiagnosticEvent[], event: MidiDiagnosticEvent): MidiDiagnosticEvent[] {
  return [...events.slice(-(CAPTURE_LIMIT - 1)), event]
}

export function summarizeCapture(events: MidiDiagnosticEvent[]) {
  const delays = events.filter((e) => e.timestampSource === 'event')
    .map((e) => Math.max(0, e.receivedAtMs - e.timeStamp)).sort((a, b) => a - b)
  const percentile = (p: number) => delays.length
    ? Math.round(delays[Math.max(0, Math.ceil(p * delays.length) - 1)] * 10) / 10 : null
  return {
    retainedMessages: events.length,
    mappedNoteOns: events.filter((e) => e.disposition === 'mapped').length,
    unmappedNoteOns: events.filter((e) => e.disposition === 'unmapped').length,
    otherMessages: events.filter((e) => e.disposition === 'not-note-on').length,
    fallbackTimestamps: events.filter((e) => e.timestampSource === 'fallback').length,
    deliveryMedianMs: percentile(0.5), deliveryP95Ms: percentile(0.95), deliveryMaxMs: percentile(1),
  }
}

export function createAcceptanceReport(input: {
  build: string; controller: string; firmware: string; audioOutput: string
  checks: AcceptanceResults; notes: string; events: MidiDiagnosticEvent[]
  environment: Record<string, unknown>
}) {
  const checks = Object.fromEntries(ACCEPTANCE_CHECKS.map(([id, label]) =>
    [id, { label, result: input.checks[id] ?? 'not-run' }]))
  const values = Object.values(checks)
  const complete = values.every((c) => c.result === 'pass')
    && Boolean(input.build.trim() && input.controller.trim() && input.audioOutput.trim())
  return {
    schemaVersion: 1, capturedAt: new Date().toISOString(),
    status: values.some((c) => c.result === 'fail') ? 'failed' : complete ? 'operator-reported-pass' : 'incomplete',
    scope: 'Manual operator report, not automated hardware certification. Delivery delay is not audio round-trip latency.',
    build: input.build, controller: input.controller, firmware: input.firmware || 'not recorded',
    audioOutput: input.audioOutput, checks, notes: input.notes,
    environment: input.environment,
    capture: { limit: CAPTURE_LIMIT, summary: summarizeCapture(input.events), events: input.events },
  }
}
