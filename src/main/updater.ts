import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { IPC, type UpdateState } from '@shared/types'

// electron-updater est CommonJS : on déstructure depuis le default export.
const { autoUpdater } = pkg

let lastState: UpdateState = { status: 'idle' }
let onChange: (() => void) | null = null

export function getUpdateState(): UpdateState {
  return lastState
}

function setState(state: UpdateState): void {
  lastState = state
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.updateState, state)
  }
  onChange?.()
}

/**
 * Initialise la mise à jour automatique (téléchargement auto + installation à la
 * fermeture). Ne s'active que dans l'app packagée — en dev c'est un no-op.
 * @param onStateChange  rappelé à chaque changement d'état (pour rafraîchir le tray).
 */
export function initUpdater(onStateChange?: () => void): void {
  onChange = onStateChange ?? null
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    setState({ status: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => setState({ status: 'idle' }))
  autoUpdater.on('download-progress', (p) =>
    setState({ status: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    setState({ status: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    setState({ status: 'error', error: err == null ? 'inconnue' : String(err.message ?? err) })
  )

  // Vérifie au démarrage (télécharge automatiquement si une MAJ existe).
  autoUpdater.checkForUpdates().catch((err) => {
    setState({ status: 'error', error: String(err) })
  })
}

/** Vérification manuelle (déclenchée par l'UI / le tray). */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    setState({ status: 'idle' })
    return
  }
  autoUpdater.checkForUpdates().catch((err) => {
    setState({ status: 'error', error: String(err) })
  })
}

/** Quitte l'app et installe la mise à jour téléchargée. */
export function quitAndInstall(): void {
  if (lastState.status === 'downloaded') {
    autoUpdater.quitAndInstall()
  }
}
