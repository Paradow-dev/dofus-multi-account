import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { bootstrapShortcuts } from './state'
import { unregisterAll } from './shortcuts'
import { createTray, destroyTray, rebuildMenu } from './tray'
import { initUpdater } from './updater'
import { stopTurnHook } from './turnHook'
import { destroyOverlay } from './overlay'
import { destroyAccountBar } from './accountBar'
import { destroyBrowser } from './browser'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // En production l'icône de l'exécutable provient d'electron-builder (build/icon.ico).
  // En dev on pointe explicitement le PNG du design system pour la barre des tâches.
  const devIcon = process.env['ELECTRON_RENDERER_URL']
    ? join(__dirname, '../../build/icon.png')
    : undefined

  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#0E1116',
    autoHideMenuBar: true,
    ...(devIcon ? { icon: devIcon } : {}),
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
  stopTurnHook()
  destroyOverlay()
  destroyAccountBar()
  destroyBrowser()
  destroyTray()
})

// On ne quitte pas quand toutes les fenêtres sont fermées : app de tray.
app.on('window-all-closed', () => {
  // no-op : l'app vit dans le tray jusqu'à « Quitter ».
})
