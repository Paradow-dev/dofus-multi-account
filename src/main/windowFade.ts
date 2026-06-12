/**
 * Fondu d'opacité des fenêtres d'overlay (apparition/disparition douces).
 *
 * Anime win.setOpacity par pas de ~16 ms sur une courte durée : aucun coût
 * hors transition (pas de timer permanent). Un fondu en cours sur la même
 * fenêtre est annulé par le suivant. Après un fondu sortant, l'opacité cible
 * est restaurée (fenêtre cachée) pour qu'un éventuel show direct n'affiche
 * pas une fenêtre invisible.
 */

import type { BrowserWindow } from 'electron'

const FADE_MS = 140
const STEP_MS = 16

/** Fondu en cours par fenêtre (win.id → timer). */
const running = new Map<number, NodeJS.Timeout>()

/** Annule le fondu en cours sur la fenêtre (l'opacité reste où elle est). */
export function cancelFade(win: BrowserWindow): void {
  const timer = running.get(win.id)
  if (timer) {
    clearInterval(timer)
    running.delete(win.id)
  }
}

function animate(win: BrowserWindow, to: number, onDone?: () => void): void {
  cancelFade(win)
  const from = win.getOpacity()
  if (Math.abs(to - from) < 0.01) {
    win.setOpacity(to)
    onDone?.()
    return
  }
  const startedAt = Date.now()
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(timer)
      running.delete(win.id)
      return
    }
    const t = Math.min(1, (Date.now() - startedAt) / FADE_MS)
    // ease-out quad : départ vif, arrivée douce.
    const eased = 1 - (1 - t) * (1 - t)
    win.setOpacity(from + (to - from) * eased)
    if (t >= 1) {
      clearInterval(timer)
      running.delete(win.id)
      onDone?.()
    }
  }, STEP_MS)
  running.set(win.id, timer)
}

/**
 * Affiche la fenêtre en fondu (sans voler le focus) jusqu'à l'opacité cible.
 * Si elle est déjà visible, anime simplement vers la cible.
 */
export function fadeInShow(win: BrowserWindow, target: number): void {
  if (win.isDestroyed()) return
  if (!win.isVisible()) {
    win.setOpacity(0)
    win.showInactive()
  }
  animate(win, target)
}

/**
 * Masque la fenêtre en fondu, puis restaure l'opacité pour les shows directs.
 * `restoreTo` : opacité à rétablir une fois cachée (défaut : l'opacité au
 * moment de l'appel — passer l'opacité configurée si un fondu entrant peut
 * être en cours, sinon on restaurerait une valeur intermédiaire).
 */
export function fadeOutHide(win: BrowserWindow, restoreTo?: number): void {
  if (win.isDestroyed() || !win.isVisible()) return
  const restore = restoreTo ?? win.getOpacity()
  animate(win, 0, () => {
    if (win.isDestroyed()) return
    win.hide()
    win.setOpacity(restore)
  })
}

/** Applique une opacité immédiatement (annule tout fondu en cours). */
export function setOpacityNow(win: BrowserWindow, value: number): void {
  if (win.isDestroyed()) return
  cancelFade(win)
  win.setOpacity(value)
}
