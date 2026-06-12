import { app, ipcMain } from 'electron'
import {
  IPC,
  type AppConfig,
  type CycleDirection,
  type Favorite,
  type QuickMacroAction
} from '@shared/types'
import { toggleCombat } from './combatState'
import { listWindows } from './windowManager'
import { activateAccount, cycle } from './shortcuts'
import {
  applyConfig,
  getConfig,
  setBrowserEnabled,
  persistBrowserTabs,
  persistBrowserFavorites
} from './state'
import { checkForUpdates, quitAndInstall } from './updater'
import { resizeOverlayWindow, resetOverlayPosition } from './overlay'
import { resizeAccountBarWindow, resetAccountBarPosition } from './accountBar'
import { resizeMacroBarWindow, resetMacroBarPosition } from './macroBar'
import { handleQuickMacroAction } from './quickMacro'
import { focusBrowser } from './browser'
import { pickZone } from './zonePicker'
import { calibrateZone, previewZone } from './combatDetect'

/** Enregistre tous les handlers IPC. À appeler une fois au démarrage. */
export function registerIpc(): void {
  ipcMain.handle(IPC.appVersion, () => app.getVersion())

  ipcMain.handle(IPC.configGet, () => getConfig())

  ipcMain.handle(IPC.configSet, (_e, config: AppConfig) => applyConfig(config))

  ipcMain.handle(IPC.windowsList, (_e, includeAll: boolean) =>
    listWindows(getConfig().accounts, includeAll)
  )

  ipcMain.handle(IPC.actionFocus, (_e, accountId: string) =>
    activateAccount(getConfig(), accountId)
  )

  ipcMain.handle(IPC.actionCycle, (_e, direction: CycleDirection) =>
    cycle(getConfig(), direction)
  )

  ipcMain.handle(IPC.updateCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updateInstall, () => quitAndInstall())

  ipcMain.on(IPC.overlayResize, (_e, width: number, height: number) =>
    resizeOverlayWindow(width, height)
  )
  ipcMain.handle(IPC.overlayResetPosition, () => resetOverlayPosition())

  // Barre de comptes (overlay).
  ipcMain.on(IPC.accountBarResize, (_e, width: number, height: number) =>
    resizeAccountBarWindow(width, height)
  )
  ipcMain.handle(IPC.accountBarResetPosition, () => resetAccountBarPosition())

  // Mini-navigateur (overlay).
  ipcMain.handle(IPC.browserOpen, () => focusBrowser())
  ipcMain.handle(IPC.browserClose, () => setBrowserEnabled(false))
  ipcMain.handle(IPC.browserConfigGet, () => getConfig().browser)
  ipcMain.on(IPC.browserPersistTabs, (_e, urls: string[]) => persistBrowserTabs(urls))
  ipcMain.on(IPC.browserPersistFavorites, (_e, favorites: Favorite[]) =>
    persistBrowserFavorites(favorites)
  )

  ipcMain.on(IPC.accountBarCombatToggle, () => toggleCombat())

  // Macro rapide (panneau flottant).
  ipcMain.on(IPC.macroAction, (_e, action: QuickMacroAction) => handleQuickMacroAction(action))
  // invoke (et non send) : le renderer attend que la fenêtre soit agrandie
  // avant de révéler le nouveau contenu (sinon il déborde de l'ancien cadre).
  ipcMain.handle(IPC.macroBarResize, (_e, width: number, height: number) =>
    resizeMacroBarWindow(width, height)
  )
  ipcMain.handle(IPC.macroBarResetPosition, () => resetMacroBarPosition())

  // Sélection de la zone du bouton fin de tour (détection automatique du combat).
  // Calibre la signature de référence immédiatement après la sélection : à faire
  // pendant un combat, bouton visible. Retourne la config mise à jour (ou null).
  ipcMain.handle(IPC.combatZonePick, async () => {
    const zone = await pickZone()
    if (!zone) return null
    // Laisse le temps à l'overlay de sélection de disparaître avant la capture.
    await new Promise((r) => setTimeout(r, 300))
    const signature = await calibrateZone(zone)
    if (!signature) return null
    const cfg = getConfig()
    const { config } = applyConfig({
      ...cfg,
      combat: { ...cfg.combat, detectZone: zone, detectSignature: signature }
    })
    return config
  })

  // Aperçu de la zone de détection (capture courante + distance à la référence).
  ipcMain.handle(IPC.combatZonePreview, () => previewZone())
}
