import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { getConfig, applyConfig } from './state'
import { focusBrowser } from './browser'
import { arrangeGrid } from './shortcuts'
import { checkForUpdates, quitAndInstall, getUpdateState } from './updater'

// Logo « jetons de comptes » 32×32 (pastilles superposées, jeton actif rouge,
// fond transparent), rasterisé via scripts/gen-icons.mjs.
// Embarqué en base64 pour éviter tout asset externe au runtime.
const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACNElEQVR42u1VTU8TURTlJ7B0gUn9aAxizbQYsJVCSwsTWqYtSPNa+hIHK2a0wbQSkEAINRibuJloYkyqaXeNG8MPcK/s2LFTdi4h/oJj7gtv0lIWdmRj8k5ykpk3i3PuuffO6+tTUFBQUPgLcNPycNMqc9OyuWlVK2vbZr3RKtcbrSrx8/uPZXBmgrMqOLPBGb17LkrcTqYZfP4gvIManj5bx9ZODbNzeYxFE3jLFvFjMYf1cAyF0QkYd8KwQlHsZ9IgM/8q3gyMhHFp4Jrg0vIKFnJLuHx1SPD53TF8SSRxfWj0XJIpcNZ0K26Gxqcd8WA4jtUXVUc8OOgXVbYLyurbz97FdTJh9myAFYoHA54bjoHK2jZ8gZBj4FMsLiKXQvQMzgRJVJ4HbgdxnMse9GyA+i7FiZs7NUec+D01e17cgmfbQkn1Gn+/npzvMLDVZcDo6vnh/Tn8zmcx4b/Xcf7VMMhYv+sEaPp3a7YjTq34uVzsiJnEZQJkgubBdQKnKexd8d4SBigNMkBrRwZK5Q18e7krYieBV5EpR1ySqqZvlAY423NjICLbMBKKYnLacOaA/gEP+SMczmdE9TT5NHjtJFNt8Udcr2JMT0Fuw4yxIFbRe3NYGNF9w9hPp7p6LttCw+hqBc+YyLBC8Wh8MiGSKDx4jDf2B9EGbj7B61IFv1ZKQkxW3tRncJLPHoGzzEXeBxqZodbQ3VBvtLR6oxU5pUb/foqaRMGZpm5QBQWF/wZ/ALXFtuvZPsUOAAAAAElFTkSuQmCC'

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
    {
      label: 'Ouvrir le navigateur (guides)',
      click: () => focusBrowser()
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
