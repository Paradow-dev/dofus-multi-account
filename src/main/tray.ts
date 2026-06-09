import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { getConfig, applyConfig } from './state'
import { arrangeGrid } from './shortcuts'
import { checkForUpdates, quitAndInstall, getUpdateState } from './updater'

// Marque « Midnight Ember » 32×32 (chevron clair + curseur rouge, fond transparent),
// rasterisée depuis le SVG du design system via scripts/gen-icons.mjs.
// Embarquée en base64 pour éviter tout asset externe au runtime.
const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAi0lEQVR42u2VsQ2AMAwEGSEjMEJGYAS6NCkYgRHYgBEYhREYgd4NsuTeKJJTU8EL8Elf+2Q7TtM4juO8CWEKaIHVElACszCpMO3CFFESvTAdJjKgJKIwbSaxQEZSilpxNZkW1Y3RJEr6/whARwBdQugzvDpEmlOnOWnN46dYc2o1p6nme5+R4zjOHZzhmsI8DWtx+gAAAABJRU5ErkJggg=='

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
      label: 'Suivi de tour automatique',
      type: 'checkbox',
      checked: config.turnFollow,
      click: () => {
        applyConfig({ ...getConfig(), turnFollow: !getConfig().turnFollow })
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
