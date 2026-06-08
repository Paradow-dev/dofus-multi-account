import { globalShortcut } from 'electron'
import type {
  AppConfig,
  AccountConfig,
  CycleDirection,
  ShortcutRegistration
} from '@shared/types'
import { focusAccount, applyGridLayout } from './windowManager'

/** Index courant dans l'ordre de cycle (référence le compte focalisé en dernier). */
let currentIndex = 0

function orderedAccounts(config: AppConfig): AccountConfig[] {
  return [...config.accounts].sort((a, b) => a.order - b.order)
}

/** Focalise un compte (en appliquant la disposition) puis, si mode grid, range tout. */
function focusWithLayout(config: AppConfig, account: AccountConfig): boolean {
  const ok = focusAccount(account, config.layoutMode)
  if (ok && config.layoutMode === 'grid') {
    applyGridLayout(config.accounts)
    focusAccount(account, 'none') // re-met le compte choisi au premier plan
  }
  return ok
}

/** Focalise un compte par id et applique la disposition. */
export function activateAccount(config: AppConfig, accountId: string): boolean {
  const accounts = orderedAccounts(config)
  const idx = accounts.findIndex((a) => a.id === accountId)
  if (idx === -1) return false
  if (focusWithLayout(config, accounts[idx])) {
    currentIndex = idx
    return true
  }
  return false
}

/** Passe au compte suivant/précédent dans l'ordre de cycle. */
export function cycle(config: AppConfig, direction: CycleDirection): boolean {
  const accounts = orderedAccounts(config)
  if (accounts.length === 0) return false

  const step = direction === 'next' ? 1 : -1
  // On part de l'index courant et on cherche la prochaine fenêtre focalisable.
  for (let i = 1; i <= accounts.length; i++) {
    const idx = (currentIndex + step * i + accounts.length * i) % accounts.length
    if (focusWithLayout(config, accounts[idx])) {
      currentIndex = idx
      return true
    }
  }
  return false
}

/** Réorganise toutes les fenêtres en mosaïque (action manuelle). */
export function arrangeGrid(config: AppConfig): void {
  applyGridLayout(config.accounts)
}

/**
 * Enregistre tous les raccourcis globaux pour la config donnée.
 * Désenregistre d'abord les anciens. Retourne l'état de chaque enregistrement
 * (pour signaler les conflits à l'UI).
 */
export function registerAll(config: AppConfig): ShortcutRegistration[] {
  globalShortcut.unregisterAll()
  const registrations: ShortcutRegistration[] = []

  if (!config.enabled) return registrations

  const tryRegister = (accelerator: string, label: string, action: () => void): void => {
    if (!accelerator) return
    let ok = false
    try {
      ok = globalShortcut.register(accelerator, action)
    } catch (err) {
      console.warn(`[shortcuts] échec d'enregistrement ${accelerator} :`, err)
      ok = false
    }
    registrations.push({ accelerator, label, ok })
  }

  tryRegister(config.cycleNext, 'Cycle suivant', () => cycle(config, 'next'))
  tryRegister(config.cyclePrev, 'Cycle précédent', () => cycle(config, 'prev'))

  for (const account of config.accounts) {
    if (account.shortcut) {
      tryRegister(account.shortcut, `Compte : ${account.label}`, () =>
        activateAccount(config, account.id)
      )
    }
  }

  return registrations
}

/** Libère tous les raccourcis (à appeler avant de quitter). */
export function unregisterAll(): void {
  globalShortcut.unregisterAll()
}
