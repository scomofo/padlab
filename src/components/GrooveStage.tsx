import { useEffect, useId, useRef, useState } from 'react'
import type { GrooveSnapshot } from '../lib/groove'
import './groove.css'

type Goal = GrooveSnapshot['goals'][number]
type Phrase = GrooveSnapshot['phrases'][number]
type Target = { accuracy: number; previousBest: number }

interface GrooveProps {
  snapshot: GrooveSnapshot
  target: Target | null
  /** Points earned against the full chart, rather than accuracy so far. */
  score: number
}

function goalCriteria(goal: Goal): string {
  if (goal.id === 'land') return `Land ${goal.target} ${goal.target === 1 ? 'note' : 'notes'}`
  if (goal.id === 'tight') return `${goal.target} Perfect / Great ${goal.target === 1 ? 'hit' : 'hits'}`
  return `Finish ${goal.target} ${goal.target === 1 ? 'phrase' : 'phrases'} without missing a note`
}

function barLabel(phrase: Phrase): string {
  const first = Math.floor(phrase.startBeat / 4) + 1
  const last = Math.max(first, Math.ceil(phrase.endBeat / 4))
  return first === last ? `Bar ${first}` : `Bars ${first}–${last}`
}

const PHRASE_STATUS: Record<Phrase['state'], { symbol: string; label: string }> = {
  waiting: { symbol: '·', label: 'Coming up' },
  active: { symbol: '›', label: 'Playing' },
  landed: { symbol: '✓', label: 'Every note landed' },
  locked: { symbol: '◆', label: 'Every note Perfect or Great' },
  retry: { symbol: '↻', label: 'A phrase to try again' },
}

function GoalTrack({ goal, recap = false }: { goal: Goal; recap?: boolean }) {
  const previous = useRef(goal.earned)
  const [celebrating, setCelebrating] = useState(false)
  useEffect(() => {
    const justEarned = goal.earned && !previous.current && !recap
    previous.current = goal.earned
    setCelebrating(justEarned)
    if (!justEarned) return
    const timeout = window.setTimeout(() => setCelebrating(false), 550)
    return () => window.clearTimeout(timeout)
  }, [goal.earned, recap])

  const criteria = goalCriteria(goal)
  const value = Math.max(0, Math.min(goal.target, goal.value))
  const percent = goal.target > 0 ? (value / goal.target) * 100 : 0
  return <li className={`groove-goal groove-goal--${goal.id}${goal.earned ? ' is-earned' : ''}${celebrating ? ' is-celebrating' : ''}`}>
    <div className="groove-goal-title">
      <span className="groove-goal-symbol" aria-hidden="true">{goal.earned ? '✓' : '○'}</span>
      <span>{criteria}</span>
    </div>
    <div className="groove-goal-detail">
      <div className="groove-track" role="progressbar" aria-label={criteria}
        aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={value}
        aria-valuetext={`${value} of ${goal.target}${goal.earned ? ', goal earned' : ''}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="groove-goal-count">{goal.earned && <span className="groove-earned-label">Earned · </span>}{value}/{goal.target}</span>
    </div>
  </li>
}

function PhraseRibbon({ phrases, recap = false }: { phrases: Phrase[]; recap?: boolean }) {
  const ribbon = useRef<HTMLOListElement>(null)
  const activeIndex = phrases.find((phrase) => phrase.state === 'active')?.index
  useEffect(() => {
    const container = ribbon.current
    if (!container || activeIndex === undefined) return
    const active = container.querySelector<HTMLElement>('[aria-current="step"]')
    if (!active) return
    const bounds = container.getBoundingClientRect()
    const checkpoint = active.getBoundingClientRect()
    // Move only this ribbon; scrolling the page would disturb the note highway.
    if (checkpoint.right > bounds.right) container.scrollLeft += checkpoint.right - bounds.right
    else if (checkpoint.left < bounds.left) container.scrollLeft -= bounds.left - checkpoint.left
  }, [activeIndex])

  if (phrases.length === 0) return null
  return <ol className="groove-phrases" aria-label="Phrase checkpoints" ref={ribbon} tabIndex={recap ? undefined : 0}>
    {phrases.map((phrase) => {
      const status = PHRASE_STATUS[phrase.state]
      const description = `${barLabel(phrase)}: ${recap && phrase.state === 'waiting' ? 'Not played' : status.label}`
      return <li key={phrase.index} className={`groove-phrase groove-phrase--${phrase.state}`}
        title={description} aria-label={description} aria-current={phrase.state === 'active' ? 'step' : undefined}>
        <span aria-hidden="true">{status.symbol}</span> <span aria-hidden="true">{barLabel(phrase)}</span>
      </li>
    })}
  </ol>
}

function encouragement(snapshot: GrooveSnapshot, playing: boolean): string {
  if (!playing) return 'Three small goals. Start when you’re ready.'
  const latest = snapshot.phrases.filter((phrase) =>
    phrase.state === 'landed' || phrase.state === 'locked' || phrase.state === 'retry',
  ).at(-1)
  if (!latest) return 'One note at a time. Find your groove.'
  if (latest.state === 'retry') return 'Keep going. The next note is a fresh start.'
  return latest.state === 'locked'
    ? `${barLabel(latest)} locked in. Keep that feel.`
    : `${barLabel(latest)} landed. Stay with the groove.`
}

function BestTarget({ target, score, recap = false }: { target: Target; score: number; recap?: boolean }) {
  const label = `${target.previousBest >= 100 ? 'Match' : 'Beat'} your best: ${target.accuracy}%`
  const value = Math.max(0, Math.min(100, score))
  const reached = recap && value >= target.accuracy
  return <div className={`groove-best${reached ? ' is-reached' : ''}`}>
    <span>{recap ? reached ? `✓ ${target.previousBest >= 100 ? 'Best matched' : 'Target reached'} · ${target.accuracy}%` : `Next time: aim for ${target.accuracy}%` : label}</span>
    <div className="groove-track groove-best-track" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      aria-valuetext={`${value}% earned across the full chart. Target ${target.accuracy}%.`}>
      <span style={{ width: `${value}%` }} />
      <i className="groove-best-marker" aria-hidden="true" style={{ left: `${Math.min(99, target.accuracy)}%` }} />
    </div>
  </div>
}

export function GrooveStage({ snapshot, target, score, playing }: GrooveProps & { playing: boolean }) {
  const headingId = useId()
  const previousEarned = useRef(snapshot.earned)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (snapshot.earned > previousEarned.current) {
      setAnnouncement(`${snapshot.earned} of ${snapshot.totalGoals} groove goals earned.`)
    } else if (snapshot.earned < previousEarned.current) {
      setAnnouncement('')
    }
    previousEarned.current = snapshot.earned
  }, [snapshot.earned, snapshot.totalGoals])

  if (snapshot.goals.length === 0) return null
  return <section className="groove-stage" aria-labelledby={headingId} data-earned={snapshot.earned}>
    <div className="groove-heading">
      <h2 id={headingId}>Groove goals <span>{snapshot.earned}/{snapshot.totalGoals}</span></h2>
      {target && <BestTarget target={target} score={score} />}
    </div>
    <ul className="groove-goals">
      {snapshot.goals.map((goal) => <GoalTrack key={goal.id} goal={goal} />)}
    </ul>
    <div className="groove-footer">
      <PhraseRibbon phrases={snapshot.phrases} />
      <p className="groove-encouragement">{encouragement(snapshot, playing)}</p>
    </div>
    <span className="groove-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </section>
}

export function GrooveRecap({ snapshot, target, score }: GrooveProps) {
  const headingId = useId()
  if (snapshot.goals.length === 0) return null
  return <section className="groove-stage groove-recap" aria-labelledby={headingId}>
    <div className="groove-heading">
      <h3 id={headingId}>{snapshot.earned}/{snapshot.totalGoals} groove goals earned</h3>
    </div>
    <ul className="groove-goals">
      {snapshot.goals.map((goal) => <GoalTrack key={goal.id} goal={goal} recap />)}
    </ul>
    <PhraseRibbon phrases={snapshot.phrases} recap />
    <p className="groove-encouragement">{snapshot.landedPhrases > 0
      ? `${snapshot.landedPhrases} ${snapshot.landedPhrases === 1 ? 'phrase' : 'phrases'} with every note landed. Bring that feel into the next run.`
      : 'Every attempt builds the feel. Try for one clean phrase next time.'}</p>
    {target && <BestTarget target={target} score={score} recap />}
  </section>
}
