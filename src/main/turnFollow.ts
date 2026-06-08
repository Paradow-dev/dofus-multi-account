import { startTurnHook, stopTurnHook } from './turnHook'
import { titleForHandle } from './windowManager'
import { activateAccount } from './shortcuts'
import { getConfig } from './state'

let active = false
let lastSwitch = 0

/**
 * Démarre/arrête le hook de flash selon la config courante.
 * Appelé au démarrage et à chaque changement de configuration.
 */
export function syncTurnFollow(): void {
  const cfg = getConfig()
  const want = cfg.enabled && cfg.turnFollow

  if (want && !active) {
    active = startTurnHook(onFlash)
  } else if (!want && active) {
    stopTurnHook()
    active = false
  }
}

/** Quand une fenêtre flashe : la rattacher à un compte et l'activer. */
function onFlash(handle: number): void {
  const cfg = getConfig()
  if (!cfg.enabled || !cfg.turnFollow) return

  const title = titleForHandle(handle).toLowerCase()
  if (!title) return

  const account = cfg.accounts.find(
    (a) => a.matchTitle && title.includes(a.matchTitle.toLowerCase())
  )
  if (!account) return

  // Anti-rebond : évite des bascules en rafale si le flash se répète.
  const now = Date.now()
  if (now - lastSwitch < 300) return
  lastSwitch = now

  activateAccount(cfg, account.id)
}

export function isTurnFollowActive(): boolean {
  return active
}
