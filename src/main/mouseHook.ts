/**
 * Raccourcis « souris » globaux via un hook bas-niveau Windows (WH_MOUSE_LL).
 *
 * `globalShortcut` d'Electron ne gère que le clavier. Pour permettre d'assigner
 * des boutons de souris (molette, boutons latéraux Retour/Avance) comme
 * raccourcis, on installe un hook souris bas-niveau qui observe les clics au
 * niveau système et déclenche l'action associée — éventuellement combiné à des
 * modificateurs (Ctrl/Alt/Shift/Super), lus via GetAsyncKeyState.
 *
 * Implémenté en FFI (koffi, binaires pré-compilés → pas de compilation native),
 * sur le même modèle que turnHook.ts. Tout est encapsulé dans des try/catch :
 * en cas d'échec, la fonctionnalité se désactive proprement.
 *
 * Seuls les boutons « non essentiels » sont captés (molette / latéraux) afin de
 * ne jamais détourner le clic gauche/droit normal. Quand un raccourci correspond,
 * l'événement est consommé (non transmis à l'application de premier plan).
 *
 * NOTE : non testé sous Windows au moment de l'écriture — prévu pour itération.
 */

export type MouseButton = 'middle' | 'back' | 'forward'

export interface MouseBinding {
  button: MouseButton
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  action: () => void
}

/** Jetons d'accélérateur reconnus pour les boutons souris. */
const MOUSE_BUTTON_TOKENS: Record<string, MouseButton> = {
  MouseMiddle: 'middle',
  MouseBack: 'back',
  MouseForward: 'forward'
}

/** Vrai si l'accélérateur cible un bouton souris (et non le clavier). */
export function isMouseAccelerator(accelerator: string): boolean {
  if (!accelerator) return false
  const last = accelerator.split('+').pop() ?? ''
  return last in MOUSE_BUTTON_TOKENS
}

/**
 * Parse un accélérateur souris (ex. "Ctrl+MouseBack") en bouton + modificateurs.
 * Retourne null si la chaîne ne décrit pas un bouton souris connu.
 */
export function parseMouseAccelerator(
  accelerator: string
): Omit<MouseBinding, 'action'> | null {
  const parts = accelerator.split('+')
  const token = parts.pop() ?? ''
  const button = MOUSE_BUTTON_TOKENS[token]
  if (!button) return null
  const mods = new Set(parts)
  return {
    button,
    ctrl: mods.has('Ctrl'),
    alt: mods.has('Alt'),
    shift: mods.has('Shift'),
    meta: mods.has('Super')
  }
}

let koffi: typeof import('koffi') | null = null

let bindings: MouseBinding[] = []
let started = false
let pumpTimer: NodeJS.Timeout | null = null

// Références maintenues en vie (sinon le GC peut libérer callback/handle).
let hookProcCb: unknown = null
let hookHandle: unknown = null

type Fn = (...args: unknown[]) => unknown
let CallNextHookEx: Fn | null = null
let UnhookWindowsHookEx: Fn | null = null
let PeekMessageW: Fn | null = null
let GetAsyncKeyState: Fn | null = null

const WH_MOUSE_LL = 14
const WM_MBUTTONDOWN = 0x0207
const WM_XBUTTONDOWN = 0x020b
const XBUTTON1 = 0x0001 // bouton latéral « Précédent »
const XBUTTON2 = 0x0002 // bouton latéral « Suivant »
const PM_REMOVE = 0x0001

// Codes touches virtuelles pour la lecture des modificateurs.
const VK_SHIFT = 0x10
const VK_CONTROL = 0x11
const VK_MENU = 0x12 // Alt
const VK_LWIN = 0x5b
const VK_RWIN = 0x5c
const KEY_DOWN = 0x8000

function loadKoffi(): boolean {
  if (koffi) return true
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    koffi = require('koffi')
    return true
  } catch (err) {
    console.warn('[mouseHook] koffi indisponible :', err)
    return false
  }
}

function isDown(vk: number): boolean {
  try {
    return (Number(GetAsyncKeyState!(vk)) & KEY_DOWN) !== 0
  } catch {
    return false
  }
}

/** Trouve et déclenche le binding correspondant au bouton + modificateurs courants. */
function handleButton(button: MouseButton): boolean {
  const ctrl = isDown(VK_CONTROL)
  const alt = isDown(VK_MENU)
  const shift = isDown(VK_SHIFT)
  const meta = isDown(VK_LWIN) || isDown(VK_RWIN)

  const match = bindings.find(
    (b) =>
      b.button === button &&
      b.ctrl === ctrl &&
      b.alt === alt &&
      b.shift === shift &&
      b.meta === meta
  )
  if (!match) return false
  try {
    match.action()
  } catch (err) {
    console.warn('[mouseHook] action a échoué :', err)
  }
  return true
}

function start(): boolean {
  if (started) return true
  if (process.platform !== 'win32') return false
  if (!loadKoffi() || !koffi) return false

  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    // lParam est un pointeur (vers MSLLHOOKSTRUCT) : on le garde en `void*` pour
    // éviter toute perte de précision sur une adresse 64 bits.
    const HOOKPROC = koffi.proto(
      'intptr_t LowLevelMouseProc(int32 nCode, uintptr_t wParam, void* lParam)'
    )

    const SetWindowsHookExW = user32.func(
      'void* SetWindowsHookExW(int32, void*, void*, uint32)'
    ) as unknown as Fn
    CallNextHookEx = user32.func(
      'intptr_t CallNextHookEx(void*, int32, uintptr_t, void*)'
    ) as unknown as Fn
    UnhookWindowsHookEx = user32.func('bool UnhookWindowsHookEx(void*)') as unknown as Fn
    PeekMessageW = user32.func('bool PeekMessageW(void*, void*, uint32, uint32, uint32)') as unknown as Fn
    GetAsyncKeyState = user32.func('int16 GetAsyncKeyState(int32)') as unknown as Fn
    const GetModuleHandleW = kernel32.func('void* GetModuleHandleW(void*)') as unknown as Fn

    const proc = (nCode: number, wParam: number, lParam: unknown): number => {
      let swallow = false
      try {
        if (Number(nCode) >= 0) {
          const msg = Number(wParam)
          if (msg === WM_MBUTTONDOWN) {
            swallow = handleButton('middle')
          } else if (msg === WM_XBUTTONDOWN) {
            // MSLLHOOKSTRUCT : champ DWORD `mouseData` à l'offset 8 (après POINT pt).
            // Le bouton X est codé dans le mot de poids fort.
            const mouseData = Number(koffi!.decode(lParam, 8, 'uint32'))
            const which = (mouseData >>> 16) & 0xffff
            if (which === XBUTTON1) swallow = handleButton('back')
            else if (which === XBUTTON2) swallow = handleButton('forward')
          }
        }
      } catch {
        /* ignore — on laisse passer l'événement */
      }
      if (swallow) return 1 // consomme l'événement (non transmis au premier plan)
      return Number(CallNextHookEx!(null, nCode, wParam, lParam))
    }
    hookProcCb = koffi.register(proc, koffi.pointer(HOOKPROC))

    const hInst = GetModuleHandleW(null)
    hookHandle = SetWindowsHookExW(WH_MOUSE_LL, hookProcCb, hInst, 0)
    if (!hookHandle) throw new Error('SetWindowsHookExW a échoué')

    // Pompe de messages : les hooks bas-niveau exigent que le thread traite des
    // messages. Intervalle court pour une latence faible sur le clic.
    pumpTimer = setInterval(() => {
      try {
        const msg = Buffer.alloc(64)
        let guard = 0
        while (PeekMessageW!(msg, null, 0, 0, PM_REMOVE) && guard++ < 16) {
          /* on draine, le hook est appelé par le système pendant la récupération */
        }
      } catch {
        /* ignore */
      }
    }, 5)

    started = true
    console.log('[mouseHook] actif')
    return true
  } catch (err) {
    console.warn('[mouseHook] initialisation échouée :', err)
    stop()
    return false
  }
}

function stop(): void {
  if (pumpTimer) {
    clearInterval(pumpTimer)
    pumpTimer = null
  }
  try {
    if (hookHandle && UnhookWindowsHookEx) UnhookWindowsHookEx(hookHandle)
  } catch {
    /* ignore */
  }
  hookHandle = null
  started = false
}

/**
 * Définit la liste des raccourcis souris actifs. Démarre le hook si la liste
 * est non vide, l'arrête sinon. Retourne true si le hook est actif (ou inutile).
 */
export function setMouseBindings(next: MouseBinding[]): boolean {
  bindings = next
  if (next.length === 0) {
    stop()
    return true
  }
  return start()
}

export function stopMouseHook(): void {
  bindings = []
  stop()
}

export function isMouseHookActive(): boolean {
  return started
}
