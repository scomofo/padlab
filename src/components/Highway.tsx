import { useEffect, useRef } from 'react'
import type { Lesson } from '../engine/types'
import type { PlayerRuntime } from '../engine/player'
import { padColor } from '../engine/kits'
import { SOUND_LABELS } from '../engine/types'
import { padSoundFor } from '../engine/kits'
import { keyLabelForPad } from '../input/inputBus'

interface HighwayProps {
  lesson: Lesson
  stepIndex: number
  /** User tempo (40-100), so the parked chart matches the run's note spacing. */
  tempoPct: number
  /** Live run, or null when idle (idle shows the chart parked at the start). */
  runtime: PlayerRuntime | null
}

const JUDGE_COLORS: Record<string, string> = {
  perfect: '#3ef0c8',
  great: '#6ea8ff',
  good: '#ffd166',
  miss: '#ff5d73',
  stray: '#a34554',
}

const JUDGE_TEXT: Record<string, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
  stray: 'EXTRA',
}

const VISIBLE_SEC = 2.6 // seconds of chart between the hit line and the top edge

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
}

const COMBO_TIERS: { min: number; color: string }[] = [
  { min: 20, color: '#ff6ec7' },
  { min: 10, color: '#ffd166' },
  { min: 0, color: '#3ef0c8' },
]
const comboColor = (combo: number) => COMBO_TIERS.find((t) => combo >= t.min)!.color

export function Highway({ lesson, stepIndex, tempoPct, runtime }: HighwayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const stepRef = useRef(stepIndex)
  stepRef.current = stepIndex
  const tempoRef = useRef(tempoPct)
  tempoRef.current = tempoPct

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx2d = canvas.getContext('2d')!
    let raf = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = wrap.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    const lanePads = [...new Set(lesson.events.map((e) => e.pad))].sort((a, b) => a - b)
    const laneIndex = new Map(lanePads.map((p, i) => [p, i]))
    const sortedEvents = [...lesson.events].sort((a, b) => a.t - b.t)

    // ---- flare state (particles, combo pulse, miss flash) — persists across frames ----
    let particles: Particle[] = []
    const processedFeedback = new WeakSet<object>()
    let lastFrame = performance.now()
    let lastCombo = 0
    let comboPulseUntil = 0
    let missFlashUntil = 0

    const spawnBurst = (x: number, y: number, color: string) => {
      const n = 10
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4
        const speed = 60 + Math.random() * 100
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          life: 0,
          maxLife: 380 + Math.random() * 200,
          color,
        })
      }
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx2d.clearRect(0, 0, w, h)
      if (w < 40 || h < 60) return

      const frameNow = performance.now()
      const dt = Math.min(50, frameNow - lastFrame)
      lastFrame = frameNow

      const rt = runtimeRef.current
      const step = lesson.steps[stepRef.current]
      const playerPads: Set<number> = rt
        ? rt.playerPadSet
        : step.playerPads === 'all'
          ? new Set(lanePads)
          : new Set(step.playerPads)

      const now = rt ? rt.transport.now() : -0.0001
      // Idle mirrors PlayerRuntime's scale so the chart doesn't lurch on start.
      const idleScale = Math.min(1.2, Math.max(0.25, (step.tempoScale ?? 1) * (tempoRef.current / 100)))
      const secPerBeat = rt ? rt.transport.secPerBeat : 60 / (lesson.bpm * idleScale)
      const labelH = 34
      const hitY = h - labelH - 26
      const ppb = (hitY / VISIBLE_SEC) * secPerBeat // px per beat
      const laneW = w / lanePads.length
      const beatToY = (t: number) => hitY - (t - now) * ppb

      // react to new judgements: bursts on great hits, a flash on misses
      if (rt) {
        for (const f of rt.feedback) {
          if (processedFeedback.has(f)) continue
          processedFeedback.add(f)
          const li = laneIndex.get(f.pad)
          if (li === undefined) continue
          if (f.judgement === 'perfect' || f.judgement === 'great') {
            spawnBurst(li * laneW + laneW / 2, hitY, JUDGE_COLORS[f.judgement])
          } else if (f.judgement === 'miss') {
            missFlashUntil = frameNow + 220
          }
        }
        if (rt.score && rt.score.combo > lastCombo) comboPulseUntil = frameNow + 260
        lastCombo = rt.score?.combo ?? 0
      } else {
        lastCombo = 0
      }

      // lane backgrounds
      for (let i = 0; i < lanePads.length; i++) {
        ctx2d.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.022)' : 'rgba(255,255,255,0.045)'
        ctx2d.fillRect(i * laneW, 0, laneW, hitY)
        if (!playerPads.has(lanePads[i])) {
          ctx2d.fillStyle = 'rgba(6,8,16,0.45)' // dim backing lanes
          ctx2d.fillRect(i * laneW, 0, laneW, hitY)
        }
      }

      // beat / bar lines
      const topBeat = now + hitY / ppb
      for (let b = Math.max(0, Math.floor(now)); b <= Math.min(lesson.bars * 4, Math.ceil(topBeat)); b++) {
        const y = beatToY(b)
        if (y < 0 || y > hitY) continue
        const isBar = b % 4 === 0
        ctx2d.strokeStyle = isBar ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.055)'
        ctx2d.lineWidth = isBar ? 1.5 : 1
        ctx2d.beginPath()
        ctx2d.moveTo(0, y)
        ctx2d.lineTo(w, y)
        ctx2d.stroke()
        if (isBar && b < lesson.bars * 4) {
          ctx2d.fillStyle = 'rgba(255,255,255,0.3)'
          ctx2d.font = '600 10px system-ui, sans-serif'
          ctx2d.textAlign = 'left'
          ctx2d.fillText(`BAR ${b / 4 + 1}`, 6, y - 5)
        }
      }

      // hit line, with a soft glow that brightens with combo
      const comboGlow = rt?.score ? Math.min(1, rt.score.combo / 24) : 0
      const grad = ctx2d.createLinearGradient(0, hitY - 2, w, hitY - 2)
      grad.addColorStop(0, '#3ef0c8')
      grad.addColorStop(1, '#818cf8')
      ctx2d.save()
      ctx2d.shadowColor = rt?.score ? comboColor(rt.score.combo) : '#3ef0c8'
      ctx2d.shadowBlur = 6 + comboGlow * 18
      ctx2d.fillStyle = grad
      ctx2d.fillRect(0, hitY - 2, w, 4)
      ctx2d.restore()

      // notes
      const noteH = Math.max(10, Math.min(18, ppb * 0.22))
      const judged = rt?.score?.events ?? null
      const drawNote = (t: number, pad: number, style: 'player' | 'backing' | 'hit' | 'missed') => {
        const li = laneIndex.get(pad)
        if (li === undefined) return
        const y = beatToY(t)
        if (y < -noteH || y > hitY + 120) return
        const x = li * laneW + 5
        const nw = laneW - 10
        const color = padColor(pad)
        ctx2d.beginPath()
        ctx2d.roundRect(x, y - noteH / 2, nw, noteH, 5)
        if (style === 'backing') {
          ctx2d.globalAlpha = 0.28
          ctx2d.fillStyle = color
          ctx2d.fill()
        } else if (style === 'missed') {
          ctx2d.globalAlpha = 0.45
          ctx2d.fillStyle = '#ff5d73'
          ctx2d.fill()
        } else if (style === 'hit') {
          ctx2d.globalAlpha = 0.15
          ctx2d.fillStyle = color
          ctx2d.fill()
        } else {
          ctx2d.globalAlpha = 1
          ctx2d.fillStyle = color
          ctx2d.fill()
          ctx2d.globalAlpha = 0.5
          ctx2d.strokeStyle = '#ffffff'
          ctx2d.lineWidth = 1
          ctx2d.stroke()
        }
        ctx2d.globalAlpha = 1
      }

      for (const e of sortedEvents) {
        const isPlayer = playerPads.has(e.pad)
        if (!isPlayer) {
          if (e.t >= now - 0.1) drawNote(e.t, e.pad, 'backing')
          continue
        }
        if (judged) {
          const je = judged.find((j) => j.t === e.t && j.pad === e.pad)
          if (je?.judgement === 'miss') drawNote(e.t, e.pad, 'missed')
          else if (je?.judgement) drawNote(e.t, e.pad, 'hit')
          else drawNote(e.t, e.pad, 'player')
        } else if (rt && rt.mode === 'practice' && rt.practiceDone.has(e)) {
          drawNote(e.t, e.pad, 'hit')
        } else {
          drawNote(e.t, e.pad, 'player')
        }
      }

      // hit-burst particles
      particles = particles.filter((p) => p.life < p.maxLife)
      for (const p of particles) {
        p.life += dt
        p.x += p.vx * (dt / 1000)
        p.y += p.vy * (dt / 1000)
        p.vy += 260 * (dt / 1000) // gravity
        const t = p.life / p.maxLife
        ctx2d.globalAlpha = Math.max(0, 1 - t)
        ctx2d.fillStyle = p.color
        ctx2d.beginPath()
        ctx2d.arc(p.x, p.y, Math.max(0.5, 2.5 * (1 - t) + 1), 0, Math.PI * 2)
        ctx2d.fill()
      }
      ctx2d.globalAlpha = 1

      // waiting indicator (practice mode)
      if (rt?.waitingPads) {
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 180)
        for (const pad of rt.waitingPads) {
          const li = laneIndex.get(pad)
          if (li === undefined) continue
          ctx2d.globalAlpha = pulse
          ctx2d.strokeStyle = padColor(pad)
          ctx2d.lineWidth = 3
          ctx2d.beginPath()
          ctx2d.roundRect(li * laneW + 3, hitY - 16, laneW - 6, 32, 8)
          ctx2d.stroke()
          ctx2d.fillStyle = padColor(pad)
          ctx2d.font = '700 11px system-ui, sans-serif'
          ctx2d.textAlign = 'center'
          ctx2d.fillText('TAP', li * laneW + laneW / 2, hitY - 24)
          ctx2d.globalAlpha = 1
        }
      }

      // judgement popups
      if (rt) {
        const nowWall = performance.now()
        rt.feedback = rt.feedback.filter((f) => nowWall - f.wall < 700)
        for (const f of rt.feedback) {
          const li = laneIndex.get(f.pad)
          if (li === undefined) continue
          const age = (nowWall - f.wall) / 700
          ctx2d.globalAlpha = 1 - age
          ctx2d.fillStyle = JUDGE_COLORS[f.judgement]
          ctx2d.font = '800 13px system-ui, sans-serif'
          ctx2d.textAlign = 'center'
          ctx2d.fillText(JUDGE_TEXT[f.judgement], li * laneW + laneW / 2, hitY - 34 - age * 26)
          ctx2d.globalAlpha = 1
        }
        // combo, with a brief pop + glow on every step up and a hotter color at higher tiers
        if (rt.score && rt.score.combo >= 4) {
          const pulseT = Math.max(0, (comboPulseUntil - frameNow) / 260)
          const scale = 1 + pulseT * 0.4
          const color = comboColor(rt.score.combo)
          ctx2d.save()
          ctx2d.translate(w - 14, 30)
          ctx2d.scale(scale, scale)
          ctx2d.shadowColor = color
          ctx2d.shadowBlur = 8 + pulseT * 14
          ctx2d.fillStyle = color
          ctx2d.font = '800 20px system-ui, sans-serif'
          ctx2d.textAlign = 'right'
          ctx2d.fillText(`${rt.score.combo}x`, 0, 0)
          ctx2d.restore()
        }
        // count-in
        if (rt.transport.state === 'playing' && now < 0) {
          ctx2d.fillStyle = 'rgba(255,255,255,0.9)'
          ctx2d.font = '800 64px system-ui, sans-serif'
          ctx2d.textAlign = 'center'
          ctx2d.fillText(String(Math.ceil(-now)), w / 2, h * 0.4)
        }
      }

      // miss flash — a quick red vignette at the screen edges
      if (frameNow < missFlashUntil) {
        const t = (missFlashUntil - frameNow) / 220
        const vignette = ctx2d.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7)
        vignette.addColorStop(0, 'rgba(255,93,115,0)')
        vignette.addColorStop(1, `rgba(255,93,115,${0.35 * t})`)
        ctx2d.fillStyle = vignette
        ctx2d.fillRect(0, 0, w, h)
      }

      // lane footer labels
      ctx2d.fillStyle = 'rgba(10,13,24,0.92)'
      ctx2d.fillRect(0, hitY + 2, w, h - hitY - 2)
      for (let i = 0; i < lanePads.length; i++) {
        const pad = lanePads[i]
        const cx = i * laneW + laneW / 2
        const sound = padSoundFor(lesson, lesson.padCount, pad)
        ctx2d.fillStyle = padColor(pad)
        ctx2d.font = '800 12px system-ui, sans-serif'
        ctx2d.textAlign = 'center'
        const key = keyLabelForPad(pad)
        ctx2d.fillText(`${pad}${key ? ` · ${key}` : ''}`, cx, hitY + 22)
        ctx2d.fillStyle = 'rgba(255,255,255,0.55)'
        ctx2d.font = '600 10px system-ui, sans-serif'
        ctx2d.fillText(sound ? SOUND_LABELS[sound] : '—', cx, hitY + 38)
      }
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [lesson])

  return (
    <div ref={wrapRef} className="highway-wrap">
      <canvas ref={canvasRef} />
    </div>
  )
}
