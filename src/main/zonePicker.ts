/**
 * Overlay de sélection de zone : fenêtre plein écran semi-transparente où
 * l'utilisateur dessine un rectangle (drag) autour du bouton « fin de tour ».
 * Échap ou clic sans drag = annulation.
 *
 * La fenêtre couvre l'écran où se trouve le curseur au moment de l'ouverture.
 */

import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { IPC, type CombatZone } from '@shared/types'

let win: BrowserWindow | null = null
let pending: ((zone: CombatZone | null) => void) | null = null

/** Ouvre l'overlay et résout avec la zone choisie (coordonnées écran) ou null. */
export function pickZone(): Promise<CombatZone | null> {
  // Une sélection à la fois : annule la précédente si encore ouverte.
  if (win) {
    win.destroy()
    win = null
    pending?.(null)
    pending = null
  }

  return new Promise((resolve) => {
    pending = resolve
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y, width, height } = display.bounds

    win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      fullscreen: false,
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

    win.on('closed', () => {
      win = null
      // Fenêtre fermée sans sélection (Alt+F4…) : annulation.
      pending?.(null)
      pending = null
    })

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) {
      void win.loadURL(`${devUrl}/zonepicker.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/zonepicker.html'))
    }

    win.once('ready-to-show', () => {
      win?.show()
      win?.focus()
    })
  })
}

/** Enregistre le handler IPC du picker (une fois au démarrage). */
export function registerZonePickerIpc(): void {
  ipcMain.on(IPC.combatZonePicked, (_e, zone: CombatZone | null) => {
    const resolve = pending
    pending = null
    const w = win
    win = null

    if (zone && w) {
      // Coordonnées client → écran (la fenêtre couvre exactement le display).
      const b = w.getBounds()
      resolve?.({ x: b.x + zone.x, y: b.y + zone.y, width: zone.width, height: zone.height })
    } else {
      resolve?.(null)
    }
    w?.destroy()
  })
}
