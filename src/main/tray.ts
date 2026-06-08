import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { getConfig, applyConfig } from './state'
import { arrangeGrid } from './shortcuts'
import { checkForUpdates, quitAndInstall, getUpdateState } from './updater'

// Marque Paradow 32×32 (chevron blanc + curseur rouge, fond transparent),
// rasterisée depuis le SVG du design system. Embarquée pour éviter tout asset externe.
const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAxUlEQVR42mNgGAWjYDCDLx9fBQPxayhOHggHgCz+j4Q3A7HwQDrgP1TMn55R8BmLI0B4PhBz08MR8kB8GIcj7gOxPT0cwQzExUD8G4sjQGLdQMxOD4foA/F5HKEBEtenhyPYoT7GFRqgkGKmh0PsoWkAW2iA0ow8PRzBDc0N2BwByj3B9Mqu/rjKjOHtgAGNggFLhAOaDQesIBrQonhAKyNKquP/MeH/cWG6NEho5QCim2TUcgDZjVKgRfW48GhzfxQMKgAA6uDET/O/LFYAAAAASUVORK5CYII='

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
  const update = getUpdateState()

  // Élément de mise à jour contextuel selon l'état.
  const updateItem =
    update.status === 'downloaded'
      ? { label: `Redémarrer pour installer la v${update.version}`, click: () => quitAndInstall() }
      : update.status === 'downloading'
        ? { label: `Téléchargement de la mise à jour… ${update.percent ?? 0}%`, enabled: false }
        : update.status === 'checking'
          ? { label: 'Recherche de mise à jour…', enabled: false }
          : { label: 'Vérifier les mises à jour', click: () => checkForUpdates() }

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
    updateItem,
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
