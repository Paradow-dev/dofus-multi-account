import { BrowserWindow } from 'electron'
import { IPC, type AppConfig, type ShortcutRegistration } from '@shared/types'
import { loadConfig, saveConfig } from './config'
import { registerAll } from './shortcuts'
import { syncTurnFollow } from './turnFollow'

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
  broadcastShortcutsState()
  return { config: currentConfig, shortcuts: lastRegistrations }
}

/** Ré-applique la config courante (au démarrage). */
export function bootstrapShortcuts(): void {
  lastRegistrations = registerAll(currentConfig)
  syncTurnFollow()
}

function broadcastShortcutsState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.shortcutsState, lastRegistrations)
  }
}
