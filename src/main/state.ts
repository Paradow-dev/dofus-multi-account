import { BrowserWindow } from 'electron'
import {
  IPC,
  type AppConfig,
  type BrowserConfig,
  type Favorite,
  type ShortcutRegistration
} from '@shared/types'
import { loadConfig, saveConfig } from './config'
import { registerAll } from './shortcuts'
import { syncOverlay } from './overlay'
import { syncAccountBar } from './accountBar'
import { syncBrowser } from './browser'
import { syncCombatDetect } from './combatDetect'
import { syncMacroBar } from './macroBar'

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
  syncOverlay()
  syncAccountBar()
  syncBrowser()
  syncCombatDetect()
  syncMacroBar()
  broadcastShortcutsState()
  return { config: currentConfig, shortcuts: lastRegistrations }
}

/** Ré-applique la config courante (au démarrage). */
export function bootstrapShortcuts(): void {
  lastRegistrations = registerAll(currentConfig)
  syncOverlay()
  syncAccountBar()
  syncBrowser()
  syncCombatDetect()
  syncMacroBar()
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

/** Persiste la position de la barre de comptes (déplacement à la souris). */
export function updateAccountBarPosition(x: number, y: number): void {
  currentConfig = saveConfig({
    ...currentConfig,
    accountBar: { ...currentConfig.accountBar, x, y }
  })
}

/** Oublie la position persistée de la barre de comptes (re-centre). */
export function clearAccountBarPosition(): void {
  const { x: _x, y: _y, ...rest } = currentConfig.accountBar
  currentConfig = saveConfig({ ...currentConfig, accountBar: rest })
}

/** Persiste la position du panneau macro (déplacement à la souris). */
export function updateMacroBarPosition(x: number, y: number): void {
  currentConfig = saveConfig({
    ...currentConfig,
    quickMacro: { ...currentConfig.quickMacro, x, y }
  })
}

/** Oublie la position persistée du panneau macro (re-centre en bas). */
export function clearMacroBarPosition(): void {
  const { x: _x, y: _y, ...rest } = currentConfig.quickMacro
  currentConfig = saveConfig({ ...currentConfig, quickMacro: rest })
}

/** Diffuse un message à toutes les fenêtres (fenêtres détruites ignorées). */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* ignore — fenêtre en cours de destruction */
    }
  }
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

/** Mémorise les URLs des onglets ouverts (opération légère, sans notification). */
export function persistBrowserTabs(urls: string[]): void {
  currentConfig = saveConfig({
    ...currentConfig,
    browser: { ...currentConfig.browser, tabs: urls }
  })
}

/** Mémorise la liste des sites favoris (opération légère, sans notification). */
export function persistBrowserFavorites(favorites: Favorite[]): void {
  currentConfig = saveConfig({
    ...currentConfig,
    browser: { ...currentConfig.browser, favorites }
  })
}
