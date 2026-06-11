/**
 * Hook clavier bas-niveau (WH_KEYBOARD_LL) pour la détection de fin de tour en combat,
 * et hook d'événements Windows (SetWinEventHook EVENT_SYSTEM_FLASH) pour détecter
 * le clignotement d'une fenêtre Dofus dans la barre des tâches (= tour de ce compte).
 *
 * WH_KEYBOARD_LL : observe la touche de fin de tour configurée (défaut F1) sans la
 * consommer. Si le mode combat est actif, bascule vers le compte suivant après le délai.
 *
 * SetWinEventHook (WINEVENT_OUTOFCONTEXT) : déclenché quand une fenêtre Dofus connue
 * clignote (tour disponible). Bascule vers ce compte si le mode combat est actif.
 * Pas de restriction UIPI pour les hooks out-of-context.
 *
 * Même architecture que mouseHook.ts (koffi, WH_*_LL, pompe de messages).
 */

import { isInCombat, notifyCombatActivity } from './combatState'
import { cycle, activateAccount } from './shortcuts'
import { getConfig } from './state'
import type { DetectedWindow } from '@shared/types'

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
const EVENT_SYSTEM_FLASH = 0x8005
const WINEVENT_SKIPOWNPROCESS = 0x0002
/** idObject = 0 = OBJID_WINDOW : c'est la fenêtre elle-même qui clignote. */
const OBJID_WINDOW = 0

type Fn = (...args: unknown[]) => unknown

let koffi: typeof import('koffi') | null = null
let started = false
let pumpTimer: NodeJS.Timeout | null = null
let switchTimer: NodeJS.Timeout | null = null

let hookProcCb: unknown = null
let hookHandle: unknown = null
let flashProcCb: unknown = null
let flashEventHook: unknown = null

let CallNextHookEx: Fn | null = null
let UnhookWindowsHookEx: Fn | null = null
let UnhookWinEvent: Fn | null = null
let PeekMessageW: Fn | null = null

/**
 * Fenêtres Dofus connues : handle → accountId (undefined si fenêtre non réconciliée).
 * Mis à jour par accountBar toutes les 5 s.
 */
let knownDofusWindows = new Map<number, string | undefined>()

export function updateDofusHandles(wins: DetectedWindow[]): void {
  knownDofusWindows = new Map(wins.map((w) => [w.handle, w.accountId]))
}

function resolveVk(key: string): number | null {
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

    // --- Keyboard hook (WH_KEYBOARD_LL) ---
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
    const GetModuleHandleW = kernel32.func('void* GetModuleHandleW(void*)') as unknown as Fn

    const PM_REMOVE = 0x0001

    const keyProc = (nCode: number, wParam: number, lParam: unknown): number => {
      try {
        if (Number(nCode) >= 0) {
          const msg = Number(wParam)
          if (msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN) {
            // KBDLLHOOKSTRUCT : vkCode est le premier DWORD (offset 0).
            const vkCode = Number(koffi!.decode(lParam, 0, 'uint32'))
            const cfg = getConfig()
            const targetVk = resolveVk(cfg.combat?.endTurnKey ?? 'F1')

            if (targetVk !== null && vkCode === targetVk && isInCombat()) {
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
      } catch {
        /* ignore — ne jamais bloquer le hook */
      }
      // Ne pas consommer la touche : Dofus la reçoit normalement.
      return Number(CallNextHookEx!(null, nCode, wParam, lParam))
    }

    hookProcCb = koffi.register(keyProc, koffi.pointer(HOOKPROC))
    const hInst = GetModuleHandleW(null)
    hookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, hookProcCb, hInst, 0)
    if (!hookHandle) throw new Error('SetWindowsHookExW échoué')

    // --- Flash event hook (SetWinEventHook EVENT_SYSTEM_FLASH) ---
    // WINEVENT_OUTOFCONTEXT (0) : le callback est appelé dans notre thread via la
    // pompe de messages — pas de restriction UIPI, fonctionne même si Dofus est
    // lancé en administrateur.
    const WINEVENTPROC = koffi.proto(
      'void WinEventProc(void* hHook, uint32 event, void* hwnd, int32 idObject, int32 idChild, uint32 idEventThread, uint32 dwmsEventTime)'
    )
    const SetWinEventHook = user32.func(
      'void* SetWinEventHook(uint32, uint32, void*, void*, uint32, uint32, uint32)'
    ) as unknown as Fn
    UnhookWinEvent = user32.func('bool UnhookWinEvent(void*)') as unknown as Fn

    const flashProc = (
      _hHook: unknown,
      _event: unknown,
      hwnd: unknown,
      idObject: unknown
    ): void => {
      try {
        if (Number(idObject) !== OBJID_WINDOW) return
        const handle = Number(hwnd)
        if (!knownDofusWindows.has(handle)) return
        if (!isInCombat()) return
        const accountId = knownDofusWindows.get(handle)
        if (!accountId) return
        setImmediate(() => {
          try {
            activateAccount(getConfig(), accountId)
          } catch {
            /* ignore */
          }
        })
      } catch {
        /* ignore */
      }
    }

    flashProcCb = koffi.register(flashProc, koffi.pointer(WINEVENTPROC))
    flashEventHook = SetWinEventHook(
      EVENT_SYSTEM_FLASH, EVENT_SYSTEM_FLASH,
      null, flashProcCb,
      0, 0,
      WINEVENT_SKIPOWNPROCESS // WINEVENT_OUTOFCONTEXT = 0 implicite
    )
    if (!flashEventHook) {
      console.warn('[keyboardHook] SetWinEventHook (flash) échoué — détection du clignotement désactivée')
    }

    // Pompe de messages : requise pour WH_KEYBOARD_LL et pour les callbacks
    // WINEVENT_OUTOFCONTEXT (tous deux livrés via la file de messages du thread).
    pumpTimer = setInterval(() => {
      try {
        const msg = Buffer.alloc(64)
        let guard = 0
        while (PeekMessageW!(msg, null, 0, 0, PM_REMOVE) && guard++ < 16) {
          /* draine la file */
        }
      } catch {
        /* ignore */
      }
    }, 5)

    started = true
    console.log('[keyboardHook] actif (clavier + flash)')
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
  try {
    if (flashEventHook && UnhookWinEvent) UnhookWinEvent(flashEventHook)
  } catch {
    /* ignore */
  }
  hookHandle = null
  flashEventHook = null
  started = false
}
