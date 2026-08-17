// Validates hardware walkthrough guides in src/guides/data.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const DATA_DIR = join(ROOT, 'guides', 'data')
const COURSE_IDS = new Set(
  JSON.parse(readFileSync(join(ROOT, 'lessons', 'courses.json'), 'utf8')).map((c) => c.id),
)

if (!existsSync(DATA_DIR)) {
  console.log('no guides directory — nothing to check')
  process.exit(0)
}

let errors = 0
let warnings = 0
const ids = new Set()

for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
  const err = (msg) => { console.error(`ERROR ${file}: ${msg}`); errors++ }
  const warn = (msg) => { console.warn(`warn  ${file}: ${msg}`); warnings++ }
  let g
  try {
    g = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  } catch (e) {
    err(`invalid JSON: ${e.message}`)
    continue
  }

  if (!/^[a-z0-9-]+$/.test(g.id ?? '')) err(`bad id "${g.id}"`)
  if (ids.has(g.id)) err(`duplicate id "${g.id}"`)
  ids.add(g.id)
  if (!COURSE_IDS.has(g.course)) err(`unknown course "${g.course}"`)
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

  console.log(
    `ok    ${g.course.padEnd(16)} L${g.level} ${String(g.minutes).padStart(2)}min ${steps.length} steps  "${g.title}"`,
  )
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`)
process.exit(errors > 0 ? 1 : 0)
