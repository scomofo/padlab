import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { getAudioContext } from '../audio/audio'
import { playSound } from '../audio/drumSynth'
import { JamRuntime } from '../engine/jam'
import { padColor, padSoundFor } from '../engine/kits'
import { SOUND_LABELS } from '../engine/types'
import { autoFlashBus } from '../input/flashBus'
import { padBus } from '../input/inputBus'
import { usePadKeyboard } from '../input/usePadKeyboard'
import { JAM_BEATS, MAX_JAM_NOTES, type JamNote, type JamSketch } from '../lib/jam'
import { loadJam, saveJam } from '../store/jam'
import type { Settings } from '../store/progress'
import { PadGrid } from './PadGrid'
import './jam.css'

interface JamStudioProps {
  settings: Settings
  onExit: () => void
  initialSketch?: JamSketch
  onSketchChange?: (sketch: JamSketch) => void
}

type JamStatus = ReturnType<JamRuntime['readStatus']>
type UndoEntry = Pick<JamSketch, 'notes' | 'mutedPads'> & { action: 'take' | 'clear' }

const IDLE: JamStatus = { phase: 'idle', beat: 0, recordStart: null, pass: 0, pendingNotes: 0 }

function soundLabel(pad: number): string {
  const sound = padSoundFor(null, 16, pad)
  return sound ? SOUND_LABELS[sound] : `Pad ${pad}`
}

function sameNotes(a: JamNote[], b: JamNote[]): boolean {
  return a.length === b.length && a.every((note, i) => (
    note.t === b[i].t && note.pad === b[i].pad && note.vel === b[i].vel
  ))
}

export function JamStudio({ settings, onExit, initialSketch, onSketchChange }: JamStudioProps) {
  const [sketch, setSketch] = useState<JamSketch>(() => initialSketch ?? loadJam())
  const sketchRef = useRef(sketch)
  const [tempo, setTempo] = useState(String(sketch.bpm))
  const tempoRef = useRef(tempo)
  const runtimeRef = useRef<JamRuntime | null>(null)
  const startSequence = useRef(0)
  const startingRef = useRef(false)
  const [starting, setStarting] = useState(false)
  const [status, setStatus] = useState<JamStatus>(IDLE)
  const [metronome, setMetronome] = useState(settings.metronome)
  const [undo, setUndo] = useState<UndoEntry[]>([])
  const [saved, setSaved] = useState<boolean | null>(null)
  const [notice, setNotice] = useState('')

  usePadKeyboard(16)

  const updateSketch = useCallback((update: (current: JamSketch) => JamSketch) => {
    const next = update(sketchRef.current)
    sketchRef.current = next
    setSketch(next)
  }, [])

  useEffect(() => {
    // Persist to the external store and report the write result. The setState
    // here reports a side-effect outcome (storage write success), not derived
    // render data — that is this effect's job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(saveJam(sketch))
    onSketchChange?.(sketch)
  }, [sketch, onSketchChange])

  const commitTempo = useCallback(() => {
    const value = tempoRef.current.trim() ? Number(tempoRef.current) : sketchRef.current.bpm
    const bpm = Number.isFinite(value) ? Math.max(60, Math.min(180, Math.round(value))) : sketchRef.current.bpm
    tempoRef.current = String(bpm)
    setTempo(String(bpm))
    if (bpm !== sketchRef.current.bpm) updateSketch((current) => ({ ...current, bpm }))
  }, [updateSketch])

  useEffect(() => {
    const off = padBus.subscribe((event) => {
      // Capture the hit before synthesis or pad-flash work can delay it.
      runtimeRef.current?.handlePad(event.pad, event.velocity, event.timeStamp)
      const sound = padSoundFor(null, 16, event.pad)
      if (sound) playSound(sound, undefined, event.velocity)
    })
    const timer = window.setInterval(() => {
      const runtime = runtimeRef.current
      if (!runtime) return
      const next = runtime.readStatus()
      if (next.phase === 'idle') {
        runtimeRef.current = null
        runtime.dispose()
        setNotice('Audio paused. Your last finished loop is kept; any unfinished take was discarded. Start again when ready.')
      }
      setStatus(next)
    }, 100)
    return () => {
      off()
      window.clearInterval(timer)
      // Invalidate in-flight async starts on unmount: the increment (not the
      // read value) is the point, so the changing ref value is intentional.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      startSequence.current++
      startingRef.current = false
      const runtime = runtimeRef.current
      runtimeRef.current = null
      runtime?.dispose()
    }
  }, [])

  const stop = useCallback(() => {
    startSequence.current++
    startingRef.current = false
    const runtime = runtimeRef.current
    const phase = runtime?.readStatus().phase
    runtimeRef.current = null
    runtime?.dispose()
    setStarting(false)
    setStatus(IDLE)
    setNotice(phase && ['armed', 'count-in', 'recording', 'finishing'].includes(phase)
      ? 'Stopped. The unfinished take was discarded; completed layers are kept.'
      : sketchRef.current.notes.length ? 'Stopped. Your loop is ready to replay.' : 'Ready when you are.')
  }, [])

  const start = useCallback(async (mode: 'play' | 'record') => {
    if (runtimeRef.current || startingRef.current) return
    if (mode === 'play' && !sketchRef.current.notes.length) return
    if (mode === 'record' && sketchRef.current.notes.length >= MAX_JAM_NOTES) return
    commitTempo()
    startingRef.current = true
    setStarting(true)
    setNotice('')
    const request = ++startSequence.current
    try {
      const context = getAudioContext()
      // Start only once the clock is running, including the first user gesture.
      if (context.state === 'suspended') await context.resume()
      if (request !== startSequence.current) return
      if (context.state !== 'running') throw new Error('Audio is not running')
      const current = sketchRef.current
      const runtime = new JamRuntime({
        notes: current.notes,
        bpm: current.bpm,
        latencyMs: settings.latencyMs,
        snap: current.snap,
        mutedPads: current.mutedPads,
        metronome,
        onCommit: (notes) => {
          if (runtimeRef.current !== runtime) return
          const previous = sketchRef.current
          if (!sameNotes(previous.notes, notes)) {
            setUndo((history) => [...history.slice(-19), {
              notes: previous.notes, mutedPads: previous.mutedPads, action: 'take',
            }])
            updateSketch((value) => ({ ...value, notes }))
            setNotice('Take added. Your loop is playing — add another layer whenever you like.')
          }
          setStatus(runtime.readStatus())
        },
        onAutoPlay: (pad) => autoFlashBus.emit(pad),
      })
      runtimeRef.current = runtime
      runtime.start(mode)
      setStatus(runtime.readStatus())
    } catch {
      if (request !== startSequence.current) return
      runtimeRef.current?.dispose()
      runtimeRef.current = null
      setStatus(IDLE)
      setNotice('Audio could not start. Tap Record or Play again to try.')
    } finally {
      if (request === startSequence.current) {
        startingRef.current = false
        setStarting(false)
      }
    }
  }, [commitTempo, metronome, settings.latencyMs, updateSketch])

  const record = () => {
    if (sketchRef.current.notes.length >= MAX_JAM_NOTES) return
    const runtime = runtimeRef.current
    if (runtime) {
      if (runtime.readStatus().phase !== 'playing') return
      runtime.record()
      setStatus(runtime.readStatus())
      setNotice('')
    } else {
      void start('record')
    }
  }

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLElement && (target.isContentEditable
        || target.closest('button, input, select, textarea, [contenteditable="true"], a, [role="button"]'))) return
      event.preventDefault()
      if (runtimeRef.current || startingRef.current) stop()
      else void start(sketchRef.current.notes.length ? 'play' : 'record')
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [start, stop])

  const toggleMute = (pad: number) => {
    const current = sketchRef.current
    const mutedPads = current.mutedPads.includes(pad)
      ? current.mutedPads.filter((muted) => muted !== pad) : [...current.mutedPads, pad]
    runtimeRef.current?.setMuted(mutedPads)
    updateSketch((value) => ({ ...value, mutedPads }))
  }

  const undoTake = () => {
    if (runtimeRef.current || startingRef.current) return
    const previous = undo[undo.length - 1]
    if (!previous) return
    updateSketch((value) => ({ ...value, notes: previous.notes, mutedPads: previous.mutedPads }))
    setUndo((history) => history.slice(0, -1))
    setNotice(previous.action === 'clear' ? 'Your loop is restored.' : 'Last take removed. Try a new idea.')
  }

  const clear = () => {
    if (runtimeRef.current || startingRef.current || !sketchRef.current.notes.length) return
    const current = sketchRef.current
    setUndo((history) => [...history.slice(-19), {
      notes: current.notes, mutedPads: current.mutedPads, action: 'clear',
    }])
    updateSketch((value) => ({ ...value, notes: [], mutedPads: [] }))
    setNotice('A fresh canvas. Undo clear brings your loop back.')
  }

  const tracks = useMemo(() => {
    const byPad = new Map<number, JamNote[]>()
    for (const note of sketch.notes) {
      const notes = byPad.get(note.pad) ?? []
      notes.push(note)
      byPad.set(note.pad, notes)
    }
    return [...byPad.entries()].sort(([a], [b]) => a - b)
  }, [sketch.notes])

  const active = starting || status.phase !== 'idle'
  const recording = status.phase === 'recording' || status.phase === 'finishing'
  const full = sketch.notes.length >= MAX_JAM_NOTES
  const loopBeat = ((Math.max(0, status.beat) % JAM_BEATS) + JAM_BEATS) % JAM_BEATS
  const bar = Math.floor(loopBeat / 4)
  const beat = Math.floor(loopBeat % 4)
  const count = Math.min(4, Math.max(1, Math.floor(status.beat + 4) + 1))
  const phaseLabel = starting ? 'Opening your studio audio'
    : status.phase === 'count-in' ? 'Count in — get ready'
    : status.phase === 'armed' ? 'Next loop: a new layer'
    : status.phase === 'recording' ? 'Recording your layer'
    : status.phase === 'finishing' ? 'Finishing your take'
    : status.phase === 'playing' ? 'Your loop is playing'
    : sketch.notes.length ? 'Your loop is ready' : 'Make a little noise'
  const recordLabel = starting ? 'Starting…'
    : status.phase === 'count-in' ? 'Get ready…'
    : status.phase === 'armed' ? 'Layer queued'
    : recording ? 'Recording…'
    : status.phase === 'playing' ? 'Overdub next loop'
    : sketch.notes.length ? 'Record a layer' : 'Record four bars'
  const recordingHint = status.phase === 'count-in' ? 'Four clicks, then your four bars begin.'
    : status.phase === 'armed' ? 'Keep playing. Recording begins when Bar 1 comes around.'
    : recording ? 'One pass only. Playback follows automatically. Stop discards this unfinished take.'
    : status.phase === 'playing' ? 'Play along, mute a part, or overdub one more layer.'
    : 'Record a four-bar idea, then layer another sound over it. No score. Just your groove.'

  return (
    <main className={`jam-studio${recording ? ' is-recording' : ''}`}>
      <div className="jam-shell">
        <header className="jam-header">
          <div>
            <p className="jam-eyebrow">PADLAB / FREE PLAY</p>
            <h1>Jam studio<span aria-hidden="true">.</span></h1>
            <p className="jam-intro">Four bars. Sixteen sounds. Something only you would make.</p>
          </div>
          <button className="btn jam-exit" onClick={() => { stop(); onExit() }}>← Back to lessons</button>
        </header>

        <section className="jam-session" aria-label="Your jam sketch">
          <label className="jam-name">
            <span>YOUR SKETCH</span>
            <input aria-label="Sketch name" type="text" maxLength={60} value={sketch.name}
              placeholder="My first groove"
              onChange={(event) => updateSketch((value) => ({ ...value, name: event.target.value }))} />
          </label>
          <p className={`jam-save${saved === false ? ' is-unavailable' : ''}`} role="status">
            {saved === null ? 'Preparing your sketch…' : saved ? 'Saved on this device'
              : 'Save unavailable — this sketch is only kept in this session.'}
          </p>
        </section>

        <div className="jam-workspace">
          <section className="jam-console" aria-label="Jam controls and pads">
            <div className="jam-console-top">
              <span className="jam-eyebrow">YOUR INSTRUMENT</span>
              <span className="jam-live-tag"><i aria-hidden="true" /> Ready to play</span>
            </div>
            <PadGrid padCount={16} />
            <p className="jam-pad-help">Tap pads, use the keys shown, or play your mapped MIDI pads.</p>

            <div className="jam-options">
              <label className="jam-tempo">
                <span>Tempo</span>
                <div>
                  <input aria-label="Tempo in BPM" type="number" min={60} max={180} step={1}
                    disabled={active} value={tempo}
                    onChange={(event) => {
                      tempoRef.current = event.target.value
                      setTempo(event.target.value)
                    }} onBlur={commitTempo} onKeyDown={(event) => {
                      if (event.key === 'Enter') { commitTempo(); event.currentTarget.blur() }
                    }} />
                  <span>BPM</span>
                </div>
              </label>
              <button className="jam-option" aria-pressed={sketch.snap} disabled={active}
                title="Snap new hits to the nearest sixteenth note; existing notes stay as played."
                onClick={() => updateSketch((value) => ({ ...value, snap: !value.snap }))}>
                <span>Snap new hits</span><strong>{sketch.snap ? '1/16 · On' : 'Off · Free timing'}</strong>
              </button>
              <button className="jam-option" aria-pressed={metronome} disabled={starting} onClick={() => {
                const next = !metronome
                setMetronome(next)
                runtimeRef.current?.setMetronome(next)
              }}>
                <span>Click</span><strong>{metronome ? 'On' : 'Off'}</strong>
              </button>
            </div>

            <div className="jam-transport">
              <button className="jam-record" disabled={full || (active && status.phase !== 'playing')}
                onClick={record}><i aria-hidden="true" />{recordLabel}</button>
              {active ? <button className="btn jam-play" onClick={stop}>■ Stop</button>
                : <button className="btn jam-play" disabled={!sketch.notes.length}
                  onClick={() => { void start('play') }}>▶ Play loop</button>}
            </div>
            {full && <p className="jam-full" role="status">Loop is full; clear or undo a take to make room.</p>}
            <p className="jam-record-help">Records pad notes, not your microphone. Space starts or stops when you’re outside a control.</p>
          </section>

          <section className="jam-arrangement" aria-label="Your four-bar loop">
            <div className="jam-phase">
              <div>
                <p className="jam-eyebrow">{recording ? 'CAPTURE THE MOMENT' : 'ROOM TO EXPERIMENT'}</p>
                <h2 aria-live="polite">{phaseLabel}</h2>
              </div>
              {status.phase === 'count-in'
                ? <span className="jam-count" aria-label={`Count ${count} of 4`}>{count}</span>
                : <span className={`jam-phase-light${active ? ' is-on' : ''}`} aria-hidden="true" />}
            </div>
            <p className="jam-hint">{recordingHint}</p>

            <div className="jam-bars" aria-label={status.phase === 'count-in'
              ? `Count in: ${count} of 4` : active ? `Bar ${bar + 1}, beat ${beat + 1} of 4` : 'Four bars in 4/4 time'}>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className={`jam-bar${active && status.beat >= 0 && bar === index ? ' is-current' : ''}`}>
                  <span>BAR <strong>{index + 1}</strong></span>
                  <div className="jam-beats" aria-hidden="true">
                    {[0, 1, 2, 3].map((pulse) => <i key={pulse} className={
                      active && status.beat >= 0 && bar === index && beat === pulse ? 'is-lit' : ''
                    } />)}
                  </div>
                </div>
              ))}
            </div>

            <div className="jam-timeline-head">
              <h3>Your layers <span>{tracks.length}</span></h3>
              <span>{recording ? `${status.pendingNotes} new ${status.pendingNotes === 1 ? 'hit' : 'hits'} this take`
                : `${sketch.notes.length} ${sketch.notes.length === 1 ? 'note' : 'notes'} · 4/4`}</span>
            </div>
            {tracks.length ? (
              <div className="jam-tracks">
                <div className="jam-track-ruler" aria-hidden="true">
                  <span />
                  <div>{[1, 2, 3, 4].map((number) => <span key={number}>{number}</span>)}</div>
                </div>
                {tracks.map(([pad, notes]) => {
                  const muted = sketch.mutedPads.includes(pad)
                  return (
                    <div className={`jam-track${muted ? ' is-muted' : ''}`} key={pad}
                      style={{ '--track-color': padColor(pad) } as CSSProperties}>
                      <button className="jam-track-mute" aria-pressed={muted}
                        aria-label={`${muted ? 'Unmute' : 'Mute'} ${soundLabel(pad)} track`}
                        title={muted ? 'Click to unmute this recorded part' : 'Click to mute this recorded part'}
                        onClick={() => toggleMute(pad)}>
                        <span className="jam-track-number">{pad}</span>
                        <span>{soundLabel(pad)}<small>{muted ? 'Muted' : active ? 'Playing' : 'Ready'}</small></span>
                      </button>
                      <div className="jam-note-lane" role="img"
                        aria-label={`${soundLabel(pad)}: ${notes.length} recorded notes${muted ? ', muted' : ''}`}>
                        {notes.map((note, index) => <i className="jam-note" key={index}
                          style={{ left: `${note.t / JAM_BEATS * 100}%`, opacity: 0.45 + note.vel / 127 * 0.55 }} />)}
                        {active && status.beat >= 0 && <span className="jam-playhead" aria-hidden="true"
                          style={{ left: `${loopBeat / JAM_BEATS * 100}%` }} />}
                      </div>
                    </div>
                  )
                })}
                <p className="jam-track-help">Tap a sound name to mute its layer. Your live pads always play.</p>
              </div>
            ) : (
              <div className="jam-empty">
                <div className="jam-empty-pattern" aria-hidden="true">
                  {Array.from({ length: 16 }, (_, index) => <i key={index} className={
                    [0, 4, 8, 12].includes(index) ? 'is-kick' : [2, 6, 10, 14].includes(index) ? 'is-hat' : ''
                  } />)}
                </div>
                <h3>Start with a kick.<br />Add a snare.<br /><span>Make it yours.</span></h3>
                <p>{recording ? 'Your first layer appears when this take finishes.'
                  : 'Try Kick on Z and Snare on X. Hit Record when you find something you like.'}</p>
              </div>
            )}

            <div className="jam-edit-actions">
              <button className="btn small" disabled={active || !undo.length} onClick={undoTake}>
                ↶ {undo[undo.length - 1]?.action === 'clear' ? 'Undo clear' : 'Undo last take'}
              </button>
              <button className="btn small" disabled={active || !sketch.notes.length} onClick={clear}>Clear loop</button>
              {active && <span>Stop to edit completed layers.</span>}
            </div>
            <p className="jam-notice" role="status">{notice || '\u00a0'}</p>
          </section>
        </div>
      </div>
    </main>
  )
}
