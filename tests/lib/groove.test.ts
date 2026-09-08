import { describe, expect, it } from 'vitest'
import { ScoreKeeper, type JudgedEvent } from '../../src/engine/scoring'
import { createGroovePlan, readGroove } from '../../src/lib/groove'
import { note } from '../helpers/chart'

describe('groove goals', () => {
  it('counts simultaneous notes separately and excludes silent phrases from goals', () => {
    const events = [note(0, 1), note(0, 2), note(7.5, 1), note(24, 3), note(25, 1)]
    const plan = createGroovePlan(events, 8)
    expect(plan).toEqual({
      phrases: [
        { index: 0, startBeat: 0, endBeat: 8, total: 3 },
        { index: 3, startBeat: 24, endBeat: 32, total: 2 },
      ],
      total: 5,
      goals: [
        { id: 'land', label: 'Find the beat', target: 4 },
        { id: 'tight', label: 'In the pocket', target: 3 },
        { id: 'phrases', label: 'Phrase collector', target: 1 },
      ],
    })
    expect(readGroove(plan, events, 12).phrases.map((phrase) => phrase.state)).toEqual(['active', 'waiting'])
  })

  it('creates no goals or free awards for an empty player part', () => {
    const plan = createGroovePlan([], 8)
    expect(plan).toEqual({ phrases: [], total: 0, goals: [] })
    expect(readGroove(plan, [], 32)).toEqual({
      goals: [], phrases: [], earned: 0, totalGoals: 0, landedPhrases: 0,
    })
  })

  it('uses only chart notes within the lesson duration, with an exclusive phrase boundary', () => {
    const plan = createGroovePlan([note(-1, 1), note(7.99, 1), note(8, 1), note(12, 1)], 3)
    expect(plan.total).toBe(2)
    expect(plan.phrases).toEqual([
      { index: 0, startBeat: 0, endBeat: 8, total: 1 },
      { index: 1, startBeat: 8, endBeat: 12, total: 1 },
    ])
  })

  it('waits for the full phrase duration even after its last note is hit', () => {
    const events: JudgedEvent[] = [
      { ...note(0, 1), judgement: 'perfect' },
      { ...note(1, 2), judgement: 'great' },
    ]
    const plan = createGroovePlan(events, 2)
    expect(readGroove(plan, events, -1).phrases[0].state).toBe('waiting')
    const beforeEnd = readGroove(plan, events, 7.99)
    expect(beforeEnd.phrases[0]).toMatchObject({ hits: 2, tight: 2, state: 'active' })
    expect(beforeEnd.earned).toBe(2)
    expect(beforeEnd.landedPhrases).toBe(0)
    expect(readGroove(plan, events, 8).phrases[0].state).toBe('locked')
    expect(readGroove(plan, events, 8).earned).toBe(3)
  })

  it('waits for delayed miss judgement beyond the phrase boundary', () => {
    const events = [note(0, 1), note(7.95, 2)]
    const score = new ScoreKeeper(events, 0.5)
    const plan = createGroovePlan(events, 2)
    score.registerHit(1, 0)
    score.sweepMisses(8)
    const pending = readGroove(plan, score.events, 8)
    expect(pending.phrases[0]).toMatchObject({ hits: 1, tight: 1, state: 'active' })
    expect(pending.landedPhrases).toBe(0)
    score.sweepMisses(8.3)
    expect(readGroove(plan, score.events, 8.3).phrases[0].state).toBe('retry')
  })

  it('can settle a late successful hit after the phrase end', () => {
    const events = [note(7.95, 1)]
    const score = new ScoreKeeper(events, 0.5)
    const plan = createGroovePlan(events, 2)
    expect(readGroove(plan, score.events, 8).phrases[0].state).toBe('active')
    score.registerHit(1, 8.05)
    expect(readGroove(plan, score.events, 8.05).phrases[0].state).toBe('locked')
  })

  it('requires every note of a chord and never treats missing records as hits', () => {
    const events = [note(0, 1), note(0, 2)]
    const plan = createGroovePlan(events, 2)
    const partial: JudgedEvent[] = [{ ...events[0], judgement: 'perfect' }]
    const snapshot = readGroove(plan, partial, 9)
    expect(snapshot.phrases[0]).toMatchObject({ total: 2, hits: 1, tight: 1, state: 'active' })
    expect(snapshot.earned).toBe(0)
    expect(readGroove(plan, [...partial, { ...events[1], judgement: 'good' }], 9).phrases[0].state).toBe('landed')
  })

  it('does not award an unfinished final phrase, even when earlier phrases are complete', () => {
    const events: JudgedEvent[] = [
      { ...note(0, 1), judgement: 'perfect' },
      { ...note(8, 1), judgement: 'great' },
      note(15, 2),
    ]
    const snapshot = readGroove(createGroovePlan(events, 4), events, 16.5)
    expect(snapshot.phrases.map((phrase) => phrase.state)).toEqual(['locked', 'active'])
    expect(snapshot.landedPhrases).toBe(1)
    expect(snapshot.goals.find((goal) => goal.id === 'land')).toMatchObject({ value: 2, earned: false })
  })

  it('ends the final phrase at the actual chart end for an odd number of bars', () => {
    const events: JudgedEvent[] = [{ ...note(8, 1), judgement: 'good' }]
    const plan = createGroovePlan(events, 3)
    expect(readGroove(plan, events, 11.99).landedPhrases).toBe(0)
    const complete = readGroove(plan, events, 12)
    expect(complete.phrases[0]).toMatchObject({ startBeat: 8, endBeat: 12, state: 'landed' })
    expect(complete.goals.map((goal) => goal.earned)).toEqual([true, false, true])
  })

  it('earns nothing on an all-miss run', () => {
    const events: JudgedEvent[] = [0, 4, 8, 12].map((t) => ({ ...note(t, 1), judgement: 'miss' }))
    const snapshot = readGroove(createGroovePlan(events, 4), events, 16)
    expect(snapshot.earned).toBe(0)
    expect(snapshot.goals.map((goal) => goal.value)).toEqual([0, 0, 0])
    expect(snapshot.phrases.map((phrase) => phrase.state)).toEqual(['retry', 'retry'])
  })

  it('allows recovery after a miss and preserves earned progress through later misses', () => {
    const events: JudgedEvent[] = [0, 8, 16, 17, 18, 24, 25, 31].map((t) => note(t, 1))
    const plan = createGroovePlan(events, 8)
    events[0].judgement = 'miss'
    const first = readGroove(plan, events, 8)
    expect(first.earned).toBe(0)
    for (let i = 1; i <= 6; i++) events[i].judgement = 'perfect'
    const recovered = readGroove(plan, events, 26)
    expect(recovered.earned).toBe(3)
    expect(recovered.landedPhrases).toBe(2)
    events[7].judgement = 'miss'
    const finished = readGroove(plan, events, 32)
    expect(finished.goals).toEqual(recovered.goals)
    expect(finished.phrases.map((phrase) => phrase.state)).toEqual(['retry', 'locked', 'locked', 'retry'])
  })

  it('reads scoring events without changing score or penalizing awards for extra hits', () => {
    const events = [note(0, 1), note(4, 2)]
    const plan = createGroovePlan(events, 2)
    const score = new ScoreKeeper(events, 0.5)
    score.registerHit(1, 0)
    score.registerHit(2, 4)
    const clean = readGroove(plan, score.events, 8)
    score.registerHit(1, 5)
    score.registerHit(1, 6)
    const scoreBeforeRead = score.summary()
    const planBeforeRead = structuredClone(plan)
    const eventsBeforeRead = structuredClone(score.events)
    expect(readGroove(plan, score.events, 8)).toEqual(clean)
    expect(score.summary()).toEqual(scoreBeforeRead)
    expect(score.summary().accuracy).toBeLessThan(100)
    expect(score.events).toEqual(eventsBeforeRead)
    expect(plan).toEqual(planBeforeRead)
  })
})
