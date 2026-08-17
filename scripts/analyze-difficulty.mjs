// Reports objective difficulty metrics per lesson, measured at the Perform step
// (full tempo, whole kit) — the hardest thing a lesson actually asks for.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './lib/chart.mjs'
import { analyzeLesson } from './lib/difficulty.mjs'

const rows = []

for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
  const l = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  rows.push({ id: l.id, level: l.level, ...analyzeLesson(l) })
}

rows.sort((a, b) => a.level - b.level || b.effectiveHitsPerSec - a.effectiveHitsPerSec)

console.log('lvl   eff  raw  2+hits  maxSim  minGap  ostinato  id')
let lastLevel = 0
for (const r of rows) {
  if (r.level !== lastLevel) {
    console.log('---')
    lastLevel = r.level
  }
  console.log(
    `L${r.level}  ${String(r.effectiveHitsPerSec).padStart(5)} ${String(r.hitsPerSec).padStart(5)}` +
      `   ${String(r.doublePct + '%').padStart(5)}   ${String(r.maxSim).padStart(5)}` +
      `   ${String(r.minGapMs + 'ms').padStart(6)}   ${(r.ostinatoPads.join(',') || '-').padStart(7)}  ${r.id}`,
  )
}
