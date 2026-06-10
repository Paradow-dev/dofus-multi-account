import { BrowserWindow } from 'electron'
import { IPC, type AppConfig, type BrowserConfig, type ShortcutRegistration } from '@shared/types'
import { loadConfig, saveConfig } from './config'
import { registerAll } from './shortcuts'
import { syncTurnFollow } from './turnFollow'
import { syncOverlay } from './overlay'
import { syncBrowser } from './browser'

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
  syncBrowser()
  broadcastShortcutsState()
  return { config: currentConfig, shortcuts: lastRegistrations }
}

/** Ré-applique la config courante (au démarrage). */
export function bootstrapShortcuts(): void {
  lastRegistrations = registerAll(currentConfig)
  syncTurnFollow()
  syncOverlay()
  syncBrowser()
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

/** Oublie la position persistée de l'overlay (retour au placement par défaut). */
export function clearOverlayPosition(): void {
  const { x: _x, y: _y, ...rest } = currentConfig.overlay
  currentConfig = saveConfig({ ...currentConfig, overlay: rest })
}

function broadcastShortcutsState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.shortcutsState, lastRegistrations)
  }
}

/* ---------- Navigateur (overlay) ---------- */

/** Diffuse les réglages courants du navigateur à toutes les fenêtres. */
function broadcastBrowserState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.browserState, currentConfig.browser)
  }
}

/**
 * Mute un ou plusieurs réglages « visibles » du navigateur (enabled, épinglage,
 * opacité, URL d'accueil) puis synchronise la fenêtre et notifie l'UI.
 */
export function updateBrowserConfig(patch: Partial<BrowserConfig>): BrowserConfig {
  currentConfig = saveConfig({ ...currentConfig, browser: { ...currentConfig.browser, ...patch } })
  syncBrowser()
  broadcastBrowserState()
  return currentConfig.browser
}

/** Active/désactive le navigateur (ouvre ou ferme la fenêtre). */
export function setBrowserEnabled(enabled: boolean): void {
  updateBrowserConfig({ enabled })
}

/**
 * Persiste la géométrie de la fenêtre navigateur (déplacement / redimensionnement).
 * Opération légère : pas de re-sync ni de notification UI.
 */
export function persistBrowserBounds(x: number, y: number, width: number, height: number): void {
  currentConfig = saveConfig({
    ...currentConfig,
    browser: { ...currentConfig.browser, x, y, width, height }
  })
}

/** Mémorise la dernière URL visitée (opération légère, sans notification). */
export function persistBrowserUrl(url: string): void {
  currentConfig = saveConfig({
    ...currentConfig,
    browser: { ...currentConfig.browser, lastUrl: url }
  })
}
