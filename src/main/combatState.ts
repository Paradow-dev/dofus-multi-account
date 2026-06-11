import { BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/types'

let inCombat = false
let exitTimer: NodeJS.Timeout | null = null

const AUTO_EXIT_MS = 90_000

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.accountBarCombatState, inCombat)
  }
}

function scheduleAutoExit(): void {
  if (exitTimer) clearTimeout(exitTimer)
  exitTimer = setTimeout(() => exitCombat(true), AUTO_EXIT_MS)
}

export function isInCombat(): boolean {
  return inCombat
}

export function enterCombat(): void {
  inCombat = true
  scheduleAutoExit()
  broadcast()
}

/**
 * Sort du mode combat. `auto` = sortie déclenchée par le timer d'inactivité :
 * un bip système signale la désactivation (sinon facile à manquer).
 */
export function exitCombat(auto = false): void {
  const wasInCombat = inCombat
  inCombat = false
  if (exitTimer) {
    clearTimeout(exitTimer)
    exitTimer = null
  }
  if (auto && wasInCombat) shell.beep()
  broadcast()
}

export function toggleCombat(): void {
  if (inCombat) exitCombat()
  else enterCombat()
}

/** Réinitialise le timer d'auto-sortie (à appeler à chaque fin de tour détectée). */
export function notifyCombatActivity(): void {
  if (inCombat) scheduleAutoExit()
}
