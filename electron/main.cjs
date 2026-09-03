// PadLab desktop shell. Serves the built Vite app over a privileged internal
// scheme and grants the Web MIDI permission the trainer needs to see hardware.
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const WEB_ROOT = path.join(__dirname, 'web')

const MIME_BY_EXT = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
])

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

// Single instance: second DMG launch focuses the first window instead of
// opening a competing localStorage writer.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 940,
    minHeight: 640,
    title: 'PadLab',
    backgroundColor: '#0b0e1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  })

  win.loadURL('padlab://app/index.html')

  // Nothing in the app links out; never let a stray link replace the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Same reason: the window must never navigate off the bundled app.
  const pinToApp = (event, url) => {
    if (!url.startsWith('padlab://')) event.preventDefault()
  }
  win.webContents.on('will-navigate', pinToApp)
  win.webContents.on('will-redirect', pinToApp)

  return win
}

// Chromium gates all Web MIDI behind the sysex permission internally (since
// ~M124), so 'midiSysex' must stay allowed even though the renderer asks for
// sysex: false — dropping it kills hardware input in the packaged app.
const ALLOWED = new Set(['midi', 'midiSysex'])

// Belt-and-braces for a fully local app: everything the page uses is bundled,
// so nothing needs a network origin. Inline styles stay allowed — React style
// props render as style attributes.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null)
  // Defence in depth: no <webview> today — deny if one ever appears.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })
  protocol.handle('padlab', async (request) => {
    let pathname = '/index.html'
    try {
      pathname = new URL(request.url).pathname
    } catch {
      return new Response('Bad Request', { status: 400, headers: { 'Content-Security-Policy': CSP } })
    }
    let decoded = ''
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return new Response('Bad Request', { status: 400, headers: { 'Content-Security-Policy': CSP } })
    }
    const target = path.normalize(path.join(WEB_ROOT, decoded))
    // Never serve anything outside the bundled web root.
    if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + path.sep)) {
      return new Response('Forbidden', { status: 403, headers: { 'Content-Security-Policy': CSP } })
    }
    const res = await net.fetch(pathToFileURL(target).toString())
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    const mime = MIME_BY_EXT.get(path.extname(target).toLowerCase())
    if (mime) headers.set('Content-Type', mime)
    return new Response(res.body, { status: res.status, headers })
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
