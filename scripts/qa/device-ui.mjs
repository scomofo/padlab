import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
const out = fileURLToPath(new URL('../../docs/validation/', import.meta.url))
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const report = { scope: 'Synthetic MIDI messages injected into the application; not physical hardware acceptance', checks: {} }
const errors = []; page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.goto(process.env.PADLAB_BASE_URL ?? 'http://127.0.0.1:8757'); await page.locator('.device-chip').click()
  await page.locator('.hardware-diagnostics summary').click()
  await page.getByLabel('Controller', { exact: true }).fill('Synthetic SP-404 fixture — no device attached')
  await page.getByLabel('Build / commit / DMG', { exact: true }).fill('Working-tree browser QA')
  await page.getByLabel('Audio output', { exact: true }).fill('Browser muted; no audible latency measurement')
  await page.getByRole('button', { name: 'Start capture', exact: true }).click()
  await page.evaluate(async () => {
    const { midi } = await import('/src/midi/midiManager.ts')
    midi.handleMessage('synthetic-fixture', 'SP-404 MKII', new MIDIMessageEvent('midimessage', { data: new Uint8Array([144, 36, 100]) }))
    midi.handleMessage('synthetic-fixture', 'SP-404 MKII', new MIDIMessageEvent('midimessage', { data: new Uint8Array([176, 1, 100]) }))
  })
  await page.waitForFunction(() => document.querySelector('.hardware-diagnostics').textContent.includes('1 mapped hits'))
  await page.getByRole('button', { name: 'Stop capture', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export acceptance JSON', exact: true }).click()
  await (await download).saveAs(`${out}/diagnostic-export-synthetic.json`)
  const exported = JSON.parse(await fs.readFile(`${out}/diagnostic-export-synthetic.json`, 'utf8'))
  report.checks.exportStaysIncomplete = exported.status === 'incomplete'
  report.checks.capture = exported.capture.summary
  await page.screenshot({ path: `${out}/hardware-diagnostics.png` })
  await page.getByRole('button', { name: 'Close device settings' }).click()
  const sixteen = page.locator('.lesson-grid .lesson-card').filter({ hasText: '16 pads' }).first()
  if (!await sixteen.count()) throw new Error('No 16-pad lesson available for layout check')
  await sixteen.click()
  await page.locator('.step-strip button').filter({ hasText: 'Perform' }).click()
  await page.locator('.segmented').getByRole('button', { name: 'Practice', exact: true }).click()
  await page.locator('.player-controls').getByRole('button', { name: /Start/ }).click()
  await page.waitForFunction(() => document.querySelector('.run-status').textContent.includes('Tap pads'), { timeout: 15000 })
  await page.screenshot({ path: `${out}/gameplay-16-pads.png` })
  report.checks.sixteenPadsRendered = await page.locator('.player .pad-grid button').count()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.screenshot({ path: `${out}/gameplay-16-pads-mobile.png` })
  report.checks.mobileNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  if (!report.checks.exportStaysIncomplete || report.checks.capture.mappedNoteOns !== 1 || report.checks.capture.otherMessages !== 1 || report.checks.sixteenPadsRendered !== 16 || !report.checks.mobileNoHorizontalOverflow || errors.length) throw new Error('Device UI assertion failed')
  report.status = 'pass'
} catch (error) {
  report.status = 'fail'; report.failure = String(error); process.exitCode = 1
  await page.screenshot({ path: `${out}/device-ui-failure.png` }).catch(() => {})
} finally {
  report.errors = errors; console.log(JSON.stringify(report, null, 2))
  await fs.writeFile(`${out}/device-ui-acceptance.json`, JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
