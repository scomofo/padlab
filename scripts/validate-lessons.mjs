// Validates every lesson chart in src/lessons/data against the engine's
// expectations. The rules live in lib/validate.mjs so they can be tested;
// this file reads the files, prints, and sets the exit code.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateLesson } from './lib/validate.mjs'

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lessons')
const DATA_DIR = join(SRC_DIR, 'data')
// Same source of truth the app imports.
const courseIds = new Set(
  JSON.parse(readFileSync(join(SRC_DIR, 'courses.json'), 'utf8')).map((c) => c.id),
)

let errors = 0
let warnings = 0
const seenIds = new Set()

for (const file of readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
  let l
  try {
    l = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  } catch (e) {
    console.error(`ERROR ${file}: invalid JSON: ${e.message}`)
    errors++
    continue
  }

  const result = validateLesson(l, { courseIds, seenIds })
  for (const msg of result.errors) console.error(`ERROR ${file}: ${msg}`)
  for (const msg of result.warnings) console.warn(`warn  ${file}: ${msg}`)
  errors += result.errors.length
  warnings += result.warnings.length

  const count = (l.events ?? []).length
  console.log(
    `ok    ${String(l.course).padEnd(18)} L${l.level} ${String(l.padCount).padStart(2)}p ${String(l.bpm).padStart(3)}bpm ${String(count).padStart(3)}ev  "${l.title}"`,
  )
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`)
process.exit(errors > 0 ? 1 : 0)
