import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppConfig,
  type BrowserConfig,
  type CycleDirection,
  type RendererApi,
  type ShortcutRegistration,
  type UpdateState
} from '@shared/types'

const api: RendererApi = {
  getVersion: () => ipcRenderer.invoke(IPC.appVersion),
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  setConfig: (config: AppConfig) => ipcRenderer.invoke(IPC.configSet, config),
  listWindows: (includeAll = false) => ipcRenderer.invoke(IPC.windowsList, includeAll),
  focusAccount: (accountId: string) => ipcRenderer.invoke(IPC.actionFocus, accountId),
  cycle: (direction: CycleDirection) => ipcRenderer.invoke(IPC.actionCycle, direction),
  onShortcutsState: (cb: (registrations: ShortcutRegistration[]) => void) => {
    const listener = (_e: unknown, registrations: ShortcutRegistration[]): void =>
      cb(registrations)
    ipcRenderer.on(IPC.shortcutsState, listener)
    return () => ipcRenderer.removeListener(IPC.shortcutsState, listener)
  },
  checkUpdate: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateState: (cb: (state: UpdateState) => void) => {
    const listener = (_e: unknown, s: UpdateState): void => cb(s)
    ipcRenderer.on(IPC.updateState, listener)
    return () => ipcRenderer.removeListener(IPC.updateState, listener)
  },
  onOverlayCharacter: (cb: (name: string) => void) => {
    const listener = (_e: unknown, name: string): void => cb(name)
    ipcRenderer.on(IPC.overlayCharacter, listener)
    return () => ipcRenderer.removeListener(IPC.overlayCharacter, listener)
  },
  resizeOverlay: (width: number, height: number) =>
    ipcRenderer.send(IPC.overlayResize, width, height),
  resetOverlayPosition: () => ipcRenderer.invoke(IPC.overlayResetPosition),
  openBrowser: () => ipcRenderer.invoke(IPC.browserOpen),
  closeBrowser: () => ipcRenderer.invoke(IPC.browserClose),
  getBrowserConfig: () => ipcRenderer.invoke(IPC.browserConfigGet),
  setBrowserAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke(IPC.browserSetAlwaysOnTop, value),
  setBrowserOpacity: (value: number) => ipcRenderer.send(IPC.browserSetOpacity, value),
  persistBrowserUrl: (url: string) => ipcRenderer.send(IPC.browserPersistUrl, url),
  onBrowserState: (cb: (config: BrowserConfig) => void) => {
    const listener = (_e: unknown, config: BrowserConfig): void => cb(config)
    ipcRenderer.on(IPC.browserState, listener)
    return () => ipcRenderer.removeListener(IPC.browserState, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
