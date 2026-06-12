import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/types'
import { getConfig, updateMacroBarPosition, clearMacroBarPosition } from './state'
import { getQuickMacroState } from './quickMacro'

/**
 * Panneau flottant de la macro rapide : fenêtre sans cadre, transparente,
 * always-on-top (même architecture que la barre de comptes, accountBar.ts).
 * Affiche l'état de la macro (repos, compte à rebours, REC, confirmation,
 * lecture) et ses boutons d'action. Déplaçable, position mémorisée.
 */

const INIT_W = 320
const INIT_H = 56
const MIN_W = 80
const MAX_W = 900

let win: BrowserWindow | null = null
let moveTimer: NodeJS.Timeout | null = null

/** Position par défaut : centré en bas de l'écran principal. */
function defaultPosition(width: number, height: number): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + area.height - height - 24
  }
}

function createWindow(): void {
  const cfg = getConfig().quickMacro
  const def = defaultPosition(INIT_W, INIT_H)

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
    moveTimer = setTimeout(() => updateMacroBarPosition(b.x, b.y), 250)
  })

  win.on('closed', () => {
    win = null
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send(IPC.macroState, getQuickMacroState())
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/macrobar.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/macrobar.html'))
  }

  win.once('ready-to-show', () => win?.showInactive())
}

/** Crée/détruit la fenêtre selon `enabled` ; applique l'opacité. */
export function syncMacroBar(): void {
  const cfg = getConfig().quickMacro
  if (cfg.enabled) {
    if (!win) {
      createWindow()
    } else {
      win.setOpacity(cfg.opacity)
      if (!win.isVisible() && !focusHidden) win.showInactive()
    }
  } else {
    destroyMacroBar()
  }
}

/** Masquage temporaire : la fenêtre active n'est pas Dofus (voir focusWatch.ts). */
let focusHidden = false

export function setMacroBarFocusHidden(next: boolean): void {
  focusHidden = next
  if (!win) return
  // Le panneau reste visible dès que la macro est active (countdown, REC…).
  if (next && getQuickMacroState().phase === 'idle') win.hide()
  else if (getConfig().quickMacro.enabled && !win.isVisible()) win.showInactive()
}

/** Adapte la fenêtre à la taille de contenu demandée par le renderer. */
export function resizeMacroBarWindow(width: number, height: number): void {
  if (!win) return
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(width)))
  const h = Math.max(1, Math.round(height))
  const b = win.getBounds()
  const hasCustomPos = getConfig().quickMacro.x !== undefined
  const def = defaultPosition(w, h)
  const x = hasCustomPos ? b.x : def.x
  const y = hasCustomPos ? b.y : def.y
  if (b.width === w && b.height === h && b.x === x && b.y === y) return
  win.setBounds({ x, y, width: w, height: h })
}

/** Réinitialise la position du panneau (oublie la position persistée, re-centre). */
export function resetMacroBarPosition(): void {
  clearMacroBarPosition()
  if (!win) return
  const b = win.getBounds()
  const def = defaultPosition(b.width, b.height)
  win.setBounds({ x: def.x, y: def.y, width: b.width, height: b.height })
}

/** Détruit la fenêtre du panneau macro. */
export function destroyMacroBar(): void {
  if (moveTimer) {
    clearTimeout(moveTimer)
    moveTimer = null
  }
  win?.destroy()
  win = null
}
