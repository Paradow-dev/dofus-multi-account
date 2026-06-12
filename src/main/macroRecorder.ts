/**
 * Enregistreur de la macro rapide : hooks bas-niveau dédiés (WH_KEYBOARD_LL +
 * WH_MOUSE_LL via koffi, même architecture que keyboardHook.ts / mouseHook.ts,
 * avec sa propre pompe de messages) capturant touches (down/up) et clics
 * gauche/droit, avec le délai entre chaque événement (plafonné à 2000 ms).
 *
 * Les positions de clic sont stockées en ratios relatifs aux bounds de la
 * fenêtre Dofus active au début de l'enregistrement, pour être rejouées sur
 * des fenêtres de géométrie différente.
 *
 * Les événements ne sont JAMAIS consommés (CallNextHookEx systématique) : le
 * jeu les reçoit normalement pendant l'enregistrement. Filtres appliqués :
 * - la touche F12 (stop, down ET up) n'est jamais enregistrée ;
 * - les codes de `ignoreVks` (touche finale du raccourci de bascule) non plus ;
 * - les événements injectés (SendInput — lecture de macro) sont ignorés ;
 * - les clics sur nos propres fenêtres (panneau macro, réglages…) sont ignorés.
 *
 * À l'arrêt, la séquence est assainie : keyups orphelins et keydowns sans
 * keyup correspondant (modificateurs « collés » au moment du stop) sont retirés.
 */

import { BrowserWindow } from 'electron'

export interface MacroKeyEvent {
  kind: 'keydown' | 'keyup'
  vk: number
  /** Délai (ms) écoulé depuis l'événement précédent, plafonné à 2000. */
  delay: number
}

export interface MacroClickEvent {
  kind: 'click'
  button: 'left' | 'right'
  /** Position du clic en ratio (0-1) des bounds de la fenêtre d'enregistrement. */
  xRatio: number
  yRatio: number
  delay: number
}

export type MacroEvent = MacroKeyEvent | MacroClickEvent

export interface RecorderBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RecorderOptions {
  /** Bounds de la fenêtre de référence (conversion des clics en ratios). */
  bounds: RecorderBounds
  /** Codes virtuels à ignorer (touche finale du raccourci de bascule). */
  ignoreVks: Set<number>
  /** Appelé après chaque événement capturé (compteur + durée), hors du hook. */
  onEvent: (count: number, durationMs: number) => void
  /** Appelé quand l'enregistrement doit s'arrêter (F12 ou plafond atteint). */
  onStop: () => void
}

/** Plafond du délai mémorisé entre deux événements (ms). */
const MAX_DELAY_MS = 2000
/** Nombre maximal d'événements enregistrés (arrêt automatique au-delà). */
const MAX_EVENTS = 500

const WH_KEYBOARD_LL = 13
const WH_MOUSE_LL = 14
const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101
const WM_SYSKEYDOWN = 0x0104
const WM_SYSKEYUP = 0x0105
const WM_LBUTTONDOWN = 0x0201
const WM_RBUTTONDOWN = 0x0204
const PM_REMOVE = 0x0001
const VK_F12 = 0x7b
/** KBDLLHOOKSTRUCT.flags : événement injecté (SendInput). */
const LLKHF_INJECTED = 0x10
/** MSLLHOOKSTRUCT.flags : événement injecté (SendInput). */
const LLMHF_INJECTED = 0x01

type Fn = (...args: unknown[]) => unknown

let koffi: typeof import('koffi') | null = null
let recording = false
let events: MacroEvent[] = []
let startedAt = 0
let lastEventAt = 0
let opts: RecorderOptions | null = null
let pumpTimer: NodeJS.Timeout | null = null
/** Notification onEvent en attente (coalescée hors de la pile du hook). */
let notifyScheduled = false

// Callbacks koffi enregistrés UNE SEULE FOIS et réutilisés à chaque session :
// koffi.register sans unregister fuit, et les hooks sont posés/retirés souvent.
let keyProcCb: unknown = null
let keyHookHandle: unknown = null
let mouseProcCb: unknown = null
let mouseHookHandle: unknown = null

let CallNextHookEx: Fn | null = null
let UnhookWindowsHookEx: Fn | null = null
let PeekMessageW: Fn | null = null
let SetWindowsHookExW: Fn | null = null
let GetModuleHandleW: Fn | null = null
let hookProto: unknown = null

function loadKoffi(): boolean {
  if (koffi) return true
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    koffi = require('koffi')
    return true
  } catch (err) {
    console.warn('[macroRecorder] koffi indisponible :', err)
    return false
  }
}

/** Délai depuis l'événement précédent (0 pour le premier), plafonné. */
function nextDelay(): number {
  const now = Date.now()
  const delay = events.length === 0 ? 0 : Math.min(MAX_DELAY_MS, now - lastEventAt)
  lastEventAt = now
  return delay
}

/** true si le point écran tombe sur une de nos propres fenêtres visibles. */
function isOwnWindowPoint(px: number, py: number): boolean {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isVisible()) continue
      const b = win.getBounds()
      if (px >= b.x && px < b.x + b.width && py >= b.y && py < b.y + b.height) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

function pushEvent(ev: MacroEvent): void {
  if (!recording || !opts) return
  events.push(ev)
  // Pas de travail lourd (IPC, rendu) dans la pile du hook : la notification
  // est différée et coalescée via setImmediate.
  if (!notifyScheduled) {
    notifyScheduled = true
    setImmediate(() => {
      notifyScheduled = false
      if (recording && opts) opts.onEvent(events.length, Date.now() - startedAt)
    })
  }
  if (events.length >= MAX_EVENTS) {
    // Plafond atteint : on demande l'arrêt hors de la pile du hook.
    setImmediate(() => opts?.onStop())
  }
}

// --- Hook clavier : capture down/up, sans consommer. ---
function keyProcImpl(nCode: number, wParam: number, lParam: unknown): number {
  try {
    if (Number(nCode) >= 0 && recording && opts) {
      const msg = Number(wParam)
      // KBDLLHOOKSTRUCT : vkCode (offset 0) puis scanCode (4) puis flags (8).
      const vk = Number(koffi!.decode(lParam, 0, 'uint32'))
      const flags = Number(koffi!.decode(lParam, 8, 'uint32'))
      const isDown = msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN
      const isUp = msg === WM_KEYUP || msg === WM_SYSKEYUP
      // On n'enregistre pas les événements injectés (lecture de macro).
      if ((flags & LLKHF_INJECTED) === 0) {
        if (vk === VK_F12) {
          // F12 = stop : ni le down ni le up ne sont enregistrés,
          // arrêt différé hors de la pile du hook.
          if (isDown) setImmediate(() => opts?.onStop())
        } else if ((isDown || isUp) && !opts.ignoreVks.has(vk)) {
          pushEvent({ kind: isDown ? 'keydown' : 'keyup', vk, delay: nextDelay() })
        }
      }
    }
  } catch {
    /* ignore — ne jamais bloquer le hook */
  }
  return Number(CallNextHookEx!(null, nCode, wParam, lParam))
}

// --- Hook souris : capture les clics gauche/droit (position → ratios). ---
function mouseProcImpl(nCode: number, wParam: number, lParam: unknown): number {
  try {
    if (Number(nCode) >= 0 && recording && opts) {
      const msg = Number(wParam)
      if (msg === WM_LBUTTONDOWN || msg === WM_RBUTTONDOWN) {
        // MSLLHOOKSTRUCT : POINT pt (offsets 0 et 4), mouseData (8), flags (12).
        const px = Number(koffi!.decode(lParam, 0, 'int32'))
        const py = Number(koffi!.decode(lParam, 4, 'int32'))
        const flags = Number(koffi!.decode(lParam, 12, 'uint32'))
        // Ignore les clics injectés (lecture) et ceux sur nos propres fenêtres
        // (panneau macro, réglages, overlays…).
        if ((flags & LLMHF_INJECTED) === 0 && !isOwnWindowPoint(px, py)) {
          const b = opts.bounds
          const xRatio = b.width > 0 ? (px - b.x) / b.width : 0
          const yRatio = b.height > 0 ? (py - b.y) / b.height : 0
          pushEvent({
            kind: 'click',
            button: msg === WM_LBUTTONDOWN ? 'left' : 'right',
            xRatio: Math.min(1, Math.max(0, xRatio)),
            yRatio: Math.min(1, Math.max(0, yRatio)),
            delay: nextDelay()
          })
        }
      }
    }
  } catch {
    /* ignore — on laisse passer l'événement */
  }
  return Number(CallNextHookEx!(null, nCode, wParam, lParam))
}

/** Charge les fonctions Win32 et enregistre les callbacks une seule fois. */
function initFfi(): boolean {
  if (hookProto) return true
  if (!loadKoffi() || !koffi) return false
  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    hookProto = koffi.proto(
      'intptr_t MacroRecorderHookProc(int32 nCode, uintptr_t wParam, void* lParam)'
    )
    SetWindowsHookExW = user32.func(
      'void* SetWindowsHookExW(int32, void*, void*, uint32)'
    ) as unknown as Fn
    CallNextHookEx = user32.func(
      'intptr_t CallNextHookEx(void*, int32, uintptr_t, void*)'
    ) as unknown as Fn
    UnhookWindowsHookEx = user32.func('bool UnhookWindowsHookEx(void*)') as unknown as Fn
    PeekMessageW = user32.func(
      'bool PeekMessageW(void*, void*, uint32, uint32, uint32)'
    ) as unknown as Fn
    GetModuleHandleW = kernel32.func('void* GetModuleHandleW(void*)') as unknown as Fn
    // Enregistrés une fois pour toutes (réutilisés à chaque session) : évite la
    // fuite de koffi.register répété, même approche que keyboardHook.ts.
    keyProcCb = koffi.register(keyProcImpl, koffi.pointer(hookProto as never))
    mouseProcCb = koffi.register(mouseProcImpl, koffi.pointer(hookProto as never))
    return true
  } catch (err) {
    console.warn('[macroRecorder] chargement FFI échoué :', err)
    hookProto = null
    return false
  }
}

/**
 * Assainit la séquence enregistrée :
 * - retire les keyups sans keydown préalable (touche déjà enfoncée au départ) ;
 * - retire les keydowns sans keyup correspondant (modificateurs Ctrl/Alt/Maj
 *   encore enfoncés quand le raccourci de stop est déclenché → touches
 *   « collées » à la lecture).
 * Le délai des événements retirés est reporté sur l'événement suivant.
 */
function sanitizeEvents(raw: MacroEvent[]): MacroEvent[] {
  const drop = new Set<number>()
  /** vk → indices des keydowns encore « ouverts » (sans keyup). */
  const open = new Map<number, number[]>()
  raw.forEach((ev, i) => {
    if (ev.kind === 'keydown') {
      const stack = open.get(ev.vk) ?? []
      stack.push(i)
      open.set(ev.vk, stack)
    } else if (ev.kind === 'keyup') {
      const stack = open.get(ev.vk)
      if (stack && stack.length > 0) stack.pop()
      else drop.add(i) // keyup orphelin
    }
  })
  for (const stack of open.values()) {
    for (const i of stack) drop.add(i) // keydown jamais relâché
  }
  if (drop.size === 0) return raw

  const out: MacroEvent[] = []
  let carry = 0
  raw.forEach((ev, i) => {
    if (drop.has(i)) {
      carry = Math.min(MAX_DELAY_MS, carry + ev.delay)
      return
    }
    out.push({ ...ev, delay: Math.min(MAX_DELAY_MS, ev.delay + carry) })
    carry = 0
  })
  return out
}

/**
 * Démarre l'enregistrement. Retourne false si les hooks n'ont pas pu être
 * installés (hors Windows, koffi indisponible…).
 */
export function startMacroRecording(options: RecorderOptions): boolean {
  if (recording) return true
  if (process.platform !== 'win32') return false
  if (!initFfi() || !koffi) return false

  try {
    opts = options
    events = []
    startedAt = Date.now()
    lastEventAt = startedAt

    const hInst = GetModuleHandleW!(null)
    keyHookHandle = SetWindowsHookExW!(WH_KEYBOARD_LL, keyProcCb, hInst, 0)
    if (!keyHookHandle) throw new Error('SetWindowsHookExW (clavier) a échoué')
    mouseHookHandle = SetWindowsHookExW!(WH_MOUSE_LL, mouseProcCb, hInst, 0)
    if (!mouseHookHandle) throw new Error('SetWindowsHookExW (souris) a échoué')

    // Pompe de messages : requise pour les hooks bas-niveau.
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

    recording = true
    console.log('[macroRecorder] enregistrement démarré')
    return true
  } catch (err) {
    console.warn('[macroRecorder] initialisation échouée :', err)
    stopMacroRecording()
    return false
  }
}

/**
 * Arrête l'enregistrement (désinstalle les hooks) et retourne les événements
 * assainis (cf. sanitizeEvents). Les callbacks koffi restent enregistrés pour
 * la session suivante.
 */
export function stopMacroRecording(): MacroEvent[] {
  recording = false
  if (pumpTimer) {
    clearInterval(pumpTimer)
    pumpTimer = null
  }
  try {
    if (keyHookHandle && UnhookWindowsHookEx) UnhookWindowsHookEx(keyHookHandle)
  } catch {
    /* ignore */
  }
  try {
    if (mouseHookHandle && UnhookWindowsHookEx) UnhookWindowsHookEx(mouseHookHandle)
  } catch {
    /* ignore */
  }
  keyHookHandle = null
  mouseHookHandle = null
  opts = null
  const result = sanitizeEvents(events)
  events = []
  return result
}
