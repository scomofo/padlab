// One-off: backfill the `course` field on lessons authored before courses existed.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './lib/chart.mjs'

const ASSIGNMENTS = {
  'first-beats': 'foundations',
  'boom-bap-first-beat': 'foundations',
  'boom-bap-perc-pickup': 'foundations',
  'four-on-the-floor-house': 'four-to-the-floor',
  'shaker-stab-house': 'four-to-the-floor',
  'peak-time-pressure': 'four-to-the-floor',
  'trap-halftime-essentials': 'hip-hop-lab',
  'trap-808-arsenal': 'hip-hop-lab',
  'syncopated-funk-pocket': 'breaks-and-bass',
  'ghost-note-funk-break': 'breaks-and-bass',
  'two-step-displacement': 'breaks-and-bass',
  'amen-chop-science': 'breaks-and-bass',
  'songo-engine': 'global-grooves',
}

for (const [id, course] of Object.entries(ASSIGNMENTS)) {
  const path = join(DATA_DIR, `${id}.json`)
  const lesson = JSON.parse(readFileSync(path, 'utf8'))
  if (lesson.course === course) {
    console.log(`skip  ${id} (already ${course})`)
    continue
  }
  // Rebuild with `course` sitting right after `title` for readable diffs.
  const { id: lid, title, ...rest } = lesson
  delete rest.course
  writeFileSync(path, JSON.stringify({ id: lid, title, course, ...rest }, null, 2) + '\n')
  console.log(`ok    ${id} -> ${course}`)
}
