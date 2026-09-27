/** Optional discovery/results acceptance against a fresh, muted browser profile. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = fileURLToPath(new URL('../../', import.meta.url))
const out = process.env.PADLAB_QA_OUT ?? fileURLToPath(new URL('../../docs/validation/library-results/', import.meta.url))
await fs.mkdir(out, { recursive: true })
const server = process.env.PADLAB_BASE_URL ? null : await createServer({ root, server: { host: '127.0.0.1', port: 0 } })
await server?.listen()
const url = process.env.PADLAB_BASE_URL ?? server.resolvedUrls.local[0]
const report = { scope: 'Synthetic browser/keyboard checks; no physical MIDI or audio-latency certification.', checks: {}, errors: [] }
let browser
try {
  browser = await chromium.launch({
    ...(process.env.PADLAB_CHROMIUM_PATH ? { executablePath: process.env.PADLAB_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--mute-audio', '--disable-dev-shm-usage'],
  })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('padlab-settings-v1', JSON.stringify({ latencyMs: 0, volume: 0, metronome: true })))
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const shot = async name => { await settle(); await page.screenshot({ path: `${out}/${name}.png` }) }
  const noOverflow = async label => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
      && [...document.querySelectorAll('.browser, .results-card, .results-scroll')].every(el => el.scrollWidth <= el.clientWidth + 1)), `${label}: horizontal overflow`)
    report.checks[label] = true
  }
  await page.goto(url)
  const search = page.getByRole('searchbox', { name: 'Search lessons and guides' })
  const difficulty = page.getByLabel('Difficulty', { exact: true })
  const courseProgress = await page.locator('.course-count').first().textContent()
  await page.evaluate(async () => {
    const { padBus } = await import('/src/input/inputBus.ts')
    window.__padEvents = 0
    padBus.subscribe(() => window.__padEvents++)
  })
  await search.fill('TaPs   first')
  await search.press('z')
  assert.equal(await page.evaluate(() => window.__padEvents), 0)
  await search.fill('TaPs   first')
  await difficulty.selectOption('1')
  await page.getByRole('button', { name: '8 pads · MPK Mini', exact: true }).click()
  assert.equal(await page.locator('.lesson-card').count(), 1)
  assert.equal(await page.locator('.lesson-card h3').textContent(), 'First Taps')
  assert.equal(await page.locator('.course-count').textContent(), courseProgress)
  await difficulty.selectOption('2')
  assert.equal(await page.locator('.lesson-card').count(), 0)
  assert.ok(await page.getByRole('heading', { name: 'No matching grooves' }).isVisible())
  await page.getByRole('button', { name: 'Show the full collection' }).click()
  assert.equal(await search.inputValue(), '')
  assert.equal(await difficulty.inputValue(), 'all')
  report.checks.combinedFiltersAndStableProgress = true
  report.checks.typingDoesNotTriggerPads = true

  const guide = await page.evaluate(async () => (await import('/src/guides/index.ts')).GUIDES[0])
  await search.fill(guide.title)
  await difficulty.selectOption(String(guide.level))
  assert.ok(await page.locator('.guide-card').filter({ hasText: guide.title }).isVisible())
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  assert.ok(await search.evaluate(el => el === document.activeElement))
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  report.checks.searchIncludesGuidesAndClearKeepsFocus = true

  await page.locator('.library-tools').evaluate(el => el.scrollIntoView({ block: 'start' }))
  await shot('collection-desktop')
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 })
    await noOverflow(`collection${width}`)
    if (width === 390) {
      await page.locator('.library-tools').evaluate(el => el.scrollIntoView({ block: 'start' }))
      await shot('collection-mobile')
    }
  }
  await search.fill('first')
  await difficulty.selectOption('1')
  await page.getByRole('button', { name: '8 pads · MPK Mini', exact: true }).click()
  const firstTaps = page.locator('.lesson-card').filter({ hasText: 'First Taps' })
  await firstTaps.scrollIntoViewIfNeeded()
  await settle()
  const scrollTop = await page.locator('.browser').evaluate(el => el.scrollTop)
  await firstTaps.click()
  await page.getByRole('button', { name: '‹ Studio', exact: true }).click()
  assert.equal(await search.inputValue(), 'first')
  assert.equal(await difficulty.inputValue(), '1')
  assert.equal(await page.getByRole('button', { name: '8 pads · MPK Mini', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.ok(Math.abs(await page.locator('.browser').evaluate(el => el.scrollTop) - scrollTop) < 2)
  report.checks.returnRestoresSearchFiltersAndScroll = true

  await firstTaps.click()
  await page.locator('.step-strip button').filter({ hasText: 'Perform' }).click()
  await page.locator('.segmented').getByRole('button', { name: 'Play', exact: true }).click()
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
    const rt = window.__runtime
    for (const event of rt.playerEvents) setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyLabelForPad(event.pad).toLowerCase(), bubbles: true,
    })), Math.max(0, (rt.transport.beatToCtxTime(event.t) - getAudioContext().currentTime) * 1000))
  })
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 30000 })
  const summary = await page.evaluate(() => window.__runtime.score.summary())
  assert.ok(summary.accuracy >= 90)
  assert.equal(summary.miss, 0)
  report.checks.keyboardPerformance = summary
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.stars.big .star').first().evaluate(el => getComputedStyle(el).animationName), 'none')
  report.checks.reducedMotionStars = true
  await shot('results-desktop')
  const details = page.getByRole('region', { name: 'Performance details' })
  for (const [width, height] of [[320, 568], [390, 844], [768, 900], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await noOverflow(`results${width}x${height}`)
    await details.evaluate(el => { el.scrollTop = 0 })
    const footer = await page.locator('.results-footer').boundingBox()
    assert.ok(footer.y >= 0 && footer.y + footer.height <= height)
    await details.evaluate(el => { el.scrollTop = el.scrollHeight })
    await settle()
    assert.deepEqual(await page.locator('.results-footer').boundingBox(), footer)
    if (width === 390) {
      await details.evaluate(el => { el.scrollTop = 0 })
      await shot('results-mobile')
    }
  }
  report.checks.resultsActionsStayVisibleDuringScroll = true
  await page.setViewportSize({ width: 390, height: 844 })
  const buttons = dialog.getByRole('button')
  await buttons.last().focus()
  await page.keyboard.press('Tab')
  assert.ok(await details.evaluate(el => el === document.activeElement))
  await page.keyboard.press('Shift+Tab')
  assert.ok(await buttons.last().evaluate(el => el === document.activeElement))
  report.checks.dialogTrapsFocusIncludingScrollableDetails = true
  const starts = await page.evaluate(() => window.__runStarts)
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__runStarts), starts + 1)
  await page.getByRole('button', { name: '■ Stop', exact: true }).click()
  await page.locator('.segmented').getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: '▶ Start', exact: true }).click()
  // Real wait-mode input: answer each paused group through the same keyboard bus.
  await page.evaluate(async () => {
    const { keyLabelForPad } = await import('/src/input/inputBus.ts')
    const rt = window.__runtime
    const timer = setInterval(() => {
      if (document.querySelector('[role="dialog"]')) { clearInterval(timer); return }
      for (const pad of [...(rt.waitingPads ?? [])]) window.dispatchEvent(new KeyboardEvent('keydown', { key: keyLabelForPad(pad).toLowerCase(), bubbles: true }))
    }, 25)
  })
  await dialog.waitFor({ timeout: 30000 })
  assert.ok(await dialog.getByRole('heading', { name: 'Practice complete' }).isVisible())
  assert.equal(await dialog.locator('.accuracy, .stars.big').count(), 0)
  assert.ok(await dialog.getByRole('button', { name: 'Repeat practice', exact: true }).isVisible())
  await shot('practice-mobile')
  report.checks.waitModeHasCompletionWithoutInventedScore = true
  await page.keyboard.press('Escape')
  assert.ok(await search.isVisible())
  assert.equal(await search.inputValue(), 'first')
  report.checks.escapeReturnsToFilteredCollection = true
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
