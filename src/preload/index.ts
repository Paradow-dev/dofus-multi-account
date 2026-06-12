import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AccountBarItem,
  type AppConfig,
  type BrowserConfig,
  type CombatZone,
  type CycleDirection,
  type Favorite,
  type QuickMacroAction,
  type QuickMacroState,
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
  persistBrowserTabs: (urls: string[]) => ipcRenderer.send(IPC.browserPersistTabs, urls),
  persistBrowserFavorites: (favorites: Favorite[]) =>
    ipcRenderer.send(IPC.browserPersistFavorites, favorites),
  onBrowserState: (cb: (config: BrowserConfig) => void) => {
    const listener = (_e: unknown, config: BrowserConfig): void => cb(config)
    ipcRenderer.on(IPC.browserState, listener)
    return () => ipcRenderer.removeListener(IPC.browserState, listener)
  },
  onBrowserOpenTab: (cb: (tab: { url: string; active: boolean }) => void) => {
    const listener = (_e: unknown, tab: { url: string; active: boolean }): void => cb(tab)
    ipcRenderer.on(IPC.browserOpenTab, listener)
    return () => ipcRenderer.removeListener(IPC.browserOpenTab, listener)
  },
  onBrowserZoom: (cb: (z: { wcId: number; factor: number }) => void) => {
    const listener = (_e: unknown, z: { wcId: number; factor: number }): void => cb(z)
    ipcRenderer.on(IPC.browserZoomSync, listener)
    return () => ipcRenderer.removeListener(IPC.browserZoomSync, listener)
  },
  onAccountBarData: (cb: (items: AccountBarItem[]) => void) => {
    const listener = (_e: unknown, items: AccountBarItem[]): void => cb(items)
    ipcRenderer.on(IPC.accountBarData, listener)
    return () => ipcRenderer.removeListener(IPC.accountBarData, listener)
  },
  resizeAccountBar: (width: number, height: number) =>
    ipcRenderer.send(IPC.accountBarResize, width, height),
  resetAccountBarPosition: () => ipcRenderer.invoke(IPC.accountBarResetPosition),
  toggleCombat: () => ipcRenderer.send(IPC.accountBarCombatToggle),
  onCombatState: (cb: (inCombat: boolean) => void) => {
    const listener = (_e: unknown, inCombat: boolean): void => cb(inCombat)
    ipcRenderer.on(IPC.accountBarCombatState, listener)
    return () => ipcRenderer.removeListener(IPC.accountBarCombatState, listener)
  },
  pickCombatZone: () => ipcRenderer.invoke(IPC.combatZonePick),
  sendZonePicked: (zone: CombatZone | null) => ipcRenderer.send(IPC.combatZonePicked, zone),
  previewCombatZone: () => ipcRenderer.invoke(IPC.combatZonePreview),
  onQuickMacroState: (cb: (state: QuickMacroState) => void) => {
    const listener = (_e: unknown, s: QuickMacroState): void => cb(s)
    ipcRenderer.on(IPC.macroState, listener)
    return () => ipcRenderer.removeListener(IPC.macroState, listener)
  },
  macroAction: (action: QuickMacroAction) => ipcRenderer.send(IPC.macroAction, action),
  resizeMacroBar: (width: number, height: number) =>
    ipcRenderer.send(IPC.macroBarResize, width, height),
  resetMacroBarPosition: () => ipcRenderer.invoke(IPC.macroBarResetPosition)
}

contextBridge.exposeInMainWorld('api', api)
