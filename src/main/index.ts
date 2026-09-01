import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { profileIdFromArgv } from './cliArgs'
import { registerIpc } from './ipc'
import { store } from './store'
import { checkForUpdates } from './updater'
import { recoverInterruptedTransactions } from './profileTransaction'

let mainWindow: BrowserWindow | null = null

/**
 * The window icon. Windows and macOS take it from the executable and the app
 * bundle, but Linux needs it handed over explicitly or the window falls back to
 * the stock Electron logo instead of the "OP" mark.
 */
function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 660,
    icon: iconPath(),
    show: false,
    backgroundColor: '#0d1017',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // The welcome chime plays on first launch, before the user has clicked
      // anything; Chromium's default policy would block it as unsolicited audio.
      autoplayPolicy: 'no-user-gesture-required',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // Every launch asks once. Delayed so it does not compete with the window
    // painting, and left unawaited — a failed check must not block startup.
    setTimeout(() => void checkForUpdates(), 3000)
  })
  mainWindow.on('closed', () => (mainWindow = null))

  // Anything the page tries to open in a new window goes to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The preload API is intentionally powerful. Never leave it attached to a
  // page that navigated away from the bundled renderer.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/**
 * The profile a desktop shortcut asked for, until the window can act on it.
 *
 * The argument arrives before there is a renderer to tell, and on a second
 * instance it arrives while the first one is already running. Both end up here,
 * and the window drains it once it is ready.
 */
let requestedProfileId: string | null = null

function requestProfileLaunch(profileId: string | null): void {
  if (!profileId) return
  requestedProfileId = profileId
  // Already up: hand it over now. Otherwise `createWindow` collects it when the
  // page finishes loading.
  if (mainWindow) mainWindow.webContents.send('profiles:launchRequest', profileId)
}

// A second instance should focus the existing window rather than start over.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Double-clicking the shortcut while the launcher is open is a request to
    // play that profile, not just to bring the window forward.
    requestProfileLaunch(profileIdFromArgv(argv))
  })

  app.whenReady().then(async () => {
    // Windows files toast notifications under this id and drops them silently
    // when it is missing, which is why the update notice needs it set here.
    app.setAppUserModelId('com.pisankus.client')
    store.init()
    await recoverInterruptedTransactions()
    registerIpc(() => mainWindow, () => {
      const pending = requestedProfileId
      requestedProfileId = null
      return pending
    })
    requestProfileLaunch(profileIdFromArgv(process.argv))
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // The game deliberately outlives the launcher: closing the window mid-session
  // used to kill Minecraft with it. Sessions are only stopped from the profile's
  // own stop button.

}
