import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/types'
import { getConfig, updateOverlayPosition } from './state'

/**
 * Overlay flottant « nom du personnage actif » :
 * fenêtre sans cadre, transparente, always-on-top, déplaçable à la souris
 * (zone draggable côté renderer) et d'opacité réglable.
 *
 * La fenêtre est créée à la demande (overlay activé) et détruite sinon.
 */

const OVERLAY_W = 240
const OVERLAY_H = 64

let win: BrowserWindow | null = null
/** Dernier nom poussé : ré-émis dès que la fenêtre (re)charge. */
let activeCharacter = ''
/** Anti-rafale pour la persistance de position pendant un drag. */
let moveTimer: NodeJS.Timeout | null = null

function createWindow(): void {
  const cfg = getConfig().overlay
  const area = screen.getPrimaryDisplay().workArea
  const x = cfg.x ?? area.x + Math.round((area.width - OVERLAY_W) / 2)
  const y = cfg.y ?? area.y + 24

  win = new BrowserWindow({
    width: OVERLAY_W,
    height: OVERLAY_H,
    x,
    y,
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

  // Reste au-dessus même des fenêtres plein écran / autres always-on-top.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setOpacity(cfg.opacity)

  // Persiste la position après un déplacement (anti-rafale : 'moved' émet en série).
  win.on('moved', () => {
    if (!win) return
    const b = win.getBounds()
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => updateOverlayPosition(b.x, b.y), 250)
  })

  win.on('closed', () => {
    win = null
  })

  // Ré-émet le nom courant une fois le contenu chargé.
  win.webContents.on('did-finish-load', () => pushCharacter())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/overlay.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  // showInactive : afficher sans voler le focus au jeu.
  win.once('ready-to-show', () => win?.showInactive())
}

function pushCharacter(): void {
  win?.webContents.send(IPC.overlayCharacter, activeCharacter)
}

/**
 * Aligne l'overlay sur la config courante : création/destruction selon `enabled`
 * et application de l'opacité. À appeler après chaque mutation de configuration.
 */
export function syncOverlay(): void {
  const cfg = getConfig().overlay
  if (cfg.enabled) {
    if (!win) createWindow()
    else {
      win.setOpacity(cfg.opacity)
      if (!win.isVisible()) win.showInactive()
    }
  } else {
    destroyOverlay()
  }
}

/** Met à jour le nom de personnage affiché par l'overlay. */
export function setActiveCharacter(name: string): void {
  activeCharacter = name
  pushCharacter()
}

/** Détruit la fenêtre d'overlay (overlay désactivé ou fermeture de l'app). */
export function destroyOverlay(): void {
  if (moveTimer) {
    clearTimeout(moveTimer)
    moveTimer = null
  }
  win?.destroy()
  win = null
}
