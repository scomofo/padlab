// PadLab desktop shell. Serves the built Vite app over a privileged internal
// scheme and grants the Web MIDI permission the trainer needs to see hardware.
const { app, BrowserWindow, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const WEB_ROOT = path.join(__dirname, 'web')

// The bundle is ES modules, which Chromium refuses to load over file:// because
// that origin is opaque to CORS. A registered standard scheme gives the app a
// real origin — and a secure context, which Web MIDI requires.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'padlab',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

// The trainer schedules audio on the AudioContext clock; letting Chromium
// throttle background timers makes playback stutter when the window blurs.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 940,
    minHeight: 640,
    title: 'PadLab',
    backgroundColor: '#0b0e1a',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  win.loadURL('padlab://app/index.html')

  // Nothing in the app links out; never let a stray link replace the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

const ALLOWED = new Set(['midi', 'midiSysex'])

app.whenReady().then(() => {
  protocol.handle('padlab', (request) => {
    const { pathname } = new URL(request.url)
    const target = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)))
    // Never serve anything outside the bundled web root.
    if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })

  // Without this the renderer's requestMIDIAccess() is rejected and the app
  // silently falls back to keyboard-only input.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
