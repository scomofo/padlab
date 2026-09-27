/** Optional visual/interaction acceptance. Runs against a fresh, isolated profile. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = fileURLToPath(new URL('../../', import.meta.url))
const out = process.env.PADLAB_QA_OUT ?? fileURLToPath(new URL('../../docs/validation/polish/', import.meta.url))
await fs.mkdir(out, { recursive: true })
const server = process.env.PADLAB_BASE_URL ? null : await createServer({ root, server: { host: '127.0.0.1', port: 0 } })
await server?.listen()
const url = process.env.PADLAB_BASE_URL ?? server.resolvedUrls.local[0]
let browser
const report = { scope: 'Synthetic browser and keyboard checks; no physical MIDI/audio-latency certification.', checks: {}, errors: [] }
try {
  browser = await chromium.launch({
    ...(process.env.PADLAB_CHROMIUM_PATH ? { executablePath: process.env.PADLAB_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--mute-audio', '--disable-dev-shm-usage'],
  })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('padlab-settings-v1', JSON.stringify({ latencyMs: 0, volume: 0, metronome: true })))
  const shot = name => page.screenshot({ path: `${out}/${name}.png` })
  const noOverflow = async label => {
    const fits = await page.evaluate(() => {
      const main = document.querySelector('.browser, .player, .jam-studio')
      return document.documentElement.scrollWidth <= innerWidth + 1 && (!main || main.scrollWidth <= main.clientWidth + 1)
    })
    assert.ok(fits, `${label}: horizontal overflow`)
    report.checks[label] = true
  }
  const openLesson = async title => {
    await page.locator('.lesson-grid .lesson-card').filter({ hasText: title }).first().click()
    await page.locator('.step-strip button').filter({ hasText: 'Perform' }).click()
    await page.locator('.segmented').getByRole('button', { name: 'Play', exact: true }).click()
  }
  await page.goto(url)
  await noOverflow('studioDesktop')
  await shot('studio-desktop')
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await noOverflow(`studio${width}`)
    if (width === 390) await shot('studio-mobile')
  }
  await page.setViewportSize({ width: 1366, height: 900 })
  await openLesson('First Taps')
  // Dev-only instrumentation uses the real input bus and score keeper.
  await page.evaluate(async () => {
    const { PlayerRuntime } = await import('/src/engine/player.ts')
    const start = PlayerRuntime.prototype.start
    window.__runStarts = 0
    PlayerRuntime.prototype.start = function () { window.__runtime = this; window.__runStarts++; return start.call(this) }
  })
  await page.getByRole('button', { name: '▶ Start', exact: true }).click()
  await page.evaluate(async () => {
    const { getAudioContext } = await import('/src/audio/audio.ts')
    const { keyLabelForPad } = await import('/src/input/inputBus.ts')
    const runtime = window.__runtime
    for (const event of runtime.playerEvents) setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyLabelForPad(event.pad).toLowerCase(), bubbles: true,
    })), Math.max(0, (runtime.transport.beatToCtxTime(event.t) - getAudioContext().currentTime) * 1000))
  })
  await shot('count-in')
  await page.waitForFunction(() => window.__runtime.score.events.some(e => e.judgement === 'perfect'))
  await shot('single-lane')
  const heightBefore = await page.locator('.highway-wrap').evaluate(el => el.clientHeight)
  await page.getByRole('button', { name: 'Focus view', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Focus view', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.player > .pad-grid').isVisible(), false)
  assert.ok(await page.locator('.highway-wrap').evaluate(el => el.clientHeight) > heightBefore)
  await page.getByRole('button', { name: 'Focus view', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__runStarts), 1)
  report.checks.focusPreservesLiveRun = true
  await page.getByRole('dialog').waitFor({ timeout: 30000 })
  const summary = await page.evaluate(() => window.__runtime.score.summary())
  assert.ok(summary.accuracy >= 90, `Keyboard run scored ${summary.accuracy}%`)
  assert.equal(summary.miss, 0)
  report.checks.keyboardFullRun = summary
  await shot('results')
  await page.keyboard.press('Escape')
  await openLesson('Amen Chop Science')
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 })
    await noOverflow(`player16pads${width}`)
    assert.equal(await page.locator('.pad-grid .pad').count(), 16)
  }
  await page.getByRole('button', { name: '▶ Start', exact: true }).click()
  await page.waitForFunction(() => window.__runtime.transport.now() > 0.1)
  // Exercise simultaneous per-lane VFX via timestamped real pad-bus input.
  await page.evaluate(async () => {
    const { padBus } = await import('/src/input/inputBus.ts')
    const { getAudioContext } = await import('/src/audio/audio.ts')
    const rt = window.__runtime
    const next = rt.playerEvents.find(e => e.t > rt.transport.now() + 0.2)
    window.__impactBeat = next.t
    for (const event of rt.playerEvents.filter(e => e.t === next.t)) setTimeout(() => padBus.emit({ pad: event.pad, velocity: 110, source: 'keyboard', timeStamp: performance.now() }),
      Math.max(0, (rt.transport.beatToCtxTime(event.t) - getAudioContext().currentTime) * 1000))
  })
  await page.waitForFunction(() => window.__runtime.transport.now() > window.__impactBeat + 0.05)
  await shot('dense-lanes')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot('dense-mobile')
  await page.getByRole('button', { name: 'Focus view', exact: true }).click()
  await shot('focus-mobile')
  await page.getByRole('button', { name: 'Focus view', exact: true }).click()
  await page.getByRole('button', { name: '■ Stop', exact: true }).click()
  // Reduced motion preserves useful feedback but disables decorative pad rings.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('z')
  assert.equal(await page.locator('[data-pad="1"]').evaluate(el => getComputedStyle(el, '::after').animationName), 'none')
  assert.equal(await page.locator('[data-pad="1"]').evaluate(el => getComputedStyle(el).transform), 'none')
  report.checks.reducedMotionPadEffects = true
  // Space remains available after stopping; a stopped runtime is replaced once.
  const starts = await page.evaluate(() => window.__runStarts)
  await page.keyboard.press('Space')
  assert.equal(await page.evaluate(() => window.__runStarts), starts + 1)
  await page.getByRole('button', { name: '■ Stop', exact: true }).click()
  await page.getByRole('button', { name: '‹ Studio', exact: true }).click()
  await page.getByRole('button', { name: 'Open Jam ›', exact: true }).click()
  assert.equal(await page.locator('.jam-studio .pad').count(), 16)
  await noOverflow('jamMobile')
  report.checks.deckOpensJam = true
  assert.deepEqual(report.errors, [])
  report.status = 'pass'
} catch (error) {
  report.status = 'fail'
  report.failure = String(error)
  process.exitCode = 1
} finally {
  await browser?.close()
  await server?.close()
  await fs.writeFile(`${out}/acceptance.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
