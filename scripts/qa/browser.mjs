import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
const out = fileURLToPath(new URL('../../docs/validation/', import.meta.url))
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []; page.on('pageerror', (error) => errors.push(error.message))
const report = { scope: 'Synthetic keyboard/browser checks only; no physical MIDI controller tested', browser: browser.version(), checks: {} }
try {
  await page.goto(process.env.PADLAB_BASE_URL ?? 'http://127.0.0.1:8757')
  await page.locator('.lesson-grid .lesson-card').filter({ hasText: 'First Taps' }).first().click()
  await page.locator('.step-strip button').filter({ hasText: 'Perform' }).click()
  await page.locator('.segmented').getByRole('button', { name: 'Play', exact: true }).click()
  await page.evaluate(async () => {
    const { PlayerRuntime } = await import('/src/engine/player.ts')
    const start = PlayerRuntime.prototype.start
    PlayerRuntime.prototype.start = function () { window.__padlabRuntime = this; start.call(this) }
  })
  await page.locator('.player-controls').getByRole('button', { name: /Start/ }).click()
  await page.evaluate(async () => {
    const { getAudioContext } = await import('/src/audio/audio.ts')
    const { keyLabelForPad } = await import('/src/input/inputBus.ts')
    const rt = window.__padlabRuntime
    for (const event of rt.playerEvents) setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyLabelForPad(event.pad).toLowerCase(), bubbles: true,
    })), Math.max(0, (rt.transport.beatToCtxTime(event.t) - getAudioContext().currentTime) * 1000))
  })
  await page.waitForFunction(() => window.__padlabRuntime.transport.now() > 0.5, { timeout: 15000 })
  await page.screenshot({ path: `${out}/gameplay-desktop.png` })
  report.checks.desktopStatus = await page.locator('.run-status').innerText()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${out}/gameplay-mobile.png` })
  report.checks.mobileNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  await page.setViewportSize({ width: 1366, height: 768 })
  report.checks.laptopNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 60000 })
  report.checks.keyboardFullRun = await page.evaluate(() => window.__padlabRuntime.score.summary())
  await page.screenshot({ path: `${out}/gameplay-results.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  report.checks.reducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  report.errors = errors
  if (!report.checks.desktopStatus.includes('100%') || errors.length || !report.checks.mobileNoHorizontalOverflow || !report.checks.laptopNoHorizontalOverflow || report.checks.keyboardFullRun.accuracy < 90) throw new Error('Browser acceptance assertion failed')
  report.status = 'pass'
} catch (error) {
  report.status = 'fail'; report.failure = String(error); report.errors = errors
  await page.screenshot({ path: `${out}/browser-failure.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  await fs.writeFile(`${out}/browser-acceptance.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2)); await browser.close()
}
