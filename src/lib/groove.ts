import type { JudgedEvent } from '../engine/scoring'
import type { NoteEvent } from '../engine/types'

type GrooveGoalId = 'land' | 'tight' | 'phrases'

interface GrooveGoal {
  id: GrooveGoalId
  label: string
  target: number
}

interface GroovePhrase {
  /** Zero-based two-bar position in the chart, including empty positions. */
  index: number
  startBeat: number
  endBeat: number
  total: number
}

export interface GroovePlan {
  phrases: GroovePhrase[]
  total: number
  goals: GrooveGoal[]
}

export interface GrooveSnapshot {
  goals: (GrooveGoal & { value: number; earned: boolean })[]
  phrases: (GroovePhrase & {
    hits: number
    tight: number
    state: 'waiting' | 'active' | 'landed' | 'locked' | 'retry'
  })[]
  earned: number
  totalGoals: number
  landedPhrases: number
}

const PHRASE_BEATS = 8

/** Build goals from the current player's part, omitting silent phrases. */
export function createGroovePlan(events: NoteEvent[], bars: number): GroovePlan {
  const endBeat = Number.isFinite(bars) && bars > 0 ? bars * 4 : 0
  const totals = new Map<number, number>()
  let total = 0
  for (const event of events) {
    if (!Number.isFinite(event.t) || event.t < 0 || event.t >= endBeat) continue
    const index = Math.floor(event.t / PHRASE_BEATS)
    totals.set(index, (totals.get(index) ?? 0) + 1)
    total++
  }

  const phrases: GroovePhrase[] = []
  for (let index = 0; index * PHRASE_BEATS < endBeat; index++) {
    const count = totals.get(index)
    if (!count) continue
    phrases.push({
      index,
      startBeat: index * PHRASE_BEATS,
      endBeat: Math.min((index + 1) * PHRASE_BEATS, endBeat),
      total: count,
    })
  }

  return {
    phrases,
    total,
    goals: total === 0 ? [] : [
      { id: 'land', label: 'Find the beat', target: Math.ceil(total * 0.75) },
      { id: 'tight', label: 'In the pocket', target: Math.ceil(total * 0.6) },
      { id: 'phrases', label: 'Phrase collector', target: Math.max(1, Math.ceil(phrases.length * 0.5)) },
    ],
  }
}

/**
 * Read stable ScoreKeeper events for the same player part used to build the plan.
 * Awards describe charted notes, so stray hits and combo resets do not affect them.
 * A phrase needs its full duration and every judgement before it can settle.
 */
export function readGroove(plan: GroovePlan, judgedEvents: readonly JudgedEvent[], beat: number): GrooveSnapshot {
  const counts = new Map(plan.phrases.map((phrase) => [phrase.index, {
    phrase,
    judged: 0,
    hits: 0,
    tight: 0,
  }]))
  let hits = 0
  let tight = 0
  for (const event of judgedEvents) {
    if (!event.judgement || !Number.isFinite(event.t)) continue
    const count = counts.get(Math.floor(event.t / PHRASE_BEATS))
    if (!count || event.t < count.phrase.startBeat || event.t >= count.phrase.endBeat) continue
    count.judged++
    if (event.judgement !== 'miss') {
      count.hits++
      hits++
    }
    if (event.judgement === 'perfect' || event.judgement === 'great') {
      count.tight++
      tight++
    }
  }

  let landedPhrases = 0
  const phrases: GrooveSnapshot['phrases'] = []
  for (const { phrase, judged, hits: phraseHits, tight: phraseTight } of counts.values()) {
    let state: GrooveSnapshot['phrases'][number]['state'] = beat < phrase.startBeat ? 'waiting' : 'active'
    if (beat >= phrase.endBeat && judged === phrase.total) {
      state = phraseTight === phrase.total ? 'locked' : phraseHits === phrase.total ? 'landed' : 'retry'
      if (state === 'locked' || state === 'landed') landedPhrases++
    }
    phrases.push({ ...phrase, hits: phraseHits, tight: phraseTight, state })
  }

  const values: Record<GrooveGoalId, number> = { land: hits, tight, phrases: landedPhrases }
  const goals = plan.goals.map((goal) => ({
    ...goal,
    value: values[goal.id],
    earned: values[goal.id] >= goal.target,
  }))
  return {
    goals,
    phrases,
    earned: goals.filter((goal) => goal.earned).length,
    totalGoals: goals.length,
    landedPhrases,
  }
}
