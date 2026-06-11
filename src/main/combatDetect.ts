/**
 * Détection automatique du combat par capture d'écran de la zone du bouton
 * « fin de tour » (sélectionnée par l'utilisateur, voir zonePicker.ts).
 *
 * Pas d'OCR lourd : on compare une signature colorimétrique (grille 8×8 de
 * moyennes RGB) de la zone capturée à une signature de référence calibrée
 * pendant un combat. Le bouton fin de tour n'existe qu'en combat : si la zone
 * ressemble à la référence, on est en combat.
 *
 * Hystérésis pour éviter les faux positifs/négatifs ponctuels (transitions,
 * fenêtres qui passent devant) : 2 correspondances consécutives pour entrer,
 * 3 échecs consécutifs pour sortir.
 */

import { desktopCapturer, screen } from 'electron'
import type { CombatZone } from '@shared/types'
import { isInCombat, enterCombat, exitCombat } from './combatState'
import { getConfig } from './state'

/** Grille de la signature : 8×8 cellules × 3 canaux = 192 valeurs. */
const GRID = 8
/** Distance moyenne (0-255) en deçà de laquelle la zone correspond à la référence. */
const MATCH_THRESHOLD = 28
/** Période de la boucle de détection. */
const POLL_MS = 2000
/** Correspondances consécutives requises pour entrer en combat. */
const ENTER_AFTER = 2
/** Échecs consécutifs requis pour sortir du combat. */
const EXIT_AFTER = 3

let pollTimer: NodeJS.Timeout | null = null
let matchStreak = 0
let missStreak = 0
/** true si l'état combat courant a été posé par la détection (pas manuellement). */
let enteredByDetect = false

/**
 * Capture la zone d'écran demandée et retourne ses pixels RGBA (bitmap),
 * ou null si la capture échoue. Gère le facteur d'échelle de l'affichage.
 */
async function captureZone(zone: CombatZone): Promise<Buffer | null> {
  try {
    const display = screen.getDisplayMatching({
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height
    })
    const scale = display.scaleFactor
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale)
      }
    })
    const source =
      sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source) return null

    const crop = source.thumbnail.crop({
      x: Math.round((zone.x - display.bounds.x) * scale),
      y: Math.round((zone.y - display.bounds.y) * scale),
      width: Math.round(zone.width * scale),
      height: Math.round(zone.height * scale)
    })
    // Normalise la taille : la signature est indépendante de la résolution.
    const small = crop.resize({ width: GRID * 4, height: GRID * 4 })
    return small.toBitmap()
  } catch {
    return null
  }
}

/** Signature colorimétrique : moyenne BGR de chaque cellule d'une grille 8×8. */
function computeSignature(bitmap: Buffer): number[] {
  const size = GRID * 4 // côté de l'image normalisée (px)
  const cell = size / GRID
  const sig: number[] = []
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const i = (y * size + x) * 4 // BGRA
          b += bitmap[i]
          g += bitmap[i + 1]
          r += bitmap[i + 2]
          n++
        }
      }
      sig.push(Math.round(r / n), Math.round(g / n), Math.round(b / n))
    }
  }
  return sig
}

/** Distance moyenne (0-255) entre deux signatures. */
function distance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 255
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}

/**
 * Capture la zone maintenant et calcule sa signature de référence
 * (à appeler pendant un combat, bouton fin de tour visible).
 */
export async function calibrateZone(zone: CombatZone): Promise<number[] | null> {
  const bitmap = await captureZone(zone)
  if (!bitmap) return null
  return computeSignature(bitmap)
}

async function tick(): Promise<void> {
  const cm = getConfig().combat
  if (!cm.autoDetect || !cm.detectZone || !cm.detectSignature?.length) return

  const bitmap = await captureZone(cm.detectZone)
  if (!bitmap) return
  const match = distance(computeSignature(bitmap), cm.detectSignature) < MATCH_THRESHOLD

  if (match) {
    matchStreak++
    missStreak = 0
    if (!isInCombat() && matchStreak >= ENTER_AFTER) {
      enteredByDetect = true
      enterCombat()
    }
  } else {
    missStreak++
    matchStreak = 0
    // Ne sort automatiquement que si c'est la détection qui a activé le mode :
    // un toggle manuel reste maître (l'auto-exit 90 s s'applique toujours).
    if (isInCombat() && enteredByDetect && missStreak >= EXIT_AFTER) {
      enteredByDetect = false
      exitCombat()
    }
  }
}

/** Démarre/arrête la boucle selon la config courante (à appeler après chaque mutation). */
export function syncCombatDetect(): void {
  const cm = getConfig().combat
  const wanted = cm.autoDetect && !!cm.detectZone && !!cm.detectSignature?.length
  if (wanted && !pollTimer) {
    matchStreak = 0
    missStreak = 0
    pollTimer = setInterval(() => void tick(), POLL_MS)
    console.log('[combatDetect] détection active')
  } else if (!wanted && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function stopCombatDetect(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
