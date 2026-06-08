import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { getConfig, applyConfig } from './state'
import { arrangeGrid } from './shortcuts'

// Icône ember 32×32 embarquée (évite tout asset binaire externe).
const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANUlEQVR42u3TMQ0AAAgDQVyy4N8GmCCB4Zr8fkujK/uyAAAAAAAAAAAAAPgP2BgAgBsCfAYMBpIyjU3ayhcAAAAASUVORK5CYII='

let tray: Tray | null = null

export function createTray(getWindow: () => BrowserWindow | null): void {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG}`)
  try {
    tray = new Tray(icon)
  } catch (err) {
    console.warn('[tray] création impossible :', err)
    return
  }

  tray.setToolTip('Dofus Multi-Account')
  rebuildMenu(getWindow)

  tray.on('click', () => showWindow(getWindow))
}

/** Reconstruit le menu (reflète l'état activé/désactivé courant). */
export function rebuildMenu(getWindow: () => BrowserWindow | null): void {
  if (!tray) return
  const config = getConfig()

  const menu = Menu.buildFromTemplate([
    { label: 'Ouvrir la configuration', click: () => showWindow(getWindow) },
    { type: 'separator' },
    {
      label: 'Raccourcis activés',
      type: 'checkbox',
      checked: config.enabled,
      click: () => {
        applyConfig({ ...getConfig(), enabled: !getConfig().enabled })
        rebuildMenu(getWindow)
      }
    },
    {
      label: 'Réorganiser les fenêtres (mosaïque)',
      click: () => arrangeGrid(getConfig())
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
}

function showWindow(getWindow: () => BrowserWindow | null): void {
  const win = getWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
