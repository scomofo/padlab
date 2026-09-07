import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import fs from 'node:fs/promises'
const out = fileURLToPath(new URL('../../docs/validation/', import.meta.url))
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'padlab-acceptance-'))
const executablePath = fileURLToPath(new URL('../../release/PadLab.app/Contents/MacOS/Electron', import.meta.url))
const report = { scope: 'Locally built arm64 application, isolated test profile. Not a downloaded Gatekeeper test or physical MIDI acceptance.', checks: {} }
const errors = []; let app
async function launch() {
  const instance = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, '--mute-audio'] })
  const dataPath = await instance.evaluate(({ app }) => app.getPath('userData'))
  if (await fs.realpath(dataPath) !== await fs.realpath(profile)) {
    await instance.close(); throw new Error('Refusing test writes outside isolated profile')
  }
  const page = await instance.firstWindow(); page.on('pageerror', (e) => errors.push(e.message))
  await page.locator('.device-chip').waitFor()
  return { instance, page }
}
try {
  let { instance, page } = await launch(); app = instance
  report.checks.origin = await page.evaluate(() => location.origin)
  report.checks.electronPackagedFlag = await app.evaluate(({ app }) => app.isPackaged)
  report.checks.bundlePath = await app.evaluate(({ app }) => app.getAppPath())
  report.checks.releasePolicy = await app.evaluate(({ BrowserWindow, Menu }) => ({ devToolsDisabled: !BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().devTools, developmentMenuRemoved: Menu.getApplicationMenu() === null }))
  await page.locator('.device-chip').click()
  report.checks.noPhysicalDevices = await page.getByText(/No devices detected/).isVisible()
  const volume = page.locator('.slider-row').filter({ hasText: 'Volume' }).locator('input')
  await volume.focus(); await volume.press('Home')
  report.checks.savedVolume = await volume.inputValue()
  await page.getByRole('button', { name: 'Close device settings' }).click()
  await page.locator('.lesson-grid .lesson-card').filter({ hasText: 'First Taps' }).first().click()
  await page.locator('.player-controls').getByRole('button', { name: /Start/ }).click()
  await page.waitForFunction(() => document.querySelector('.run-status').textContent.includes('Bar 1'))
  report.checks.listenRunStarted = await page.locator('.run-status').innerText()
  await page.screenshot({ path: `${out}/native-arm64-gameplay.png` })
  await app.close(); app = undefined
  ;({ instance, page } = await launch()); app = instance
  await page.locator('.device-chip').click()
  report.checks.volumeAfterRelaunch = await page.locator('.slider-row').filter({ hasText: 'Volume' }).locator('input').inputValue()
  report.checks.midiPermissionReady = await page.getByText(/No devices detected/).isVisible()
  if (report.checks.origin !== 'padlab://app' || !report.checks.bundlePath.endsWith('/release/PadLab.app/Contents/Resources/app') || !report.checks.releasePolicy.devToolsDisabled || !report.checks.releasePolicy.developmentMenuRemoved || !report.checks.midiPermissionReady || report.checks.savedVolume !== '0' || report.checks.volumeAfterRelaunch !== '0' || errors.length) throw new Error('Packaged application assertion failed')
  report.status = 'pass'
} catch (error) {
  report.status = 'fail'; report.failure = String(error); process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  report.errors = errors
  await fs.writeFile(`${out}/native-arm64-acceptance.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
