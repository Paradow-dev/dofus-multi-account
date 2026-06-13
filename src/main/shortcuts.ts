import { globalShortcut } from 'electron'
import type {
  AppConfig,
  AccountConfig,
  CycleDirection,
  ShortcutRegistration
} from '@shared/types'
import { focusAccount, applyGridLayout, applySplitLayout, snapWindowByTitle } from './windowManager'
import { setActiveCharacter } from './overlay'
import { setActiveAccount } from './accountBar'
import { snapBrowserTo } from './browser'
import { getConfig, applyConfig } from './state'
import { toggleCombat } from './combatState'
import { toggleQuickMacro } from './quickMacro'
import {
  isMouseAccelerator,
  parseMouseAccelerator,
  setMouseBindings,
  type MouseBinding
} from './mouseHook'

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
  // Met à jour les overlays avec le compte qui vient d'être activé.
  if (ok) {
    setActiveCharacter(account.label)
    setActiveAccount(account.id)
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

/**
 * Agence les fenêtres en « côte à côte » : empile les fenêtres de jeu dans la
 * grande zone, puis remplit la zone secondaire selon le contenu configuré
 * (navigateur intégré, fenêtre externe par titre, ou rien). Le compte courant est
 * remis au premier plan dans la zone de jeu.
 */
function arrangeSplit(config: AppConfig): void {
  const side = applySplitLayout(config.accounts, config.split)
  const s = config.split
  if (s.sideContent === 'browser') {
    snapBrowserTo(side)
  } else if (s.sideContent === 'window' && s.sideMatchTitle) {
    snapWindowByTitle(s.sideMatchTitle, side)
  }
  const accounts = orderedAccounts(config)
  const current = accounts[currentIndex]
  if (current) focusAccount(current, 'none')
}

/**
 * (Ré)organise les fenêtres selon la disposition courante (action manuelle :
 * bouton « Organiser », raccourci ou menu de la zone de notification).
 * En mode « côte à côte » : agence jeu + zone secondaire. Sinon : mosaïque.
 */
export function arrangeLayout(config: AppConfig): void {
  if (config.layoutMode === 'split') arrangeSplit(config)
  else applyGridLayout(config.accounts)
}

/**
 * Enregistre tous les raccourcis globaux pour la config donnée.
 * Désenregistre d'abord les anciens. Retourne l'état de chaque enregistrement
 * (pour signaler les conflits à l'UI).
 */
export function registerAll(config: AppConfig): ShortcutRegistration[] {
  globalShortcut.unregisterAll()
  const registrations: ShortcutRegistration[] = []
  const mouseBindings: MouseBinding[] = []

  if (!config.enabled) {
    setMouseBindings([])
    return registrations
  }

  // Les raccourcis souris ne passent pas par globalShortcut (clavier seulement) :
  // on les confie au hook souris natif. Le hook est démarré une fois la liste prête.
  const tryRegister = (accelerator: string, label: string, action: () => void): void => {
    if (!accelerator) return

    if (isMouseAccelerator(accelerator)) {
      const parsed = parseMouseAccelerator(accelerator)
      const ok = parsed !== null
      if (parsed) mouseBindings.push({ ...parsed, action })
      registrations.push({ accelerator, label, ok })
      return
    }

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

  // Bascule l'affichage de chaque overlay (lit la config courante au déclenchement,
  // puis applique : (re)enregistre les raccourcis et synchronise les fenêtres).
  // `applyConfig` ré-enregistre les raccourcis globaux (unregisterAll + register) :
  // le faire de façon synchrone depuis le callback d'un raccourci global fait
  // planter Electron. On diffère donc l'application hors de la pile du callback.
  tryRegister(config.overlayToggle ?? '', 'Overlay : nom du personnage', () => {
    setImmediate(() => {
      const c = getConfig()
      applyConfig({ ...c, overlay: { ...c.overlay, enabled: !c.overlay.enabled } })
    })
  })
  tryRegister(config.browserToggle ?? '', 'Overlay : navigateur', () => {
    setImmediate(() => {
      const c = getConfig()
      applyConfig({ ...c, browser: { ...c.browser, enabled: !c.browser.enabled } })
    })
  })
  tryRegister(config.accountBarToggle ?? '', 'Overlay : barre de comptes', () => {
    setImmediate(() => {
      const c = getConfig()
      applyConfig({ ...c, accountBar: { ...c.accountBar, enabled: !c.accountBar.enabled } })
    })
  })
  tryRegister(config.combatToggle ?? '', 'Mode combat', () => {
    setImmediate(() => toggleCombat())
  })
  // Macro rapide : démarre/arrête l'enregistrement. Accélérateur vide quand la
  // fonctionnalité est désactivée (tryRegister ignore les vides), pour suivre
  // la même convention que les autres entrées optionnelles ci-dessus.
  tryRegister(config.quickMacro?.enabled ? config.quickMacro.shortcut : '', 'Macro rapide', () => {
    setImmediate(() => toggleQuickMacro())
  })
  // (Ré)organise les fenêtres selon la disposition courante. Différé hors de la
  // pile du callback : `arrangeSplit` peut activer le navigateur (applyConfig).
  tryRegister(config.arrangeShortcut ?? '', 'Organiser les fenêtres', () => {
    setImmediate(() => arrangeLayout(getConfig()))
  })

  // Active (ou arrête) le hook souris selon les raccourcis souris configurés.
  const mouseHookOk = setMouseBindings(mouseBindings)
  if (!mouseHookOk) {
    // Le hook n'a pas pu démarrer : marque les raccourcis souris en échec pour l'UI.
    for (const reg of registrations) {
      if (isMouseAccelerator(reg.accelerator)) reg.ok = false
    }
  }

  return registrations
}

/** Libère tous les raccourcis (à appeler avant de quitter). */
export function unregisterAll(): void {
  globalShortcut.unregisterAll()
  setMouseBindings([])
}
