import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/types'
import { getConfig, persistBrowserBounds, setBrowserEnabled } from './state'
import type { Rect } from './windowManager'

/**
 * Mini-navigateur en overlay : fenêtre dédiée, sans cadre natif (chrome maison),
 * redimensionnable et always-on-top activable. Sert à consulter des guides de
 * quêtes en gardant le jeu visible derrière.
 *
 * Le contenu distant est isolé dans une balise <webview> (process séparé) ;
 * la barre d'outils est rendue localement (browser.html). La fenêtre est créée
 * à la demande et détruite sinon, à l'image de l'overlay « nom de personnage ».
 */

const DEFAULT_W = 460
const DEFAULT_H = 720
const MIN_W = 320
const MIN_H = 360

let win: BrowserWindow | null = null
/** Anti-rafale pour la persistance de la géométrie pendant un drag/resize. */
let boundsTimer: NodeJS.Timeout | null = null

/** Placement par défaut : collé au bord droit de l'écran principal. */
function defaultBounds(): { x: number; y: number; width: number; height: number } {
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(DEFAULT_W, area.width)
  const height = Math.min(DEFAULT_H, area.height)
  return {
    x: area.x + area.width - width - 16,
    y: area.y + 16,
    width,
    height
  }
}

function createWindow(): void {
  const cfg = getConfig().browser
  const def = defaultBounds()

  win = new BrowserWindow({
    width: cfg.width ?? def.width,
    height: cfg.height ?? def.height,
    x: cfg.x ?? def.x,
    y: cfg.y ?? def.y,
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    skipTaskbar: false,
    // Toujours au premier plan : c'est la raison d'être de l'overlay.
    alwaysOnTop: true,
    backgroundColor: '#0E1116',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Active la balise <webview> qui héberge le site distant (process isolé).
      webviewTag: true
    }
  })

  // Reste au-dessus même des fenêtres plein écran / autres always-on-top.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setOpacity(cfg.opacity)

  // Persiste la géométrie après déplacement/redimensionnement (anti-rafale).
  const schedulePersist = (): void => {
    if (!win) return
    const b = win.getBounds()
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => persistBrowserBounds(b.x, b.y, b.width, b.height), 250)
  }
  win.on('moved', schedulePersist)
  win.on('resized', schedulePersist)

  win.on('closed', () => {
    win = null
  })

  // Les liens ouvrant une nouvelle fenêtre (target=_blank, window.open,
  // Ctrl/clic-milieu) ouvrent un nouvel onglet dans le navigateur. Les liens
  // non-http (mailto:, etc.) partent vers le navigateur système.
  win.webContents.on('did-attach-webview', (_e, contents) => {
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (/^https?:/i.test(url)) {
        // disposition 'background-tab' = Ctrl/clic-milieu → onglet en arrière-plan.
        win?.webContents.send(IPC.browserOpenTab, {
          url,
          active: disposition !== 'background-tab'
        })
      } else {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    // Zoom de la page quand la webview a le focus (raccourcis Ctrl +/-/0 et
    // Ctrl+molette) : appliqué ici puis synchronisé vers la barre d'outils.
    const applyZoom = (factor: number): void => {
      const f = Math.min(3, Math.max(0.3, Math.round(factor * 10) / 10))
      contents.setZoomFactor(f)
      win?.webContents.send(IPC.browserZoomSync, { wcId: contents.id, factor: f })
    }
    contents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return
      if (input.key === '+' || input.key === '=') {
        e.preventDefault()
        applyZoom(contents.getZoomFactor() + 0.1)
      } else if (input.key === '-') {
        e.preventDefault()
        applyZoom(contents.getZoomFactor() - 0.1)
      } else if (input.key === '0') {
        e.preventDefault()
        applyZoom(1)
      }
    })
    contents.on('zoom-changed', (_e, dir) => {
      applyZoom(contents.getZoomFactor() + (dir === 'in' ? 0.1 : -0.1))
    })
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/browser.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/browser.html'))
  }

  win.once('ready-to-show', () => win?.show())
}

/**
 * Aligne la fenêtre navigateur sur la config courante : création/destruction
 * selon `enabled`, application de l'épinglage et de l'opacité.
 */
export function syncBrowser(): void {
  const cfg = getConfig().browser
  if (cfg.enabled) {
    if (!win) {
      createWindow()
    } else {
      // Fenêtre déjà ouverte : réaligne l'opacité sans voler le focus,
      // et ré-affiche si masquée (sauf masquage « hors jeu » en cours).
      win.setOpacity(cfg.opacity)
      if (!win.isVisible() && !focusHidden) win.showInactive()
    }
  } else {
    destroyBrowser()
  }
}

/** Masquage temporaire : la fenêtre active n'est pas Dofus (voir focusWatch.ts). */
let focusHidden = false

export function setBrowserFocusHidden(next: boolean): void {
  focusHidden = next
  if (!win) return
  if (next) win.hide()
  else if (getConfig().browser.enabled && !win.isVisible()) win.showInactive()
}

/**
 * Place la fenêtre du navigateur sur une zone donnée (disposition « côte à côte »).
 * Active et crée la fenêtre si nécessaire, puis persiste la nouvelle géométrie.
 */
export function snapBrowserTo(rect: Rect): void {
  if (!getConfig().browser.enabled) {
    setBrowserEnabled(true) // crée la fenêtre via syncBrowser
  } else if (!win) {
    createWindow()
  }
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.setBounds(rect)
  persistBrowserBounds(rect.x, rect.y, rect.width, rect.height)
}

/** Met la fenêtre navigateur au premier plan (la crée si besoin). */
export function focusBrowser(): void {
  if (!win) {
    if (!getConfig().browser.enabled) setBrowserEnabled(true)
    else createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Détruit la fenêtre navigateur (désactivation ou fermeture de l'app). */
export function destroyBrowser(): void {
  if (boundsTimer) {
    clearTimeout(boundsTimer)
    boundsTimer = null
  }
  win?.destroy()
  win = null
}
