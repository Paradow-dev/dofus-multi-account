import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { bootstrapShortcuts } from './state'
import { unregisterAll } from './shortcuts'
import { createTray, destroyTray, rebuildMenu } from './tray'
import { initUpdater } from './updater'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#0E1116',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Liens externes -> navigateur système
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Fermer = réduire dans le tray (l'app reste active en arrière-plan)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let isQuitting = false

app.whenReady().then(() => {
  registerIpc()
  bootstrapShortcuts()
  createWindow()
  createTray(() => mainWindow)
  // Mise à jour auto (no-op en dev) ; rafraîchit le menu du tray à chaque état.
  initUpdater(() => rebuildMenu(() => mainWindow))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  unregisterAll()
  destroyTray()
})

// On ne quitte pas quand toutes les fenêtres sont fermées : app de tray.
app.on('window-all-closed', () => {
  // no-op : l'app vit dans le tray jusqu'à « Quitter ».
})
