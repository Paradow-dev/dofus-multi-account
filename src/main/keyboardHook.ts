/**
 * Hook clavier bas-niveau (WH_KEYBOARD_LL) pour la détection de fin de tour en combat.
 *
 * Observe la touche de fin de tour configurée (défaut F1) sans la consommer :
 * la touche passe normalement à Dofus, et l'outil switche vers le compte suivant
 * après le délai configuré.
 *
 * N'agit que si le mode combat est actif (isInCombat()) ET qu'une fenêtre Dofus
 * connue est au premier plan.
 *
 * Même architecture que mouseHook.ts (koffi, WH_*_LL, pompe de messages).
 */

import { isInCombat, notifyCombatActivity } from './combatState'
import { cycle } from './shortcuts'
import { getConfig } from './state'

/** Correspondance touche Electron → code virtuel Windows. */
const VK_MAP: Record<string, number> = {
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73,
  F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77,
  F9: 0x78, F10: 0x79, F11: 0x7a, F12: 0x7b,
  Space: 0x20, Return: 0x0d, Escape: 0x1b, Tab: 0x09,
  A: 0x41, B: 0x42, C: 0x43, D: 0x44, E: 0x45, F: 0x46,
  G: 0x47, H: 0x48, I: 0x49, J: 0x4a, K: 0x4b, L: 0x4c,
  M: 0x4d, N: 0x4e, O: 0x4f, P: 0x50, Q: 0x51, R: 0x52,
  S: 0x53, T: 0x54, U: 0x55, V: 0x56, W: 0x57, X: 0x58,
  Y: 0x59, Z: 0x5a,
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39
}

const WH_KEYBOARD_LL = 13
const WM_KEYDOWN = 0x0100
const WM_SYSKEYDOWN = 0x0104

type Fn = (...args: unknown[]) => unknown

let koffi: typeof import('koffi') | null = null
let started = false
let pumpTimer: NodeJS.Timeout | null = null
let switchTimer: NodeJS.Timeout | null = null

let hookProcCb: unknown = null
let hookHandle: unknown = null

let CallNextHookEx: Fn | null = null
let UnhookWindowsHookEx: Fn | null = null
let PeekMessageW: Fn | null = null
let GetForegroundWindow: Fn | null = null

/** Handles des fenêtres Dofus connues (mis à jour par accountBar). */
let knownDofusHandles = new Set<number>()

export function updateDofusHandles(handles: Set<number>): void {
  knownDofusHandles = handles
}

function resolveVk(key: string): number | null {
  // Extrait le dernier token d'un accélérateur (ex. "Ctrl+F1" → "F1").
  const token = key.split('+').pop() ?? key
  return VK_MAP[token] ?? null
}

function loadKoffi(): boolean {
  if (koffi) return true
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    koffi = require('koffi')
    return true
  } catch {
    return false
  }
}

export function initKeyboardHook(): boolean {
  if (started) return true
  if (process.platform !== 'win32') return false
  if (!loadKoffi() || !koffi) return false

  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    const HOOKPROC = koffi.proto(
      'intptr_t LowLevelKeyboardProc(int32 nCode, uintptr_t wParam, void* lParam)'
    )

    const SetWindowsHookExW = user32.func(
      'void* SetWindowsHookExW(int32, void*, void*, uint32)'
    ) as unknown as Fn
    CallNextHookEx = user32.func(
      'intptr_t CallNextHookEx(void*, int32, uintptr_t, void*)'
    ) as unknown as Fn
    UnhookWindowsHookEx = user32.func('bool UnhookWindowsHookEx(void*)') as unknown as Fn
    PeekMessageW = user32.func(
      'bool PeekMessageW(void*, void*, uint32, uint32, uint32)'
    ) as unknown as Fn
    GetForegroundWindow = user32.func('void* GetForegroundWindow()') as unknown as Fn
    const GetModuleHandleW = kernel32.func('void* GetModuleHandleW(void*)') as unknown as Fn

    const PM_REMOVE = 0x0001

    const proc = (nCode: number, wParam: number, lParam: unknown): number => {
      try {
        if (Number(nCode) >= 0) {
          const msg = Number(wParam)
          if (msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN) {
            // KBDLLHOOKSTRUCT : vkCode est le premier DWORD (offset 0).
            const vkCode = Number(koffi!.decode(lParam, 0, 'uint32'))
            const cfg = getConfig()
            const targetVk = resolveVk(cfg.combat?.endTurnKey ?? 'F1')

            if (targetVk !== null && vkCode === targetVk && isInCombat()) {
              // Vérifie que la fenêtre au premier plan est une fenêtre Dofus connue.
              const fgHwnd = Number(GetForegroundWindow!())
              if (knownDofusHandles.size === 0 || knownDofusHandles.has(fgHwnd)) {
                notifyCombatActivity()
                const delay = cfg.combat?.switchDelay ?? 150
                if (switchTimer) clearTimeout(switchTimer)
                switchTimer = setTimeout(() => {
                  try {
                    cycle(getConfig(), 'next')
                  } catch {
                    /* ignore */
                  }
                }, delay)
              }
            }
          }
        }
      } catch {
        /* ignore — ne jamais bloquer le hook */
      }
      // Ne pas consommer la touche : Dofus la reçoit normalement.
      return Number(CallNextHookEx!(null, nCode, wParam, lParam))
    }

    hookProcCb = koffi.register(proc, koffi.pointer(HOOKPROC))
    const hInst = GetModuleHandleW(null)
    hookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, hookProcCb, hInst, 0)
    if (!hookHandle) throw new Error('SetWindowsHookExW échoué')

    pumpTimer = setInterval(() => {
      try {
        const msg = Buffer.alloc(64)
        let guard = 0
        while (PeekMessageW!(msg, null, 0, 0, PM_REMOVE) && guard++ < 16) {
          /* draine la file — le hook est déclenché par le système pendant la récupération */
        }
      } catch {
        /* ignore */
      }
    }, 5)

    started = true
    console.log('[keyboardHook] actif')
    return true
  } catch (err) {
    console.warn('[keyboardHook] initialisation échouée :', err)
    stopKeyboardHook()
    return false
  }
}

export function stopKeyboardHook(): void {
  if (pumpTimer) {
    clearInterval(pumpTimer)
    pumpTimer = null
  }
  if (switchTimer) {
    clearTimeout(switchTimer)
    switchTimer = null
  }
  try {
    if (hookHandle && UnhookWindowsHookEx) UnhookWindowsHookEx(hookHandle)
  } catch {
    /* ignore */
  }
  hookHandle = null
  started = false
}
