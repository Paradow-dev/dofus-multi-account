import { app, ipcMain } from 'electron'
import { IPC, type AppConfig, type CycleDirection } from '@shared/types'
import { listWindows } from './windowManager'
import { activateAccount, cycle } from './shortcuts'
import {
  applyConfig,
  getConfig,
  setBrowserEnabled,
  persistBrowserTabs
} from './state'
import { checkForUpdates, quitAndInstall } from './updater'
import { resizeOverlayWindow, resetOverlayPosition } from './overlay'
import { focusBrowser } from './browser'

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

  // Mini-navigateur (overlay).
  ipcMain.handle(IPC.browserOpen, () => focusBrowser())
  ipcMain.handle(IPC.browserClose, () => setBrowserEnabled(false))
  ipcMain.handle(IPC.browserConfigGet, () => getConfig().browser)
  ipcMain.on(IPC.browserPersistTabs, (_e, urls: string[]) => persistBrowserTabs(urls))
}
