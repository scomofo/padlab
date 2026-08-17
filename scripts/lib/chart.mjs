// Authoring helper: turns readable step-grid pattern strings into lesson JSON.
//
// A pattern row is one bar. Row length sets the resolution: 16 chars = sixteenth
// notes, 32 chars = thirty-second notes, 8 chars = eighth notes. '|' is ignored,
// so rows can be written with visual beat dividers.
//
// Velocity characters:
//   X accent (122)   x normal (102)   o medium (86)
//   s soft (70)      g ghost (50)     . rest
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lessons', 'data')

const VEL = { X: 122, x: 102, o: 86, s: 70, g: 50 }

/**
 * @param def lesson fields plus `grid`: { padNumber: barPattern | [barPatterns] }
 *            Bar patterns repeat cyclically if fewer than `bars` are given.
 */
export function buildLesson(def) {
  const { id, title, course, genre, level, padCount, bpm, bars, pads, steps, grid } = def
  const events = []

  for (const [padKey, rowsRaw] of Object.entries(grid)) {
    const pad = Number(padKey)
    if (!Number.isInteger(pad) || pad < 1 || pad > padCount) {
      throw new Error(`${id}: grid pad ${padKey} outside 1..${padCount}`)
    }
    if (!pads[padKey]) throw new Error(`${id}: grid pad ${padKey} has no sound in "pads"`)
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [rowsRaw]
    for (let bar = 0; bar < bars; bar++) {
      const row = rows[bar % rows.length].replace(/\|/g, '')
      if (![8, 16, 32].includes(row.length)) {
        throw new Error(`${id}: pad ${pad} bar ${bar + 1} has ${row.length} steps (want 8, 16, or 32)`)
      }
      const step = 4 / row.length
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        if (ch === '.') continue
        const vel = VEL[ch]
        if (vel === undefined) throw new Error(`${id}: unknown velocity char "${ch}"`)
        events.push({ t: +(bar * 4 + i * step).toFixed(4), pad, vel })
      }
    }
  }

  // Every mapped pad must actually be used, or the validator will reject it.
  for (const padKey of Object.keys(pads)) {
    if (!grid[padKey]) throw new Error(`${id}: pad ${padKey} mapped in "pads" but absent from grid`)
  }

  events.sort((a, b) => a.t - b.t || a.pad - b.pad)
  return { id, title, course, genre, level, padCount, bpm, bars, pads, steps, events }
}

export function writeLessons(defs) {
  mkdirSync(DATA_DIR, { recursive: true })
  const written = []
  for (const def of defs) {
    const lesson = buildLesson(def)
    writeFileSync(join(DATA_DIR, `${lesson.id}.json`), JSON.stringify(lesson, null, 2) + '\n')
    written.push(lesson)
    console.log(
      `wrote ${lesson.id.padEnd(24)} ${lesson.course.padEnd(18)} L${lesson.level} ${String(lesson.padCount).padStart(2)}p ${String(lesson.bpm).padStart(3)}bpm ${lesson.events.length} events`,
    )
  }
  return written
}

/** Shorthand for the final full-kit step. */
export const perform = (description) => ({ name: 'Perform', description, playerPads: 'all' })
