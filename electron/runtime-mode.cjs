const path = require('node:path')
const { existsSync } = require('node:fs')

const BUNDLE_MARKER = '.padlab-bundle'

/**
 * The custom macOS packager deliberately preserves the Electron executable name.
 * Electron can therefore report isPackaged=false even inside PadLab.app.
 * An explicit marker, covered by the bundle signature, selects release UI policy.
 */
function isBundled(appIsPackaged, appDirectory, exists = existsSync) {
  return appIsPackaged || exists(path.join(appDirectory, BUNDLE_MARKER))
}

module.exports = { BUNDLE_MARKER, isBundled }
