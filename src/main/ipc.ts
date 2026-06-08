import { ipcMain } from 'electron'
import { IPC, type AppConfig, type CycleDirection } from '@shared/types'
import { listWindows } from './windowManager'
import { activateAccount, cycle } from './shortcuts'
import { applyConfig, getConfig } from './state'

/** Enregistre tous les handlers IPC. À appeler une fois au démarrage. */
export function registerIpc(): void {
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
}
