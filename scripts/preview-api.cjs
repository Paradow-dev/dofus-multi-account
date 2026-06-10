// Preload de prévisualisation : fournit un window.api mocké pour rendre l'UI
// réelle (renderer compilé) hors contexte Electron complet. NON embarqué dans l'app.
const config = {
  accounts: [
    { id: '1', label: 'Lyssaen - Sacrieur', matchTitle: 'Lyssaen', order: 0, shortcut: 'Ctrl+Alt+1' },
    { id: '2', label: 'Iop-Du-Krosmoz', matchTitle: 'Iop', order: 1, shortcut: 'Ctrl+Alt+2' },
    { id: '3', label: 'Eniripsa-Soin', matchTitle: 'Eniripsa', order: 2, shortcut: 'MouseWheelUp' }
  ],
  cycleNext: 'Ctrl+Alt+Right',
  cyclePrev: 'Ctrl+Alt+Left',
  layoutMode: 'maximize-active',
  enabled: true,
  turnFollow: false,
  overlay: { enabled: true, opacity: 0.9 }
}

const windows = [
  {
    handle: 1,
    title: 'Lyssaen - Sacrieur - 3.5.1.x - Release',
    exePath: 'C:/Ankama/Dofus/Dofus.exe',
    isGame: true,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    accountId: '1'
  },
  {
    handle: 2,
    title: 'Iop-Du-Krosmoz - 3.5.1.x - Release',
    exePath: 'C:/Ankama/Dofus/Dofus.exe',
    isGame: true,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    accountId: '2'
  }
]

window.api = {
  getVersion: async () => '0.6.1',
  getConfig: async () => config,
  setConfig: async (c) => ({ config: c, shortcuts: [] }),
  listWindows: async () => windows,
  focusAccount: async () => true,
  cycle: async () => true,
  onShortcutsState: () => () => {},
  checkUpdate: async () => {},
  installUpdate: async () => {},
  onUpdateState: () => () => {},
  onOverlayCharacter: () => () => {},
  resizeOverlay: () => {},
  resetOverlayPosition: async () => {}
}
