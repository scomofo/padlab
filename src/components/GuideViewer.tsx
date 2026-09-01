import { useCallback, useEffect, useRef, useState } from 'react'
import type { Guide } from '../guides/types'
import { PadDiagram } from './PadDiagram'
import { Metronome } from '../audio/metronome'
import { unlockAudio } from '../audio/audio'
import { saveGuideProgress } from '../store/progress'

interface GuideViewerProps {
  guide: Guide
  /** Step to resume from. */
  startStep?: number
  onExit: () => void
  onProgressChange: () => void
}

export function GuideViewer({ guide, startStep = 0, onExit, onProgressChange }: GuideViewerProps) {
  const [index, setIndex] = useState(Math.min(startStep, guide.steps.length - 1))
  const [clicking, setClicking] = useState(false)
  const metronome = useRef<Metronome | null>(null)

  const step = guide.steps[index]
  const isLast = index === guide.steps.length - 1

  useEffect(() => {
    metronome.current = new Metronome()
    return () => metronome.current?.stop()
  }, [])

  // Record how far the reader has got, and mark done on the final step.
  useEffect(() => {
    saveGuideProgress(guide.id, index, index === guide.steps.length - 1)
    onProgressChange()
    // onProgressChange is deliberately not a dependency: the parent passes an
    // inline closure whose identity changes every render, and depending on it
    // would re-save (and re-notify) on every render instead of per step.
  }, [guide.id, index])

  const toggleClick = useCallback(() => {
    unlockAudio()
    const m = metronome.current
    if (!m) return
    if (m.running) {
      m.stop()
      setClicking(false)
    } else {
      m.start(guide.bpm ?? 90)
      setClicking(true)
    }
  }, [guide.bpm])

  const go = useCallback(
    (next: number) => setIndex(Math.max(0, Math.min(guide.steps.length - 1, next))),
    [guide.steps.length],
  )

  // Arrow keys page through the guide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
      if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, go])

  return (
    <div className="guide">
      <header className="player-bar">
        <button className="btn ghost" onClick={onExit}>‹ Lessons</button>
        <div className="player-title">
          <h1>{guide.title}</h1>
          <span className="muted">{guide.device} · {guide.minutes} min · {guide.steps.length} steps</span>
        </div>
        {guide.bpm !== undefined && (
          <button className={clicking ? 'btn small on' : 'btn small'} onClick={toggleClick}>
            {clicking ? '■' : '▶'} Click {guide.bpm}
          </button>
        )}
      </header>

      <div className="guide-progress">
        {guide.steps.map((s, i) => (
          <button
            key={i}
            className={i === index ? 'gp-dot on' : i < index ? 'gp-dot done' : 'gp-dot'}
            onClick={() => go(i)}
            title={s.title}
          />
        ))}
      </div>

      <div className="guide-body">
        <div className="guide-main">
          <span className="guide-step-num muted">Step {index + 1} of {guide.steps.length}</span>
          <h2>{step.title}</h2>

          {step.keys && step.keys.length > 0 && (
            <div className="key-row">
              {step.keys.map((combo, i) => (
                <span className="key-combo" key={i}>
                  {combo.map((k, j) => (
                    <span key={j}>
                      {j > 0 && <span className="key-plus">+</span>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          )}

          <ol className="guide-lines">
            {step.body.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>

          {step.checkpoint && (
            <div className="callout check">
              <strong>You'll know it worked when</strong>
              <span>{step.checkpoint}</span>
            </div>
          )}
          {step.tip && (
            <div className="callout tip">
              <strong>Tip</strong>
              <span>{step.tip}</span>
            </div>
          )}
        </div>

        <aside className="guide-side">
          {step.pads && step.pads.length > 0 ? (
            <>
              <h3 className="side-title">Pads in this step</h3>
              <PadDiagram padCount={guide.padCount} highlight={step.pads} />
            </>
          ) : (
            <>
              <h3 className="side-title">Pad layout</h3>
              <PadDiagram padCount={guide.padCount} highlight={[]} />
              <p className="muted">No specific pads this step — it's all front-panel controls.</p>
            </>
          )}
        </aside>
      </div>

      <footer className="guide-nav">
        <button className="btn" onClick={() => go(index - 1)} disabled={index === 0}>‹ Back</button>
        <span className="muted">{step.title}</span>
        {isLast ? (
          <button className="btn primary" onClick={onExit}>Finish</button>
        ) : (
          <button className="btn primary" onClick={() => go(index + 1)}>Next ›</button>
        )}
      </footer>
    </div>
  )
}
