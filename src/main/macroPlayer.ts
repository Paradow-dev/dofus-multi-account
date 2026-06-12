/**
 * Lecture de la macro rapide via SendInput (koffi).
 *
 * La structure Win32 INPUT (40 octets sur x64 : type uint32 + 4 de padding +
 * union dont MOUSEINPUT, 32 octets, est le plus grand membre) est modélisée par
 * deux layouts koffi de même taille totale : MACRO_INPUT_K (clavier) et
 * MACRO_INPUT_M (souris). SendInput est lié deux fois, une par layout.
 *
 * Clics, mouvements et molette sont rejoués en coordonnées absolues
 * normalisées 0-65535 (MOUSEEVENTF_ABSOLUTE), calculées à partir des bounds de
 * la fenêtre cible et des ratios enregistrés. Boutons down/up séparés (drags,
 * Ctrl+clic…). La touche Échap (GetAsyncKeyState, sondée entre les événements)
 * interrompt la lecture ; la pause suspend sans perdre la position.
 */

import type { MacroEvent, MacroMouseButton, RecorderBounds } from './macroRecorder'
import { requestHighResTimers, releaseHighResTimers } from './timerRes'

const INPUT_MOUSE = 0
const INPUT_KEYBOARD = 1
const KEYEVENTF_KEYUP = 0x0002
const MOUSEEVENTF_MOVE = 0x0001
const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const MOUSEEVENTF_RIGHTDOWN = 0x0008
const MOUSEEVENTF_RIGHTUP = 0x0010
const MOUSEEVENTF_MIDDLEDOWN = 0x0020
const MOUSEEVENTF_MIDDLEUP = 0x0040
const MOUSEEVENTF_WHEEL = 0x0800
const MOUSEEVENTF_VIRTUALDESK = 0x4000
const MOUSEEVENTF_ABSOLUTE = 0x8000

const BUTTON_DOWN_FLAG: Record<MacroMouseButton, number> = {
  left: MOUSEEVENTF_LEFTDOWN,
  right: MOUSEEVENTF_RIGHTDOWN,
  middle: MOUSEEVENTF_MIDDLEDOWN
}
const BUTTON_UP_FLAG: Record<MacroMouseButton, number> = {
  left: MOUSEEVENTF_LEFTUP,
  right: MOUSEEVENTF_RIGHTUP,
  middle: MOUSEEVENTF_MIDDLEUP
}
// Bureau virtuel (multi-écrans) : origine et taille englobant tous les moniteurs.
const SM_XVIRTUALSCREEN = 76
const SM_YVIRTUALSCREEN = 77
const SM_CXVIRTUALSCREEN = 78
const SM_CYVIRTUALSCREEN = 79
const VK_ESCAPE = 0x1b
const KEY_DOWN = 0x8000
/** Taille de la structure INPUT sur x64 (octets). */
const INPUT_SIZE = 40

type Fn = (...args: unknown[]) => unknown

let koffi: typeof import('koffi') | null = null
let ffiReady = false
let SendInputK: Fn | null = null
let SendInputM: Fn | null = null
let GetSystemMetrics: Fn | null = null
let GetAsyncKeyState: Fn | null = null

/** Charge koffi + structures + fonctions une seule fois (types nommés uniques). */
function initFfi(): boolean {
  if (ffiReady) return true
  if (process.platform !== 'win32') return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')

    // INPUT « clavier » : type + padding, puis KEYBDINPUT, puis padding final
    // pour atteindre la taille de l'union (MOUSEINPUT) — 40 octets au total.
    koffi.struct('MACRO_INPUT_K', {
      type: 'uint32',
      pad0: 'uint32',
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64',
      pad1: 'uint64'
    })
    // INPUT « souris » : type + padding, puis MOUSEINPUT (dwExtraInfo aligné
    // sur 8 octets → 40 octets au total, même taille que MACRO_INPUT_K).
    koffi.struct('MACRO_INPUT_M', {
      type: 'uint32',
      pad0: 'uint32',
      dx: 'int32',
      dy: 'int32',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64'
    })

    // Forme « classique » de koffi : permet de lier deux fois le même symbole
    // SendInput, une signature par layout (clavier / souris).
    SendInputK = user32.func('SendInput', 'uint32', [
      'uint32',
      'MACRO_INPUT_K*',
      'int32'
    ]) as unknown as Fn
    SendInputM = user32.func('SendInput', 'uint32', [
      'uint32',
      'MACRO_INPUT_M*',
      'int32'
    ]) as unknown as Fn
    GetSystemMetrics = user32.func('int32 GetSystemMetrics(int32)') as unknown as Fn
    GetAsyncKeyState = user32.func('int16 GetAsyncKeyState(int32)') as unknown as Fn
    ffiReady = true
    return true
  } catch (err) {
    console.warn('[macroPlayer] initialisation FFI échouée :', err)
    return false
  }
}

/** true si la lecture SendInput est disponible sur cette plateforme. */
export function isPlayerAvailable(): boolean {
  return initFfi()
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Horodatage du dernier Échap injecté (pour ne pas s'auto-interrompre). */
let lastEscapeInjectedAt = 0

/** true si Échap est enfoncée (interruption de la lecture). */
function escapePressed(): boolean {
  try {
    return (Number(GetAsyncKeyState!(VK_ESCAPE)) & KEY_DOWN) !== 0
  } catch {
    return false
  }
}

function sendKey(vk: number, up: boolean): void {
  if (vk === VK_ESCAPE) lastEscapeInjectedAt = Date.now()
  SendInputK!(
    1,
    {
      type: INPUT_KEYBOARD,
      pad0: 0,
      wVk: vk,
      wScan: 0,
      dwFlags: up ? KEYEVENTF_KEYUP : 0,
      time: 0,
      dwExtraInfo: 0n,
      pad1: 0n
    },
    INPUT_SIZE
  )
}

function sendMouse(dx: number, dy: number, flags: number, mouseData = 0): void {
  SendInputM!(
    1,
    {
      type: INPUT_MOUSE,
      pad0: 0,
      dx,
      dy,
      // uint32 côté Win32 : les deltas molette négatifs passent en non signé.
      mouseData: mouseData >>> 0,
      dwFlags: flags,
      time: 0,
      dwExtraInfo: 0n
    },
    INPUT_SIZE
  )
}

/**
 * Convertit une position écran (px) en coordonnées absolues 0-65535 du bureau
 * VIRTUEL (tous moniteurs confondus) — à combiner avec MOUSEEVENTF_VIRTUALDESK.
 */
function toAbsolute(px: number, py: number): { ax: number; ay: number } {
  const vx = Number(GetSystemMetrics!(SM_XVIRTUALSCREEN))
  const vy = Number(GetSystemMetrics!(SM_YVIRTUALSCREEN))
  const vw = Math.max(1, Number(GetSystemMetrics!(SM_CXVIRTUALSCREEN)))
  const vh = Math.max(1, Number(GetSystemMetrics!(SM_CYVIRTUALSCREEN)))
  return {
    ax: Math.round(((px - vx) * 65535) / (vw - 1 || 1)),
    ay: Math.round(((py - vy) * 65535) / (vh - 1 || 1))
  }
}

/** Coordonnées absolues 0-65535 d'une position en ratio des bounds cibles. */
function ratioToAbsolute(
  xRatio: number,
  yRatio: number,
  bounds: RecorderBounds
): { ax: number; ay: number } {
  const px = Math.round(bounds.x + xRatio * bounds.width)
  const py = Math.round(bounds.y + yRatio * bounds.height)
  return toAbsolute(px, py)
}

export interface ReplayControls {
  /** Interruption immédiate (Échap, bouton stop, relance…). */
  isAborted?: () => boolean
  /** Lecture suspendue : on attend (sans rejouer) tant que c'est vrai. */
  isPaused?: () => boolean
  /** Progression dans la séquence (0-1), notifiée au plus toutes les ~100 ms. */
  onProgress?: (fraction: number) => void
}

/**
 * Rejoue la séquence d'événements sur la fenêtre cible (bounds = conversion
 * des ratios). Le timing est corrigé en dérive : chaque événement vise un
 * horodatage absolu (les centaines de mouvements échantillonnés à ~60 Hz ne
 * cumulent pas l'imprécision de setTimeout). S'interrompt si Échap est
 * enfoncée ou si `isAborted()` devient vrai ; se suspend tant que `isPaused()`
 * est vrai (reprise au prochain événement).
 * Retourne false si la lecture a été interrompue.
 */
export async function replayEvents(
  events: MacroEvent[],
  bounds: RecorderBounds,
  controls: ReplayControls = {}
): Promise<boolean> {
  if (!initFfi()) return false
  const isAborted = controls.isAborted ?? ((): boolean => false)
  const isPaused = controls.isPaused ?? ((): boolean => false)
  const base = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
  // Résolution timer 1 ms le temps de la lecture : sans elle, chaque sleep
  // entre deux mouvements (~8 ms enregistrés) est arrondi à ~15,6 ms et le
  // curseur avance par à-coups.
  requestHighResTimers()
  try {
    return await replayLoop(events, bounds, controls, isAborted, isPaused, base)
  } finally {
    releaseHighResTimers()
  }
}

async function replayLoop(
  events: MacroEvent[],
  bounds: RecorderBounds,
  controls: ReplayControls,
  isAborted: () => boolean,
  isPaused: () => boolean,
  base: number
): Promise<boolean> {
  /** Horodatage visé de l'événement courant (corrige la dérive de setTimeout). */
  let nextAt = Date.now()
  let lastProgressAt = 0
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    nextAt += ev.delay
    const wait = nextAt - Date.now()
    if (wait > 0) await sleep(wait)
    if (isAborted()) return false
    // Pause : on attend sans rejouer, puis on rebase l'horloge de lecture
    // (le temps passé en pause ne doit pas être « rattrapé »).
    if (isPaused()) {
      while (isPaused() && !isAborted()) await sleep(60)
      if (isAborted()) return false
      nextAt = Date.now()
    }
    // Si la macro contient elle-même un Échap, GetAsyncKeyState ne distingue
    // pas notre injection d'un appui réel : on suspend le contrôle d'abandon
    // pour cet événement et pendant 500 ms après chaque Échap injecté.
    const isEscapeEvent = (ev.kind === 'keydown' || ev.kind === 'keyup') && ev.vk === VK_ESCAPE
    const escJustInjected = Date.now() - lastEscapeInjectedAt < 500
    if (!isEscapeEvent && !escJustInjected && escapePressed()) return false
    try {
      switch (ev.kind) {
        case 'keydown':
        case 'keyup':
          sendKey(ev.vk, ev.kind === 'keyup')
          break
        case 'move': {
          const { ax, ay } = ratioToAbsolute(ev.xRatio, ev.yRatio, bounds)
          sendMouse(ax, ay, MOUSEEVENTF_MOVE | base)
          break
        }
        case 'mousedown':
        case 'mouseup': {
          // Déplacement + bouton en un seul SendInput : position exacte du clic.
          const { ax, ay } = ratioToAbsolute(ev.xRatio, ev.yRatio, bounds)
          const flag =
            ev.kind === 'mousedown' ? BUTTON_DOWN_FLAG[ev.button] : BUTTON_UP_FLAG[ev.button]
          sendMouse(ax, ay, MOUSEEVENTF_MOVE | flag | base)
          break
        }
        case 'wheel': {
          // Replace d'abord le curseur (la molette agit sous le curseur).
          const { ax, ay } = ratioToAbsolute(ev.xRatio, ev.yRatio, bounds)
          sendMouse(ax, ay, MOUSEEVENTF_MOVE | base)
          sendMouse(0, 0, MOUSEEVENTF_WHEEL, ev.delta)
          break
        }
      }
    } catch (err) {
      console.warn('[macroPlayer] envoi échoué :', err)
    }
    if (controls.onProgress && Date.now() - lastProgressAt >= 100) {
      lastProgressAt = Date.now()
      controls.onProgress((i + 1) / events.length)
    }
  }
  controls.onProgress?.(1)
  return true
}
