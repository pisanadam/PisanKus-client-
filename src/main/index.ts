import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { killAllSessions, registerIpc } from './ipc'
import { store } from './store'
import { checkForUpdates } from './updater'

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
      sandbox: false
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// A second instance should focus the existing window rather than start over.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    store.init()
    registerIpc(() => mainWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => killAllSessions())
}
