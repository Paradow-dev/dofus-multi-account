import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC, type AccountBarItem } from '@shared/types'
import { getConfig, updateAccountBarPosition, clearAccountBarPosition } from './state'
import { listWindows } from './windowManager'
import { updateDofusHandles } from './keyboardHook'

/**
 * Overlay « barre de comptes » : fenêtre sans cadre, transparente, always-on-top,
 * listant tous les comptes (jeton + nom). Le compte actif est mis en avant ;
 * un clic sur un compte met sa fenêtre au premier plan (via window.api.focusAccount).
 *
 * Complémentaire de l'overlay « personnage courant » (overlay.ts), qui reste
 * disponible indépendamment.
 */

const INIT_W = 360
const INIT_H = 64
const MIN_W = 80
const MAX_W = 1600

let win: BrowserWindow | null = null
/** Id du dernier compte activé (mis en avant dans la barre). */
let activeAccountId = ''
let moveTimer: NodeJS.Timeout | null = null
/** Rafraîchit l'état « détecté » périodiquement (lancements/fermetures de jeu). */
let refreshTimer: NodeJS.Timeout | null = null

function defaultPosition(width: number): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + 24 }
}

function createWindow(): void {
  const cfg = getConfig().accountBar
  const def = defaultPosition(INIT_W)

  win = new BrowserWindow({
    width: INIT_W,
    height: INIT_H,
    x: cfg.x ?? def.x,
    y: cfg.y ?? def.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setOpacity(cfg.opacity)

  win.on('moved', () => {
    if (!win) return
    const b = win.getBounds()
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => updateAccountBarPosition(b.x, b.y), 250)
  })

  win.on('closed', () => {
    win = null
  })

  win.webContents.on('did-finish-load', () => pushData())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/accountbar.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/accountbar.html'))
  }

  win.once('ready-to-show', () => win?.showInactive())
}

/** Construit la liste des comptes + états et la pousse au renderer. */
function pushData(): void {
  if (!win) return
  const cfg = getConfig()
  // Réconciliation courante : quels comptes ont une fenêtre détectée.
  const dofusWins = listWindows(cfg.accounts, false)
  updateDofusHandles(new Set(dofusWins.map((w) => w.handle)))
  const detected = new Set(
    dofusWins.map((w) => w.accountId).filter((id): id is string => !!id)
  )
  const items: AccountBarItem[] = [...cfg.accounts]
    .sort((a, b) => a.order - b.order)
    .map((a) => ({
      id: a.id,
      label: a.label,
      class: a.class,
      active: a.id === activeAccountId,
      detected: detected.has(a.id)
    }))
  win.webContents.send(IPC.accountBarData, items)
}

/** Crée/détruit la fenêtre selon `enabled` ; applique l'opacité. */
export function syncAccountBar(): void {
  const cfg = getConfig().accountBar
  if (cfg.enabled) {
    if (!win) {
      createWindow()
      // Rafraîchit l'état « détecté » tant que la barre est ouverte.
      if (refreshTimer) clearInterval(refreshTimer)
      refreshTimer = setInterval(() => pushData(), 5000)
    } else {
      win.setOpacity(cfg.opacity)
      if (!win.isVisible()) win.showInactive()
      pushData()
    }
  } else {
    destroyAccountBar()
  }
}

/** Met à jour le compte actif mis en avant dans la barre. */
export function setActiveAccount(accountId: string): void {
  activeAccountId = accountId
  pushData()
}

/** Adapte la fenêtre à la taille de contenu demandée par le renderer. */
export function resizeAccountBarWindow(width: number, height: number): void {
  if (!win) return
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(width)))
  const h = Math.max(1, Math.round(height))
  const b = win.getBounds()
  const hasCustomPos = getConfig().accountBar.x !== undefined
  const x = hasCustomPos ? b.x : defaultPosition(w).x
  if (b.width === w && b.height === h && b.x === x) return
  win.setBounds({ x, y: b.y, width: w, height: h })
}

/** Réinitialise la position de la barre (oublie la position persistée, re-centre). */
export function resetAccountBarPosition(): void {
  clearAccountBarPosition()
  if (!win) return
  const b = win.getBounds()
  const def = defaultPosition(b.width)
  win.setBounds({ x: def.x, y: def.y, width: b.width, height: b.height })
}

/** Détruit la fenêtre de la barre de comptes. */
export function destroyAccountBar(): void {
  if (moveTimer) {
    clearTimeout(moveTimer)
    moveTimer = null
  }
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  win?.destroy()
  win = null
}
