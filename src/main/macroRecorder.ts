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
 * jeu les reçoit normalement pendant l'enregistrement. La touche F12 (stop) et
 * la touche finale du raccourci de bascule ne sont pas enregistrées.
 */

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
  /** Codes virtuels à ignorer (F12 + touche finale du raccourci de bascule). */
  ignoreVks: Set<number>
  /** Appelé après chaque événement capturé (compteur + durée). */
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

type Fn = (...args: unknown[]) => unknown

let koffi: typeof import('koffi') | null = null
let recording = false
let events: MacroEvent[] = []
let startedAt = 0
let lastEventAt = 0
let opts: RecorderOptions | null = null
let pumpTimer: NodeJS.Timeout | null = null

// Références maintenues en vie (sinon le GC peut libérer callback/handle).
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

/** Charge les fonctions Win32 une seule fois (les types koffi nommés sont uniques). */
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
    return true
  } catch (err) {
    console.warn('[macroRecorder] chargement FFI échoué :', err)
    hookProto = null
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

function pushEvent(ev: MacroEvent): void {
  if (!recording || !opts) return
  events.push(ev)
  opts.onEvent(events.length, Date.now() - startedAt)
  if (events.length >= MAX_EVENTS) {
    // Plafond atteint : on demande l'arrêt hors de la pile du hook.
    setImmediate(() => opts?.onStop())
  }
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

    // --- Hook clavier : capture down/up, sans consommer. ---
    const keyProc = (nCode: number, wParam: number, lParam: unknown): number => {
      try {
        if (Number(nCode) >= 0 && recording) {
          const msg = Number(wParam)
          // KBDLLHOOKSTRUCT : vkCode est le premier DWORD (offset 0).
          const vk = Number(koffi!.decode(lParam, 0, 'uint32'))
          const isDown = msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN
          const isUp = msg === WM_KEYUP || msg === WM_SYSKEYUP
          if (isDown && vk === VK_F12) {
            // F12 = stop : non enregistré, arrêt différé hors de la pile du hook.
            setImmediate(() => opts?.onStop())
          } else if ((isDown || isUp) && !opts!.ignoreVks.has(vk)) {
            pushEvent({ kind: isDown ? 'keydown' : 'keyup', vk, delay: nextDelay() })
          }
        }
      } catch {
        /* ignore — ne jamais bloquer le hook */
      }
      return Number(CallNextHookEx!(null, nCode, wParam, lParam))
    }
    keyProcCb = koffi.register(keyProc, koffi.pointer(hookProto as never))

    // --- Hook souris : capture les clics gauche/droit (position → ratios). ---
    const mouseProc = (nCode: number, wParam: number, lParam: unknown): number => {
      try {
        if (Number(nCode) >= 0 && recording) {
          const msg = Number(wParam)
          if (msg === WM_LBUTTONDOWN || msg === WM_RBUTTONDOWN) {
            // MSLLHOOKSTRUCT : POINT pt = deux LONG aux offsets 0 et 4.
            const px = Number(koffi!.decode(lParam, 0, 'int32'))
            const py = Number(koffi!.decode(lParam, 4, 'int32'))
            const b = opts!.bounds
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
      } catch {
        /* ignore — on laisse passer l'événement */
      }
      return Number(CallNextHookEx!(null, nCode, wParam, lParam))
    }
    mouseProcCb = koffi.register(mouseProc, koffi.pointer(hookProto as never))

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

/** Arrête l'enregistrement (désinstalle les hooks) et retourne les événements. */
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
  keyProcCb = null
  mouseProcCb = null
  opts = null
  const result = events
  events = []
  return result
}

export function isMacroRecording(): boolean {
  return recording
}
