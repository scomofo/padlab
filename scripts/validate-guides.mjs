// Validates hardware walkthrough guides in src/guides/data. The rules live in
// lib/validate.mjs so they can be tested; this file reads the files, prints,
// and sets the exit code.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateGuide } from './lib/validate.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const DATA_DIR = join(ROOT, 'guides', 'data')
const courseIds = new Set(
  JSON.parse(readFileSync(join(ROOT, 'lessons', 'courses.json'), 'utf8')).map((c) => c.id),
)

if (!existsSync(DATA_DIR)) {
  console.log('no guides directory — nothing to check')
  process.exit(0)
}

let errors = 0
let warnings = 0
const seenIds = new Set()

for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
  let g
  try {
    g = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  } catch (e) {
    console.error(`ERROR ${file}: invalid JSON: ${e.message}`)
    errors++
    continue
  }

  const result = validateGuide(g, { courseIds, seenIds })
  for (const msg of result.errors) console.error(`ERROR ${file}: ${msg}`)
  for (const msg of result.warnings) console.warn(`warn  ${file}: ${msg}`)
  errors += result.errors.length
  warnings += result.warnings.length

  console.log(
    `ok    ${String(g.course).padEnd(16)} L${g.level} ${String(g.minutes).padStart(2)}min ${(g.steps ?? []).length} steps  "${g.title}"`,
  )
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`)
process.exit(errors > 0 ? 1 : 0)
