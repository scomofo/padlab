// Validates every lesson chart in src/lessons/data against the engine's expectations.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeLesson } from './lib/difficulty.mjs'

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lessons')
const DATA_DIR = join(SRC_DIR, 'data')
// Same source of truth the app imports.
const COURSE_IDS = new Set(
  JSON.parse(readFileSync(join(SRC_DIR, 'courses.json'), 'utf8')).map((c) => c.id),
)
/** Soft ceiling on note count per level, to catch charts denser than their rating. */
const MAX_EVENTS_BY_LEVEL = { 1: 110, 2: 135, 3: 165, 4: 195, 5: 225, 6: 265 }
/**
 * Difficulty ceilings measured at full tempo, on *effective* hits per second:
 * physical actions (a chord is one action), discounting instants that are
 * nothing but a steady ostinato voice — see lib/difficulty.mjs for why.
 * `doublePct` is the share of actions needing two pads at once.
 */
const DIFFICULTY = {
  1: { hitsPerSec: 2.4, doublePct: 25 },
  2: { hitsPerSec: 3.6, doublePct: 60 },
  3: { hitsPerSec: 6.0, doublePct: 100 },
  4: { hitsPerSec: 6.5, doublePct: 100 },
  5: { hitsPerSec: 8.0, doublePct: 100 },
  6: { hitsPerSec: 11.0, doublePct: 100 },
}
const SOUNDS = new Set([
  'kick', 'snare', 'clap', 'rimshot', 'hatClosed', 'hatOpen', 'shaker', 'crash',
  'ride', 'tomLow', 'tomMid', 'tomHigh', 'cowbell', 'perc', 'stab', 'bass',
])

let errors = 0
let warnings = 0
const ids = new Set()

for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
  const err = (msg) => { console.error(`ERROR ${file}: ${msg}`); errors++ }
  const warn = (msg) => { console.warn(`warn  ${file}: ${msg}`) ; warnings++ }
  let l
  try {
    l = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  } catch (e) {
    err(`invalid JSON: ${e.message}`)
    continue
  }

  if (!/^[a-z0-9-]+$/.test(l.id ?? '')) err(`bad id "${l.id}"`)
  if (ids.has(l.id)) err(`duplicate id "${l.id}"`)
  ids.add(l.id)
  if (!COURSE_IDS.has(l.course)) err(`unknown course "${l.course}"`)
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
  const byTime = new Map()
  for (const e of l.events ?? []) {
    if (!chartedPads.has(e.pad)) err(`event at t=${e.t} uses unmapped pad ${e.pad}`)
    if (!(e.t >= 0 && e.t < totalBeats)) err(`event t=${e.t} outside [0, ${totalBeats})`)
    if (Math.abs(e.t / 0.125 - Math.round(e.t / 0.125)) > 1e-9) warn(`event t=${e.t} not on a 32nd grid`)
    if (e.vel !== undefined && !(e.vel >= 1 && e.vel <= 127)) err(`event t=${e.t} vel ${e.vel} out of range`)
    if (!byPad.has(e.pad)) byPad.set(e.pad, [])
    byPad.get(e.pad).push(e.t)
    const key = e.t.toFixed(4)
    byTime.set(key, (byTime.get(key) ?? 0) + 1)
    const dupKey = `${key}|${e.pad}`
    if (byTime.has(dupKey)) err(`duplicate event pad ${e.pad} at t=${e.t}`)
    byTime.set(dupKey, 1)
  }
  // More than three pads at once isn't playable with two hands on a pad grid.
  for (const [t, count] of byTime) {
    if (t.includes('|')) continue
    if (count > 3) err(`${count} simultaneous notes at t=${t} — unplayable`)
    else if (count === 3 && l.level <= 2) warn(`3 simultaneous notes at t=${t} — busy for level ${l.level}`)
  }
  for (const [pad, times] of byPad) {
    times.sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] < 0.125 - 1e-9) {
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
  console.log(
    `ok    ${l.course.padEnd(18)} L${l.level} ${String(l.padCount).padStart(2)}p ${String(l.bpm).padStart(3)}bpm ${String(count).padStart(3)}ev  "${l.title}"`,
  )
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`)
process.exit(errors > 0 ? 1 : 0)
