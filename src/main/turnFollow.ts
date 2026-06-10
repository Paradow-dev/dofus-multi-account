import { startTurnHook, stopTurnHook } from './turnHook'
import { titleForHandle } from './windowManager'
import { activateAccount } from './shortcuts'
import { setTurnAccount } from './accountBar'
import { getConfig } from './state'

let active = false
let lastSwitch = 0

/**
 * Démarre/arrête le hook de flash selon la config courante.
 * Le hook sert à deux fonctionnalités : le suivi de tour automatique ET le
 * pulse « c'est son tour » de la barre de comptes. On le lance dès que l'une
 * des deux est active. Appelé au démarrage et à chaque changement de config.
 */
export function syncTurnFollow(): void {
  const cfg = getConfig()
  const want = cfg.enabled && (cfg.turnFollow || cfg.accountBar.enabled)

  if (want && !active) {
    active = startTurnHook(onFlash)
  } else if (!want && active) {
    stopTurnHook()
    active = false
  }
}

/**
 * Quand une fenêtre flashe : la rattacher à un compte, signaler son tour à la
 * barre de comptes (pulse), et — si le suivi de tour est actif — l'activer.
 */
function onFlash(handle: number): void {
  const cfg = getConfig()
  if (!cfg.enabled) return

  const title = titleForHandle(handle).toLowerCase()
  if (!title) return

  const account = cfg.accounts.find(
    (a) => a.matchTitle && title.includes(a.matchTitle.toLowerCase())
  )
  if (!account) return

  // Toujours : indique le tour dans la barre de comptes (si affichée).
  setTurnAccount(account.id)

  if (!cfg.turnFollow) return

  // Anti-rebond : évite des bascules en rafale si le flash se répète.
  const now = Date.now()
  if (now - lastSwitch < 300) return
  lastSwitch = now

  activateAccount(cfg, account.id)
}

export function isTurnFollowActive(): boolean {
  return active
}
