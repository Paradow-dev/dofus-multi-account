/**
 * Masque les overlays (nom du personnage, barre de comptes, navigateur) quand
 * la fenêtre au premier plan n'est ni une fenêtre Dofus ni une fenêtre de
 * l'outil — pour ne pas encombrer l'écran hors du jeu.
 *
 * Sonde GetForegroundWindow (koffi) à intervalle court ; la liste des fenêtres
 * Dofus est rafraîchie moins souvent (énumération plus coûteuse).
 * Optionnel via config.hideOverlaysOutsideGame.
 */

import { BrowserWindow } from 'electron'
import { listWindows } from './windowManager'
import { getConfig } from './state'
import { setOverlayFocusHidden } from './overlay'
import { setAccountBarFocusHidden } from './accountBar'
import { setBrowserFocusHidden } from './browser'
import { setMacroBarFocusHidden } from './macroBar'

const POLL_MS = 500
const REFRESH_HANDLES_MS = 3000

let pollTimer: NodeJS.Timeout | null = null
let refreshTimer: NodeJS.Timeout | null = null
let dofusHandles = new Set<number>()
let hidden = false

type Fn = (...args: unknown[]) => unknown
let GetForegroundWindow: Fn | null = null

function loadForegroundFn(): boolean {
  if (GetForegroundWindow) return true
  if (process.platform !== 'win32') return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    GetForegroundWindow = user32.func('void* GetForegroundWindow()') as unknown as Fn
    return true
  } catch {
    return false
  }
}

/** HWND de la fenêtre au premier plan (null hors Windows / FFI indisponible). */
export function getForegroundHandle(): number | null {
  if (!loadForegroundFn() || !GetForegroundWindow) return null
  try {
    return Number(GetForegroundWindow())
  } catch {
    return null
  }
}

/** HWND natifs de toutes nos fenêtres (overlays inclus) : ne déclenchent pas le masquage. */
function ownHandles(): Set<number> {
  const handles = new Set<number>()
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      const buf = win.getNativeWindowHandle()
      handles.add(buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0))
    } catch {
      /* ignore */
    }
  }
  return handles
}

function refreshDofusHandles(): void {
  try {
    const wins = listWindows(getConfig().accounts, false)
    dofusHandles = new Set(wins.map((w) => w.handle))
  } catch {
    /* ignore */
  }
}

function applyHidden(next: boolean): void {
  if (next === hidden) return
  hidden = next
  setOverlayFocusHidden(next)
  setAccountBarFocusHidden(next)
  setBrowserFocusHidden(next)
  setMacroBarFocusHidden(next)
}

function tick(): void {
  if (!getConfig().hideOverlaysOutsideGame) {
    applyHidden(false)
    return
  }
  if (!GetForegroundWindow) return
  try {
    const fg = Number(GetForegroundWindow())
    // Pas de fenêtre Dofus détectée : on ne masque pas (rien à protéger,
    // et cela évite de cacher les overlays pendant la configuration).
    if (dofusHandles.size === 0) {
      applyHidden(false)
      return
    }
    const allowed = dofusHandles.has(fg) || ownHandles().has(fg)
    applyHidden(!allowed)
  } catch {
    /* ignore */
  }
}

export function initFocusWatch(): void {
  if (pollTimer) return
  if (!loadForegroundFn()) return
  refreshDofusHandles()
  refreshTimer = setInterval(() => refreshDofusHandles(), REFRESH_HANDLES_MS)
  pollTimer = setInterval(() => tick(), POLL_MS)
}

export function stopFocusWatch(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
