/**
 * Lecture de la macro rapide via SendInput (koffi).
 *
 * La structure Win32 INPUT (40 octets sur x64 : type uint32 + 4 de padding +
 * union dont MOUSEINPUT, 32 octets, est le plus grand membre) est modélisée par
 * deux layouts koffi de même taille totale : MACRO_INPUT_K (clavier) et
 * MACRO_INPUT_M (souris). SendInput est lié deux fois, une par layout.
 *
 * Les clics sont rejoués en coordonnées absolues normalisées 0-65535
 * (MOUSEEVENTF_ABSOLUTE), calculées à partir des bounds de la fenêtre cible et
 * des ratios enregistrés. La touche Échap (GetAsyncKeyState, sondée entre les
 * événements) interrompt la lecture.
 */

import type { MacroEvent, RecorderBounds } from './macroRecorder'

const INPUT_MOUSE = 0
const INPUT_KEYBOARD = 1
const KEYEVENTF_KEYUP = 0x0002
const MOUSEEVENTF_MOVE = 0x0001
const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const MOUSEEVENTF_RIGHTDOWN = 0x0008
const MOUSEEVENTF_RIGHTUP = 0x0010
const MOUSEEVENTF_ABSOLUTE = 0x8000
const SM_CXSCREEN = 0
const SM_CYSCREEN = 1
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** true si Échap est enfoncée (interruption de la lecture). */
function escapePressed(): boolean {
  try {
    return (Number(GetAsyncKeyState!(VK_ESCAPE)) & KEY_DOWN) !== 0
  } catch {
    return false
  }
}

function sendKey(vk: number, up: boolean): void {
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

function sendMouse(dx: number, dy: number, flags: number): void {
  SendInputM!(
    1,
    {
      type: INPUT_MOUSE,
      pad0: 0,
      dx,
      dy,
      mouseData: 0,
      dwFlags: flags,
      time: 0,
      dwExtraInfo: 0n
    },
    INPUT_SIZE
  )
}

/** Convertit une position écran (px) en coordonnées absolues 0-65535. */
function toAbsolute(px: number, py: number): { ax: number; ay: number } {
  const sw = Math.max(1, Number(GetSystemMetrics!(SM_CXSCREEN)))
  const sh = Math.max(1, Number(GetSystemMetrics!(SM_CYSCREEN)))
  return {
    ax: Math.round((px * 65535) / (sw - 1 || 1)),
    ay: Math.round((py * 65535) / (sh - 1 || 1))
  }
}

/** Rejoue un clic : déplacement absolu, courte pause, bouton down puis up. */
async function replayClick(
  xRatio: number,
  yRatio: number,
  button: 'left' | 'right',
  bounds: RecorderBounds
): Promise<void> {
  const px = Math.round(bounds.x + xRatio * bounds.width)
  const py = Math.round(bounds.y + yRatio * bounds.height)
  const { ax, ay } = toAbsolute(px, py)
  sendMouse(ax, ay, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)
  await sleep(30)
  sendMouse(ax, ay, (button === 'left' ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_RIGHTDOWN) | MOUSEEVENTF_ABSOLUTE)
  await sleep(20)
  sendMouse(ax, ay, (button === 'left' ? MOUSEEVENTF_LEFTUP : MOUSEEVENTF_RIGHTUP) | MOUSEEVENTF_ABSOLUTE)
}

/**
 * Rejoue la séquence d'événements sur la fenêtre cible (bounds = conversion
 * des ratios de clic). Respecte les délais enregistrés ; s'interrompt si Échap
 * est enfoncée ou si `isAborted()` devient vrai.
 * Retourne false si la lecture a été interrompue.
 */
export async function replayEvents(
  events: MacroEvent[],
  bounds: RecorderBounds,
  isAborted: () => boolean = () => false
): Promise<boolean> {
  if (!initFfi()) return false
  for (const ev of events) {
    if (ev.delay > 0) await sleep(ev.delay)
    if (isAborted() || escapePressed()) return false
    try {
      if (ev.kind === 'click') {
        await replayClick(ev.xRatio, ev.yRatio, ev.button, bounds)
      } else {
        sendKey(ev.vk, ev.kind === 'keyup')
      }
    } catch (err) {
      console.warn('[macroPlayer] envoi échoué :', err)
    }
  }
  return true
}
