// Validation rules for lesson charts and hardware guides.
//
// Kept separate from the CLI wrappers (validate-lessons.mjs, validate-guides.mjs)
// so the rules can be exercised directly against in-memory fixtures. The CLIs
// are responsible for reading files, printing, and the exit code; everything
// that decides whether a chart is legal lives here.
import { analyzeLesson } from './difficulty.mjs'

/** Soft ceiling on note count per level, to catch charts denser than their rating. */
export const MAX_EVENTS_BY_LEVEL = { 1: 110, 2: 135, 3: 165, 4: 195, 5: 225, 6: 265 }

/**
 * Difficulty ceilings measured at full tempo, on *effective* hits per second:
 * physical actions (a chord is one action), discounting instants that are
 * nothing but a steady ostinato voice — see lib/difficulty.mjs for why.
 * `doublePct` is the share of actions needing two pads at once.
 */
export const DIFFICULTY = {
  1: { hitsPerSec: 2.4, doublePct: 25 },
  2: { hitsPerSec: 3.6, doublePct: 60 },
  3: { hitsPerSec: 6.0, doublePct: 100 },
  4: { hitsPerSec: 6.5, doublePct: 100 },
  5: { hitsPerSec: 8.0, doublePct: 100 },
  6: { hitsPerSec: 11.0, doublePct: 100 },
}

export const SOUNDS = new Set([
  'kick', 'snare', 'clap', 'rimshot', 'hatClosed', 'hatOpen', 'shaker', 'crash',
  'ride', 'tomLow', 'tomMid', 'tomHigh', 'cowbell', 'perc', 'stab', 'bass',
])

/** Minimum spacing between two notes on the same pad, in beats (a 32nd). */
const MIN_PAD_SPACING = 0.125

function collector() {
  const errors = []
  const warnings = []
  return {
    errors,
    warnings,
    err: (msg) => errors.push(msg),
    warn: (msg) => warnings.push(msg),
  }
}

/**
 * @param lesson parsed lesson JSON
 * @param courseIds Set of legal course ids
 * @param seenIds Set carried across a whole run, to catch duplicate ids
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateLesson(lesson, { courseIds = new Set(), seenIds = new Set() } = {}) {
  const { errors, warnings, err, warn } = collector()
  const l = lesson

  if (!/^[a-z0-9-]+$/.test(l.id ?? '')) err(`bad id "${l.id}"`)
  if (seenIds.has(l.id)) err(`duplicate id "${l.id}"`)
  seenIds.add(l.id)
  if (!courseIds.has(l.course)) err(`unknown course "${l.course}"`)
  if (!l.title) err('missing title')
  if (![8, 16].includes(l.padCount)) err(`padCount must be 8 or 16`)
  if (!(l.bpm >= 60 && l.bpm <= 180)) err(`bpm ${l.bpm} out of range`)
  if (![4, 8, 16].includes(l.bars)) err(`bars ${l.bars} not in 4/8/16`)
  if (!(l.level >= 1 && l.level <= 6)) err(`level ${l.level} out of range`)

  const chartedPads = new Set()
  for (const [k, v] of Object.entries(l.pads ?? {})) {
    const pad = Number(k)
    if (!(pad >= 1 && pad <= l.padCount)) err(`pads key ${k} outside 1..${l.padCount}`)
    if (!SOUNDS.has(v)) err(`pad ${k} has unknown sound "${v}"`)
    chartedPads.add(pad)
  }

  const totalBeats = l.bars * 4
  const byPad = new Map()
  const countAtTime = new Map()
  const seenPadTime = new Set()
  for (const e of l.events ?? []) {
    if (!chartedPads.has(e.pad)) err(`event at t=${e.t} uses unmapped pad ${e.pad}`)
    if (!(e.t >= 0 && e.t < totalBeats)) err(`event t=${e.t} outside [0, ${totalBeats})`)
    if (Math.abs(e.t / 0.125 - Math.round(e.t / 0.125)) > 1e-9) warn(`event t=${e.t} not on a 32nd grid`)
    if (e.vel !== undefined && !(e.vel >= 1 && e.vel <= 127)) err(`event t=${e.t} vel ${e.vel} out of range`)
    if (!byPad.has(e.pad)) byPad.set(e.pad, [])
    byPad.get(e.pad).push(e.t)
    const key = e.t.toFixed(4)
    countAtTime.set(key, (countAtTime.get(key) ?? 0) + 1)
    const dupKey = `${key}|${e.pad}`
    if (seenPadTime.has(dupKey)) err(`duplicate event pad ${e.pad} at t=${e.t}`)
    seenPadTime.add(dupKey)
  }
  // More than three pads at once isn't playable with two hands on a pad grid.
  for (const [t, count] of countAtTime) {
    if (count > 3) err(`${count} simultaneous notes at t=${t} — unplayable`)
    else if (count === 3 && l.level <= 2) warn(`3 simultaneous notes at t=${t} — busy for level ${l.level}`)
  }
  for (const [pad, times] of byPad) {
    times.sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] < MIN_PAD_SPACING - 1e-9) {
        err(`pad ${pad} events only ${(times[i] - times[i - 1]).toFixed(3)} beats apart at t=${times[i - 1]}`)
      }
    }
  }

  const steps = l.steps ?? []
  if (steps.length < 3 || steps.length > 5) err(`${steps.length} steps (want 3-5)`)
  const last = steps[steps.length - 1]
  if (last && last.playerPads !== 'all') err(`final step must have playerPads "all"`)
  steps.forEach((s, i) => {
    if (s.playerPads !== 'all') {
      if (!Array.isArray(s.playerPads) || s.playerPads.length === 0) {
        err(`step ${i + 1} playerPads must be a non-empty array or "all"`)
      } else {
        for (const p of s.playerPads) {
          if (!chartedPads.has(p)) err(`step ${i + 1} references pad ${p} with no events`)
        }
      }
    }
    if (s.tempoScale !== undefined && !(s.tempoScale >= 0.5 && s.tempoScale <= 1)) {
      err(`step ${i + 1} tempoScale ${s.tempoScale} out of range`)
    }
  })

  // Difficulty: effective actions per second, and how many need two hands.
  const d = analyzeLesson(l)
  const limit = DIFFICULTY[l.level]
  if (limit) {
    if (d.effectiveHitsPerSec > limit.hitsPerSec) {
      err(
        `${d.effectiveHitsPerSec} effective hits/sec exceeds the level ${l.level} ceiling of ` +
          `${limit.hitsPerSec} (raw ${d.hitsPerSec})`,
      )
    }
    if (d.doublePct > limit.doublePct) {
      err(`${d.doublePct}% of hits need two pads at once (level ${l.level} allows ${limit.doublePct}%)`)
    }
  }
  // Floor: a chart shouldn't be easier than what's allowed two levels down —
  // otherwise the level curve isn't monotonic and players see a "harder" tier
  // that's actually a step back. Two levels of headroom (not one) keeps this
  // from firing on ordinary adjacent-level overlap, which is expected.
  const floorLimit = DIFFICULTY[l.level - 2]
  if (floorLimit && d.effectiveHitsPerSec < floorLimit.hitsPerSec) {
    warn(
      `${d.effectiveHitsPerSec} effective hits/sec is below the level ${l.level - 2} ceiling of ` +
        `${floorLimit.hitsPerSec} — too easy for level ${l.level}`,
    )
  }

  const count = (l.events ?? []).length
  if (count < 8) err(`only ${count} events`)
  const cap = MAX_EVENTS_BY_LEVEL[l.level]
  if (cap && count > cap) warn(`${count} events is dense for level ${l.level} (soft cap ${cap})`)

  return { errors, warnings, analysis: d }
}

/**
 * @param guide parsed guide JSON
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateGuide(guide, { courseIds = new Set(), seenIds = new Set() } = {}) {
  const { errors, warnings, err, warn } = collector()
  const g = guide

  if (!/^[a-z0-9-]+$/.test(g.id ?? '')) err(`bad id "${g.id}"`)
  if (seenIds.has(g.id)) err(`duplicate id "${g.id}"`)
  seenIds.add(g.id)
  if (!courseIds.has(g.course)) err(`unknown course "${g.course}"`)
  if (!g.title) err('missing title')
  if (!g.device) err('missing device')
  if (!g.blurb) err('missing blurb')
  if (![8, 16].includes(g.padCount)) err('padCount must be 8 or 16')
  if (!(g.level >= 1 && g.level <= 6)) err(`level ${g.level} out of range`)
  if (!(g.minutes >= 1 && g.minutes <= 120)) err(`minutes ${g.minutes} out of range`)
  if (g.bpm !== undefined && !(g.bpm >= 40 && g.bpm <= 220)) err(`bpm ${g.bpm} out of range`)

  const steps = g.steps ?? []
  if (steps.length < 2) err(`only ${steps.length} steps`)
  steps.forEach((s, i) => {
    const at = `step ${i + 1}`
    if (!s.title) err(`${at} missing title`)
    if (!Array.isArray(s.body) || s.body.length === 0) err(`${at} has no body lines`)
    else s.body.forEach((line, j) => {
      if (typeof line !== 'string' || !line.trim()) err(`${at} body line ${j + 1} is empty`)
    })
    if (s.keys !== undefined) {
      if (!Array.isArray(s.keys) || s.keys.length === 0) err(`${at} keys must be a non-empty array`)
      else s.keys.forEach((combo, j) => {
        if (!Array.isArray(combo) || combo.length === 0) err(`${at} key combo ${j + 1} is empty`)
        else combo.forEach((k) => {
          if (typeof k !== 'string' || !k.trim()) err(`${at} key combo ${j + 1} has an empty key`)
        })
      })
    }
    if (s.pads !== undefined) {
      if (!Array.isArray(s.pads)) err(`${at} pads must be an array`)
      else {
        const seen = new Set()
        for (const p of s.pads) {
          if (!(p.pad >= 1 && p.pad <= g.padCount)) err(`${at} pad ${p.pad} outside 1..${g.padCount}`)
          if (!p.label) err(`${at} pad ${p.pad} has no label`)
          else if (p.label.length > 12) warn(`${at} pad ${p.pad} label "${p.label}" may clip in the diagram`)
          if (seen.has(p.pad)) err(`${at} lists pad ${p.pad} twice`)
          seen.add(p.pad)
        }
      }
    }
  })

  const withKeys = steps.filter((s) => s.keys?.length).length
  if (withKeys === 0) warn('no step documents a button press — is this really a hardware guide?')

  return { errors, warnings }
}
