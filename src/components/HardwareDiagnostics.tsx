import { useEffect, useRef, useState } from 'react'
import { midi, type MidiDiagnosticEvent } from '../midi/midiManager'
import { getAudioContext } from '../audio/audio'
import { ACCEPTANCE_CHECKS, appendCapture, createAcceptanceReport, summarizeCapture, type AcceptanceResults, type CheckResult } from '../midi/acceptance'

export function HardwareDiagnostics({ latencyMs }: { latencyMs: number }) {
  const buffer = useRef<MidiDiagnosticEvent[]>([])
  const [events, setEvents] = useState<MidiDiagnosticEvent[]>([])
  const [recording, setRecording] = useState(false)
  const [checks, setChecks] = useState<AcceptanceResults>({})
  const [build, setBuild] = useState('')
  const [controller, setController] = useState('')
  const [firmware, setFirmware] = useState('')
  const [audioOutput, setAudioOutput] = useState('')
  const [notes, setNotes] = useState('')
  const summary = summarizeCapture(events)
  useEffect(() => {
    if (!recording) return
    const off = midi.onMessage((event) => { buffer.current = appendCapture(buffer.current, event) })
    const timer = window.setInterval(() => setEvents([...buffer.current]), 250)
    return () => { off(); window.clearInterval(timer) }
  }, [recording])
  const reset = () => { setRecording(false); buffer.current = []; setEvents([]); setChecks({}) }
  const exportReport = () => {
    const audio = getAudioContext()
    const report = createAcceptanceReport({ build, controller, firmware, audioOutput,
      checks, notes, events: buffer.current, environment: {
        userAgent: navigator.userAgent, origin: location.origin, midiStatus: midi.status,
        inputs: midi.inputs.map(({ id, name, profile }) => ({ id, name, profile: profile.label })),
        mapping: midi.customMap ?? 'factory', latencyMs, audioState: audio.state,
        sampleRate: audio.sampleRate, baseLatencySeconds: audio.baseLatency ?? null,
        outputLatencySeconds: audio.outputLatency ?? null,
      } })
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `padlab-acceptance-${Date.now()}.json`
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <details className="hardware-diagnostics">
    <summary>Hardware acceptance &amp; MIDI diagnostics</summary>
    <p className="muted">Test one controller per report. Capture is opt-in, kept in memory, and limited to the last 200 MIDI messages. Nothing is uploaded.</p>
    <div className="row gap diagnostic-actions">
      <button className="btn" onClick={() => { setEvents([...buffer.current]); setRecording(!recording) }}>{recording ? 'Stop capture' : 'Start capture'}</button>
      <button className="btn ghost" onClick={reset}>Reset report</button>
      <button className="btn" onClick={exportReport}>Export acceptance JSON</button>
    </div>
    <p role="status">{recording ? 'Recording MIDI' : 'Capture stopped'} · {summary.retainedMessages} messages · {summary.mappedNoteOns} mapped hits · {summary.unmappedNoteOns} unmapped note-ons</p>
    <p className="muted">Callback delivery: median {summary.deliveryMedianMs ?? '—'} ms · p95 {summary.deliveryP95Ms ?? '—'} ms · max {summary.deliveryMaxMs ?? '—'} ms. This is not audio round-trip latency.</p>
    <div className="midi-log" aria-label="Recent MIDI messages">
      {events.slice(-5).reverse().map((e, i) => <div key={i}>
        {e.inputName} · Ch {e.channel + 1} · {e.data.join(' ')} → {e.pad === null ? e.disposition : `Pad ${e.pad}`}
      </div>)}
      {!events.length && <span className="muted">Start capture, then tap pads and test other controls.</span>}
    </div>
    <div className="diagnostic-fields">
      <label>Build / commit / DMG<input value={build} onChange={(e) => { setBuild(e.target.value); setChecks({}) }} placeholder="Release tag or commit tested" /></label>
      <label>Controller<input value={controller} onChange={(e) => { setController(e.target.value); reset() }} placeholder="MPK Mini MK4 or SP-404 MKII" /></label>
      <label>Firmware<input value={firmware} onChange={(e) => setFirmware(e.target.value)} placeholder="Version, or unknown" /></label>
      <label>Audio output<input value={audioOutput} onChange={(e) => { setAudioOutput(e.target.value); setChecks({}) }} placeholder="Wired headphones / interface" /></label>
    </div>
    <p className="muted">These are manual attestations, not automatically passed tests. Keep unperformed checks at “Not run”. A device appearing here is not a hardware pass.</p>
    <div className="acceptance-checks">
      {ACCEPTANCE_CHECKS.map(([id, label]) => <label key={id}>
        <span>{label}</span>
        <select aria-label={label} value={checks[id] ?? 'not-run'} onChange={(e) => setChecks({ ...checks, [id]: e.target.value as CheckResult })}>
          <option value="not-run">Not run</option><option value="pass">Pass</option><option value="fail">Fail</option>
        </select>
      </label>)}
    </div>
    <label className="diagnostic-notes">Observations / defects<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
  </details>
}
