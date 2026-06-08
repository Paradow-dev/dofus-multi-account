import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppConfig,
  type CycleDirection,
  type RendererApi,
  type ShortcutRegistration
} from '@shared/types'

const api: RendererApi = {
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  setConfig: (config: AppConfig) => ipcRenderer.invoke(IPC.configSet, config),
  listWindows: () => ipcRenderer.invoke(IPC.windowsList),
  focusAccount: (accountId: string) => ipcRenderer.invoke(IPC.actionFocus, accountId),
  cycle: (direction: CycleDirection) => ipcRenderer.invoke(IPC.actionCycle, direction),
  onShortcutsState: (cb: (registrations: ShortcutRegistration[]) => void) => {
    const listener = (_e: unknown, registrations: ShortcutRegistration[]): void =>
      cb(registrations)
    ipcRenderer.on(IPC.shortcutsState, listener)
    return () => ipcRenderer.removeListener(IPC.shortcutsState, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
