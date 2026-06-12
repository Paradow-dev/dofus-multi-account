import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/types'
import { getConfig, updateOverlayPosition, clearOverlayPosition } from './state'
import { fadeInShow, fadeOutHide, setOpacityNow } from './windowFade'

/**
 * Overlay flottant « nom du personnage actif » :
 * fenêtre sans cadre, transparente, always-on-top, déplaçable à la souris
 * (zone draggable côté renderer) et d'opacité réglable.
 *
 * La fenêtre est créée à la demande (overlay activé) et détruite sinon.
 */

// Taille initiale ; la fenêtre s'ajuste ensuite au contenu (resizeOverlayWindow).
const OVERLAY_W = 240
const OVERLAY_H = 64
// Bornes de la largeur auto : en deçà on n'a rien à montrer, au-delà on tronque.
const MIN_W = 72
const MAX_W = 480

let win: BrowserWindow | null = null
/** Dernier nom poussé : ré-émis dès que la fenêtre (re)charge. */
let activeCharacter = ''
/** Anti-rafale pour la persistance de position pendant un drag. */
let moveTimer: NodeJS.Timeout | null = null

/** Placement par défaut (centré en haut de l'écran principal) pour une largeur donnée. */
function defaultPosition(width: number): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + 24
  }
}

function createWindow(): void {
  const cfg = getConfig().overlay
  const def = defaultPosition(OVERLAY_W)
  const x = cfg.x ?? def.x
  const y = cfg.y ?? def.y

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

  // Apparition en fondu, sans voler le focus au jeu.
  win.once('ready-to-show', () => {
    if (win) fadeInShow(win, getConfig().overlay.opacity)
  })
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
    else if (!win.isVisible() && !focusHidden) fadeInShow(win, cfg.opacity)
    else setOpacityNow(win, cfg.opacity)
  } else {
    destroyOverlay()
  }
}

/** Masquage temporaire : la fenêtre active n'est pas Dofus (voir focusWatch.ts). */
let focusHidden = false

export function setOverlayFocusHidden(next: boolean): void {
  focusHidden = next
  if (!win) return
  const cfg = getConfig().overlay
  if (next) fadeOutHide(win, cfg.opacity)
  else if (cfg.enabled && !win.isVisible()) fadeInShow(win, cfg.opacity)
}

/** Met à jour le nom de personnage affiché par l'overlay. */
export function setActiveCharacter(name: string): void {
  activeCharacter = name
  pushCharacter()
}

/**
 * Adapte la fenêtre à la taille de contenu demandée par le renderer.
 * Largeur bornée (MIN_W..MAX_W) : au-delà, le renderer tronque le texte.
 * Sans position personnalisée, on re-centre horizontalement à chaque ajustement.
 */
export function resizeOverlayWindow(width: number, height: number): void {
  if (!win) return
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(width)))
  const h = Math.max(1, Math.round(height))
  const b = win.getBounds()
  const hasCustomPos = getConfig().overlay.x !== undefined
  const x = hasCustomPos ? b.x : defaultPosition(w).x
  if (b.width === w && b.height === h && b.x === x) return
  win.setBounds({ x, y: b.y, width: w, height: h })
}

/** Réinitialise la position de l'overlay (oublie la position persistée, re-centre). */
export function resetOverlayPosition(): void {
  clearOverlayPosition()
  if (!win) return
  const b = win.getBounds()
  const def = defaultPosition(b.width)
  win.setBounds({ x: def.x, y: def.y, width: b.width, height: b.height })
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
