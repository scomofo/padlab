// Shared difficulty model, used by both the analyzer and the validator.
//
// Raw hits/sec overstates how hard a chart is when one pad carries a steady
// stream — a 16th-note shaker is one relaxed hand in a fixed motion, nothing
// like the same rate scattered across four pads. So we detect those "ostinato"
// voices and discount instants that contain nothing else.
//
// The 0.5-beat gap ceiling is a cliff on purpose: crossing it can make a
// denser chart rate easier. That is accepted product behaviour, pinned by
// tests/scripts/difficulty.test.mjs.

/** Weight of an instant made up purely of ostinato notes. */
const OSTINATO_WEIGHT = 0.4
/** An ostinato must be at least this fast (in beats) to count as a stream. */
const MAX_OSTINATO_GAP = 0.5
/** ...and this regular, and cover this much of the chart. */
const MIN_REGULARITY = 0.8
const MIN_COVERAGE = 0.6

function modeOf(values) {
  const counts = new Map()
  let best = null
  let bestN = 0
  for (const v of values) {
    const k = v.toFixed(4)
    const n = (counts.get(k) ?? 0) + 1
    counts.set(k, n)
    if (n > bestN) {
      bestN = n
      best = Number(k)
    }
  }
  return best
}

/** Pads playing a steady, chart-spanning stream (hats, shakers, rides). */
export function findOstinatoPads(events, totalBeats) {
  const byPad = new Map()
  for (const e of events) {
    if (!byPad.has(e.pad)) byPad.set(e.pad, [])
    byPad.get(e.pad).push(e.t)
  }
  const ostinato = new Set()
  for (const [pad, timesRaw] of byPad) {
    const times = [...timesRaw].sort((a, b) => a - b)
    if (times.length < 8) continue
    const gaps = []
    for (let i = 1; i < times.length; i++) gaps.push(+(times[i] - times[i - 1]).toFixed(4))
    const modal = modeOf(gaps)
    if (modal === null || modal > MAX_OSTINATO_GAP) continue
    const regular = gaps.filter((g) => Math.abs(g - modal) < 1e-6).length / gaps.length
    if (regular < MIN_REGULARITY) continue
    if (times[times.length - 1] - times[0] < totalBeats * MIN_COVERAGE) continue
    ostinato.add(pad)
  }
  return ostinato
}

export function analyzeLesson(lesson) {
  const totalBeats = lesson.bars * 4
  const seconds = totalBeats * (60 / lesson.bpm)
  const ostinato = findOstinatoPads(lesson.events, totalBeats)

  // Group notes into instants — a chord is one physical action.
  const instants = new Map()
  for (const e of lesson.events) {
    const k = e.t.toFixed(4)
    if (!instants.has(k)) instants.set(k, [])
    instants.get(k).push(e.pad)
  }

  let weighted = 0
  let doubles = 0
  let maxSim = 0
  for (const pads of instants.values()) {
    if (pads.length >= 2) doubles++
    maxSim = Math.max(maxSim, pads.length)
    const allOstinato = pads.every((p) => ostinato.has(p))
    weighted += allOstinato ? OSTINATO_WEIGHT : 1
  }

  const times = [...instants.keys()].map(Number).sort((a, b) => a - b)
  let minGap = Infinity
  for (let i = 1; i < times.length; i++) minGap = Math.min(minGap, times[i] - times[i - 1])

  return {
    hitsPerSec: +(instants.size / seconds).toFixed(2),
    effectiveHitsPerSec: +(weighted / seconds).toFixed(2),
    notesPerSec: +(lesson.events.length / seconds).toFixed(2),
    doublePct: instants.size ? Math.round((doubles / instants.size) * 100) : 0,
    maxSim,
    minGapMs: Number.isFinite(minGap) ? Math.round(minGap * (60 / lesson.bpm) * 1000) : 0,
    ostinatoPads: [...ostinato].sort((a, b) => a - b),
    events: lesson.events.length,
  }
}
