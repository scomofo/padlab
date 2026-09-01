import { useEffect, useMemo, useState } from 'react'
import type { Lesson, LessonProgress } from '../engine/types'
import type { Guide } from '../guides/types'
import type { GuideProgress } from '../store/progress'
import { COURSES } from '../lessons/courses'
import { courseProgress, startedCount, totalStars } from '../lessons/courseProgress'
import { midi } from '../midi/midiManager'

interface LessonBrowserProps {
  lessons: Lesson[]
  guides: Guide[]
  progress: Record<string, LessonProgress>
  guideProgress: Record<string, GuideProgress>
  onOpen: (lesson: Lesson) => void
  onOpenGuide: (guide: Guide) => void
  onOpenSetup: () => void
}

type Filter = 'all' | 8 | 16

export function LessonBrowser({
  lessons, guides, progress, guideProgress, onOpen, onOpenGuide, onOpenSetup,
}: LessonBrowserProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [, bump] = useState(0)

  useEffect(() => midi.onStatusChange(() => bump((n) => n + 1)), [])

  const filtered = useMemo(
    () => lessons.filter((l) => filter === 'all' || l.padCount === filter),
    [lessons, filter],
  )

  const filteredGuides = useMemo(
    () => guides.filter((g) => filter === 'all' || g.padCount === filter),
    [guides, filter],
  )

  const byCourse = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const l of filtered) {
      const list = map.get(l.course)
      if (list) list.push(l)
      else map.set(l.course, [l])
    }
    return map
  }, [filtered])

  const guidesByCourse = useMemo(() => {
    const map = new Map<string, Guide[]>()
    for (const g of filteredGuides) {
      const list = map.get(g.course)
      if (list) list.push(g)
      else map.set(g.course, [g])
    }
    return map
  }, [filteredGuides])

  const stars = totalStars(lessons, progress)
  const started = startedCount(lessons, progress)

  const device = midi.inputs[0]
  const extraInputs = midi.inputs.length - 1
  const deviceLabel =
    midi.status === 'unsupported' ? 'Web MIDI unavailable — use Chrome/Edge (keys still work)'
    : midi.status === 'denied' ? 'MIDI access blocked'
    : device
      ? `${device.name}${extraInputs > 0 ? ` +${extraInputs}` : ''} — ${midi.customMap ? 'custom mapping' : device.profile.label}`
    : 'No MIDI device — keyboard & mouse work'

  return (
    <div className="browser">
      <header className="browser-head">
        <div>
          <div className="logo">Pad<span>Lab</span></div>
          <div className="muted tagline">Finger drumming, one step at a time</div>
        </div>
        <button className="device-chip" onClick={onOpenSetup}>
          <span className={device ? 'dot on' : 'dot'} />
          {deviceLabel}
          <span className="gear">⚙</span>
        </button>
      </header>

      <div className="overview">
        <span className="overview-stat"><strong>{lessons.length}</strong> lessons</span>
        <span className="overview-stat"><strong>{guides.length}</strong> walkthroughs</span>
        <span className="overview-stat"><strong>{COURSES.length}</strong> courses</span>
        <span className="overview-stat"><strong>{started}</strong> started</span>
        <span className="overview-stat gold">★ <strong>{stars}</strong> / {lessons.length * 3}</span>
      </div>

      <div className="filter-row">
        {([['all', 'All lessons'], [8, '8 pads · MPK Mini'], [16, '16 pads · SP-404']] as [Filter, string][]).map(
          ([f, label]) => (
            <button key={String(f)} className={filter === f ? 'chip-btn on' : 'chip-btn'} onClick={() => setFilter(f)}>
              {label}
            </button>
          ),
        )}
      </div>

      {COURSES.map((course) => {
        const courseLessons = byCourse.get(course.id) ?? []
        const courseGuides = guidesByCourse.get(course.id) ?? []
        if (!courseLessons.length && !courseGuides.length) return null
        const cp = courseProgress(courseLessons, courseGuides, progress, guideProgress)
        return (
          <section className="course" key={course.id}>
            <div className="course-head">
              <div>
                <h2 className="course-title">{course.title}</h2>
                <div className="muted">{course.blurb}</div>
              </div>
              <span className="course-count muted">
                {cp.done}/{cp.total} {cp.noun}
              </span>
            </div>
            <div className="course-progress">
              <div className={cp.pct === 100 ? 'course-progress-fill maxed' : 'course-progress-fill'} style={{ width: `${cp.pct}%` }} />
            </div>
            <div className="lesson-grid">
              {courseGuides.map((g) => {
                const gp = guideProgress[g.id]
                return (
                  <button key={g.id} className="lesson-card guide-card" onClick={() => onOpenGuide(g)}>
                    <div className="card-top">
                      <span className="guide-chip">WALKTHROUGH</span>
                      <span className="pads-chip">{g.minutes} MIN</span>
                    </div>
                    <h3>{g.title}</h3>
                    <div className="muted">{g.blurb}</div>
                    <div className="card-bottom">
                      <span className="muted">{g.steps.length} steps</span>
                      {gp?.completed ? (
                        <span className="done-badge">✓ Done</span>
                      ) : gp ? (
                        <span className="muted">step {gp.lastStep + 1}</span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
              {courseLessons.map((l) => {
                const p = progress[l.id]
                return (
                  <button key={l.id} className="lesson-card" onClick={() => onOpen(l)}>
                    <div className="card-top">
                      <span className={`level-chip lv${l.level}`}>LV {l.level}</span>
                      <span className="pads-chip">{l.padCount} PADS</span>
                    </div>
                    <h3>{l.title}</h3>
                    <div className="muted">{l.genre} · {l.bpm} BPM · {l.bars} bars</div>
                    <div className="card-bottom">
                      <span className={(p?.stars ?? 0) >= 3 ? 'stars maxed' : 'stars'}>
                        {[1, 2, 3].map((s) => (
                          <span key={s} className={(p?.stars ?? 0) >= s ? 'star on' : 'star'}>★</span>
                        ))}
                      </span>
                      {p && p.bestAccuracy > 0 && <span className="best muted">best {p.bestAccuracy}%</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 && filteredGuides.length === 0 && (
        <div className="muted empty">No lessons for this filter yet.</div>
      )}
    </div>
  )
}
