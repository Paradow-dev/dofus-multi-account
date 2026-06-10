import { BrowserWindow } from 'electron'
import { IPC, type AppConfig, type ShortcutRegistration } from '@shared/types'
import { loadConfig, saveConfig } from './config'
import { registerAll } from './shortcuts'
import { syncTurnFollow } from './turnFollow'
import { syncOverlay } from './overlay'

let currentConfig: AppConfig = loadConfig()
let lastRegistrations: ShortcutRegistration[] = []

export function getConfig(): AppConfig {
  return currentConfig
}

export function getRegistrations(): ShortcutRegistration[] {
  return lastRegistrations
}

/**
 * Persiste la config, ré-enregistre les raccourcis et notifie le renderer.
 * Point d'entrée unique pour toute mutation de configuration.
 */
export function applyConfig(config: AppConfig): {
  config: AppConfig
  shortcuts: ShortcutRegistration[]
} {
  currentConfig = saveConfig(config)
  lastRegistrations = registerAll(currentConfig)
  syncTurnFollow()
  syncOverlay()
  broadcastShortcutsState()
  return { config: currentConfig, shortcuts: lastRegistrations }
}

/** Ré-applique la config courante (au démarrage). */
export function bootstrapShortcuts(): void {
  lastRegistrations = registerAll(currentConfig)
  syncTurnFollow()
  syncOverlay()
}

/**
 * Persiste uniquement la position de l'overlay (déplacement à la souris).
 * N'enregistre pas les raccourcis et ne notifie pas le renderer : opération légère.
 */
export function updateOverlayPosition(x: number, y: number): void {
  currentConfig = saveConfig({
    ...currentConfig,
    overlay: { ...currentConfig.overlay, x, y }
  })
}

function broadcastShortcutsState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.shortcutsState, lastRegistrations)
  }
}
