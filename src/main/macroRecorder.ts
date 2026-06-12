/**
 * Enregistreur de la macro rapide : hooks bas-niveau dédiés (WH_KEYBOARD_LL +
 * WH_MOUSE_LL via koffi, même architecture que keyboardHook.ts / mouseHook.ts,
 * avec sa propre pompe de messages) capturant :
 * - les touches (down/up) — y compris les modificateurs, ce qui permet les
 *   combinaisons Ctrl+clic, Échap, etc. ;
 * - les boutons souris gauche/droit/milieu en down/up SÉPARÉS (drags possibles) ;
 * - la molette (delta) ;
 * - les MOUVEMENTS de la souris, échantillonnés à ~60 Hz, à partir du premier
 *   clic (avant le premier clic, seuls touches/clics sont capturés) — pour
 *   reproduire fidèlement la trajectoire à la lecture.
 *
 * Les positions sont stockées en ratios relatifs aux bounds de la fenêtre
 * Dofus active au début de l'enregistrement, pour être rejouées sur des
 * fenêtres de géométrie différente. Le délai entre chaque événement est
 * mémorisé (plafonné à 2000 ms).
 *
 * Les événements ne sont JAMAIS consommés (CallNextHookEx systématique) : le
 * jeu les reçoit normalement pendant l'enregistrement. Filtres appliqués :
 * - la touche F12 (stop, down ET up) n'est jamais enregistrée ;
 * - les codes de `ignoreVks` (touche finale du raccourci de bascule) non plus ;
 * - les événements injectés (SendInput — lecture de macro) sont ignorés ;
 * - les clics/mouvements sur nos propres fenêtres (panneau macro, réglages…)
 *   sont ignorés (rects mis en cache, rafraîchis par la pompe : pas d'appel
 *   Electron dans le chemin chaud du hook) ;
 * - en PAUSE, rien n'est capturé (le chrono est suspendu).
 *
 * À l'arrêt, la séquence est assainie : keyups/mouseups orphelins et
 * keydowns/mousedowns sans relâchement correspondant sont retirés.
 */

import { BrowserWindow } from 'electron'

export interface MacroKeyEvent {
  kind: 'keydown' | 'keyup'
  vk: number
  /** Délai (ms) écoulé depuis l'événement précédent, plafonné à 2000. */
  delay: number
}

export type MacroMouseButton = 'left' | 'right' | 'middle'

export interface MacroButtonEvent {
  kind: 'mousedown' | 'mouseup'
  button: MacroMouseButton
  /** Position en ratio (0-1) des bounds de la fenêtre d'enregistrement. */
  xRatio: number
  yRatio: number
  delay: number
}

export interface MacroMoveEvent {
  kind: 'move'
  xRatio: number
  yRatio: number
  delay: number
}

export interface MacroWheelEvent {
  kind: 'wheel'
  /** Delta molette signé (multiples de 120 = WHEEL_DELTA). */
  delta: number
  xRatio: number
  yRatio: number
  delay: number
}

export type MacroEvent = MacroKeyEvent | MacroButtonEvent | MacroMoveEvent | MacroWheelEvent

/** Compteurs par type d'événement, remontés à l'UI. */
export interface RecorderCounts {
  total: number
  keys: number
  clicks: number
  moves: number
}

export interface RecorderBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RecorderOptions {
  /** Bounds de la fenêtre de référence (conversion des positions en ratios). */
  bounds: RecorderBounds
  /** Codes virtuels à ignorer (touche finale du raccourci de bascule). */
  ignoreVks: Set<number>
  /** Appelé au plus toutes les NOTIFY_MS (compteurs + durée), hors du hook. */
  onEvent: (counts: RecorderCounts, durationMs: number) => void
  /** Appelé quand l'enregistrement doit s'arrêter (F12 ou plafond atteint). */
  onStop: () => void
}

/** Plafond du délai mémorisé entre deux événements (ms). */
const MAX_DELAY_MS = 2000
/** Nombre maximal d'événements enregistrés (arrêt automatique au-delà). */
const MAX_EVENTS = 10000
/** Période d'échantillonnage des mouvements de souris (~60 Hz). */
const MOVE_SAMPLE_MS = 16
/** Période minimale entre deux notifications onEvent (UI). */
const NOTIFY_MS = 100
/** Période de rafraîchissement du cache des rects de nos fenêtres. */
const OWN_RECTS_REFRESH_MS = 500

const WH_KEYBOARD_LL = 13
const WH_MOUSE_LL = 14
const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101
const WM_SYSKEYDOWN = 0x0104
const WM_SYSKEYUP = 0x0105
const WM_MOUSEMOVE = 0x0200
const WM_LBUTTONDOWN = 0x0201
const WM_LBUTTONUP = 0x0202
const WM_RBUTTONDOWN = 0x0204
const WM_RBUTTONUP = 0x0205
const WM_MBUTTONDOWN = 0x0207
const WM_MBUTTONUP = 0x0208
const WM_MOUSEWHEEL = 0x020a
const PM_REMOVE = 0x0001
const VK_F12 = 0x7b
/** KBDLLHOOKSTRUCT.flags : événement injecté (SendInput). */
const LLKHF_INJECTED = 0x10
/** MSLLHOOKSTRUCT.flags : événement injecté (SendInput). */
const LLMHF_INJECTED = 0x01

const BUTTON_BY_MSG: Record<number, { button: MacroMouseButton; down: boolean }> = {
  [WM_LBUTTONDOWN]: { button: 'left', down: true },
  [WM_LBUTTONUP]: { button: 'left', down: false },
  [WM_RBUTTONDOWN]: { button: 'right', down: true },
  [WM_RBUTTONUP]: { button: 'right', down: false },
  [WM_MBUTTONDOWN]: { button: 'middle', down: true },
  [WM_MBUTTONUP]: { button: 'middle', down: false }
}

type Fn = (...args: unknown[]) => unknown

let koffi: typeof import('koffi') | null = null
let recording = false
let paused = false
let events: MacroEvent[] = []
let startedAt = 0
let lastEventAt = 0
/** Temps total passé en pause (exclu de la durée affichée). */
let pausedAccumMs = 0
let pausedAt = 0
let opts: RecorderOptions | null = null
let pumpTimer: NodeJS.Timeout | null = null
/** Compteurs incrémentaux (évite de re-parcourir `events` à chaque notification). */
let counts: RecorderCounts = { total: 0, keys: 0, clicks: 0, moves: 0 }
/** Les mouvements ne sont capturés qu'à partir du premier clic. */
let movesArmed = false
let lastMoveAt = 0
/** Horodatage de la dernière notification onEvent (throttle UI). */
let lastNotifyAt = 0
let notifyTimer: NodeJS.Timeout | null = null
/** Rects de nos propres fenêtres, mis en cache (pas d'appel Electron dans le hook). */
let ownRects: RecorderBounds[] = []
let pumpTicks = 0
/** Buffer MSG unique de la pompe (pas d'allocation toutes les 5 ms). */
const pumpMsgBuf = Buffer.alloc(64)

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

/** Durée d'enregistrement effective (pauses exclues). */
function effectiveDuration(): number {
  const pausedNow = paused ? Date.now() - pausedAt : 0
  return Math.max(0, Date.now() - startedAt - pausedAccumMs - pausedNow)
}

/** Recharge le cache des rects de nos fenêtres visibles (hors chemin du hook). */
function refreshOwnRects(): void {
  try {
    const rects: RecorderBounds[] = []
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isVisible()) continue
      rects.push(win.getBounds())
    }
    ownRects = rects
  } catch {
    /* ignore */
  }
}

/** true si le point écran tombe sur une de nos propres fenêtres (cache). */
function isOwnWindowPoint(px: number, py: number): boolean {
  for (const b of ownRects) {
    if (px >= b.x && px < b.x + b.width && py >= b.y && py < b.y + b.height) return true
  }
  return false
}

/** Notifie l'UI au plus toutes les NOTIFY_MS (coalescé, hors pile du hook). */
function scheduleNotify(): void {
  if (notifyTimer) return
  const wait = Math.max(0, NOTIFY_MS - (Date.now() - lastNotifyAt))
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    lastNotifyAt = Date.now()
    if (recording && opts) opts.onEvent({ ...counts }, effectiveDuration())
  }, wait)
}

function pushEvent(ev: MacroEvent): void {
  if (!recording || paused || !opts) return
  events.push(ev)
  counts.total = events.length
  if (ev.kind === 'keydown') counts.keys++
  else if (ev.kind === 'mousedown') counts.clicks++
  else if (ev.kind === 'move') counts.moves++
  scheduleNotify()
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
          // arrêt différé hors de la pile du hook. Fonctionne aussi en pause.
          if (isDown) setImmediate(() => opts?.onStop())
        } else if (!paused && (isDown || isUp) && !opts.ignoreVks.has(vk)) {
          pushEvent({ kind: isDown ? 'keydown' : 'keyup', vk, delay: nextDelay() })
        }
      }
    }
  } catch {
    /* ignore — ne jamais bloquer le hook */
  }
  return Number(CallNextHookEx!(null, nCode, wParam, lParam))
}

// --- Hook souris : boutons down/up, molette et mouvements (position → ratios). ---
function mouseProcImpl(nCode: number, wParam: number, lParam: unknown): number {
  try {
    if (Number(nCode) >= 0 && recording && !paused && opts) {
      const msg = Number(wParam)
      const isMove = msg === WM_MOUSEMOVE
      // Échantillonnage des mouvements : seulement après le premier clic, et au
      // plus un point toutes les MOVE_SAMPLE_MS — le hook reste ultra-léger.
      if (isMove) {
        if (!movesArmed) return Number(CallNextHookEx!(null, nCode, wParam, lParam))
        const now = Date.now()
        if (now - lastMoveAt < MOVE_SAMPLE_MS) {
          return Number(CallNextHookEx!(null, nCode, wParam, lParam))
        }
        lastMoveAt = now
      }
      const btn = BUTTON_BY_MSG[msg]
      const isWheel = msg === WM_MOUSEWHEEL
      if (isMove || isWheel || btn) {
        // MSLLHOOKSTRUCT : POINT pt (offsets 0 et 4), mouseData (8), flags (12).
        const px = Number(koffi!.decode(lParam, 0, 'int32'))
        const py = Number(koffi!.decode(lParam, 4, 'int32'))
        const flags = Number(koffi!.decode(lParam, 12, 'uint32'))
        // Ignore les événements injectés (lecture) et ceux sur nos propres
        // fenêtres (panneau macro, réglages, overlays…).
        if ((flags & LLMHF_INJECTED) === 0 && !isOwnWindowPoint(px, py)) {
          const b = opts.bounds
          const xRatio = b.width > 0 ? Math.min(1, Math.max(0, (px - b.x) / b.width)) : 0
          const yRatio = b.height > 0 ? Math.min(1, Math.max(0, (py - b.y) / b.height)) : 0
          if (btn) {
            if (btn.down) movesArmed = true
            pushEvent({
              kind: btn.down ? 'mousedown' : 'mouseup',
              button: btn.button,
              xRatio,
              yRatio,
              delay: nextDelay()
            })
          } else if (isWheel) {
            // mouseData : delta signé dans le mot de poids fort.
            const md = Number(koffi!.decode(lParam, 8, 'uint32'))
            const hi = (md >>> 16) & 0xffff
            const delta = hi >= 0x8000 ? hi - 0x10000 : hi
            pushEvent({ kind: 'wheel', delta, xRatio, yRatio, delay: nextDelay() })
          } else {
            pushEvent({ kind: 'move', xRatio, yRatio, delay: nextDelay() })
          }
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
 * - retire les keyups/mouseups sans down préalable (déjà enfoncé au départ) ;
 * - retire les keydowns/mousedowns sans relâchement correspondant
 *   (modificateurs Ctrl/Alt/Maj ou bouton encore enfoncés quand le stop est
 *   déclenché → touches/boutons « collés » à la lecture).
 * Le délai des événements retirés est reporté sur l'événement suivant.
 */
function sanitizeEvents(raw: MacroEvent[]): MacroEvent[] {
  const drop = new Set<number>()
  /** clé (vk ou bouton) → indices des downs encore « ouverts » (sans up). */
  const open = new Map<string, number[]>()
  const keyOf = (ev: MacroEvent): string =>
    ev.kind === 'keydown' || ev.kind === 'keyup' ? `k${ev.vk}` : `b${(ev as MacroButtonEvent).button}`
  raw.forEach((ev, i) => {
    if (ev.kind === 'keydown' || ev.kind === 'mousedown') {
      const stack = open.get(keyOf(ev)) ?? []
      stack.push(i)
      open.set(keyOf(ev), stack)
    } else if (ev.kind === 'keyup' || ev.kind === 'mouseup') {
      const stack = open.get(keyOf(ev))
      if (stack && stack.length > 0) stack.pop()
      else drop.add(i) // up orphelin
    }
  })
  for (const stack of open.values()) {
    for (const i of stack) drop.add(i) // down jamais relâché
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

/** Compteurs par type d'une séquence (après assainissement). */
export function countEvents(seq: MacroEvent[]): RecorderCounts {
  const c: RecorderCounts = { total: seq.length, keys: 0, clicks: 0, moves: 0 }
  for (const ev of seq) {
    if (ev.kind === 'keydown') c.keys++
    else if (ev.kind === 'mousedown') c.clicks++
    else if (ev.kind === 'move') c.moves++
  }
  return c
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
    counts = { total: 0, keys: 0, clicks: 0, moves: 0 }
    startedAt = Date.now()
    lastEventAt = startedAt
    paused = false
    pausedAccumMs = 0
    movesArmed = false
    lastMoveAt = 0
    lastNotifyAt = 0
    refreshOwnRects()

    const hInst = GetModuleHandleW!(null)
    keyHookHandle = SetWindowsHookExW!(WH_KEYBOARD_LL, keyProcCb, hInst, 0)
    if (!keyHookHandle) throw new Error('SetWindowsHookExW (clavier) a échoué')
    mouseHookHandle = SetWindowsHookExW!(WH_MOUSE_LL, mouseProcCb, hInst, 0)
    if (!mouseHookHandle) throw new Error('SetWindowsHookExW (souris) a échoué')

    // Pompe de messages : requise pour les hooks bas-niveau. Rafraîchit aussi
    // périodiquement le cache des rects de nos fenêtres.
    pumpTicks = 0
    pumpTimer = setInterval(() => {
      try {
        let guard = 0
        while (PeekMessageW!(pumpMsgBuf, null, 0, 0, PM_REMOVE) && guard++ < 16) {
          /* draine la file */
        }
        if (++pumpTicks % Math.round(OWN_RECTS_REFRESH_MS / 5) === 0) refreshOwnRects()
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

/** Suspend la capture (le chrono est gelé, rien n'est enregistré). */
export function pauseMacroRecording(): void {
  if (!recording || paused) return
  paused = true
  pausedAt = Date.now()
}

/** Reprend la capture après une pause (le temps de pause n'est pas compté). */
export function resumeMacroRecording(): void {
  if (!recording || !paused) return
  pausedAccumMs += Date.now() - pausedAt
  paused = false
  // Le délai du prochain événement repart de maintenant (pas de trou géant —
  // de toute façon plafonné à MAX_DELAY_MS).
  lastEventAt = Date.now()
}

export function isMacroRecordingPaused(): boolean {
  return paused
}

/** Durée effective (pauses exclues) du dernier enregistrement arrêté. */
let lastDurationMs = 0

export function getLastRecordingDuration(): number {
  return lastDurationMs
}

/**
 * Arrête l'enregistrement (désinstalle les hooks) et retourne les événements
 * assainis (cf. sanitizeEvents). Les callbacks koffi restent enregistrés pour
 * la session suivante.
 */
export function stopMacroRecording(): MacroEvent[] {
  if (recording) lastDurationMs = effectiveDuration()
  recording = false
  paused = false
  if (pumpTimer) {
    clearInterval(pumpTimer)
    pumpTimer = null
  }
  if (notifyTimer) {
    clearTimeout(notifyTimer)
    notifyTimer = null
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
