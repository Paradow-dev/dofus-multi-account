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

import { desktopCapturer, screen, type NativeImage } from 'electron'
import type { CombatZone, CombatZonePreview } from '@shared/types'
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
 * Capture la zone d'écran demandée et retourne l'image recadrée, ou null si
 * la capture échoue. Gère le facteur d'échelle.
 *
 * `maxZonePx` limite la définition demandée : la miniature d'écran est
 * réduite juste assez pour que la zone recadrée fasse au moins maxZonePx de
 * côté. La boucle de détection n'a besoin que de 32 px (signature 8×8) : lui
 * demander l'écran entier en résolution native toutes les 2 s coûtait une
 * copie/réduction de plusieurs mégapixels — sensible en jeu. Sans maxZonePx
 * (aperçu UI), la capture reste en pleine résolution.
 */
async function captureZoneImage(
  zone: CombatZone,
  maxZonePx?: number
): Promise<NativeImage | null> {
  try {
    const display = screen.getDisplayMatching({
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height
    })
    const native = display.scaleFactor
    // Échelle effective de la miniature par rapport aux coordonnées logiques.
    let scale = native
    if (maxZonePx !== undefined && zone.width > 0 && zone.height > 0) {
      const needed = Math.max(maxZonePx / zone.width, maxZonePx / zone.height)
      scale = Math.min(native, Math.max(0.05, needed))
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, Math.round(display.size.width * scale)),
        height: Math.max(1, Math.round(display.size.height * scale))
      }
    })
    const source =
      sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source) return null

    // La miniature peut différer légèrement de la taille demandée : on déduit
    // l'échelle réelle de sa taille effective.
    const thumb = source.thumbnail.getSize()
    const sx = thumb.width / display.size.width
    const sy = thumb.height / display.size.height
    return source.thumbnail.crop({
      x: Math.round((zone.x - display.bounds.x) * sx),
      y: Math.round((zone.y - display.bounds.y) * sy),
      width: Math.max(1, Math.round(zone.width * sx)),
      height: Math.max(1, Math.round(zone.height * sy))
    })
  } catch {
    return null
  }
}

/**
 * Capture la zone et retourne ses pixels BGRA normalisés (32×32) pour la
 * signature, ou null si la capture échoue. Capture réduite (voir
 * captureZoneImage) : la signature n'a besoin que de GRID*4 px de côté.
 */
async function captureZone(zone: CombatZone): Promise<Buffer | null> {
  const crop = await captureZoneImage(zone, GRID * 8)
  if (!crop) return null
  // Normalise la taille : la signature est indépendante de la résolution.
  return crop.resize({ width: GRID * 4, height: GRID * 4 }).toBitmap()
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

/**
 * Aperçu de la détection pour l'UI : capture courante de la zone (PNG data
 * URL) + distance à la signature de référence. null si pas de zone définie.
 */
export async function previewZone(): Promise<CombatZonePreview | null> {
  const cm = getConfig().combat
  if (!cm.detectZone) return null
  const crop = await captureZoneImage(cm.detectZone)
  if (!crop || crop.isEmpty()) return null

  const bitmap = crop.resize({ width: GRID * 4, height: GRID * 4 }).toBitmap()
  const dist = cm.detectSignature?.length
    ? distance(computeSignature(bitmap), cm.detectSignature)
    : 255
  return {
    image: crop.toDataURL(),
    distance: Math.round(dist),
    threshold: MATCH_THRESHOLD,
    match: dist < MATCH_THRESHOLD
  }
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
