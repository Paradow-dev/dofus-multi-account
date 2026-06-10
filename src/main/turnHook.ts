/**
 * Détection de « tour de jeu » par flash de fenêtre.
 *
 * Quand c'est le tour d'un personnage et que sa fenêtre est en arrière-plan,
 * Dofus fait clignoter (FlashWindowEx) sa fenêtre dans la barre des tâches.
 * Windows notifie ce flash aux fenêtres enregistrées via RegisterShellHookWindow
 * (message SHELLHOOK, code HSHELL_FLASH). On capte ce signal et on remonte le
 * handle de la fenêtre qui flashe.
 *
 * Implémenté en FFI (koffi, binaires pré-compilés → pas de compilation native).
 * Tout est encapsulé dans des try/catch : si quoi que ce soit échoue, la
 * fonctionnalité se désactive proprement sans impacter le reste de l'app.
 *
 * NOTE : non testé sous Windows au moment de l'écriture — prévu pour itération.
 */

let koffi: typeof import('koffi') | null = null

let started = false
let pumpTimer: NodeJS.Timeout | null = null
let onFlashCb: ((handle: number) => void) | null = null

// Références maintenues en vie (sinon le GC peut libérer callback/buffers).
let wndProcCb: unknown = null
let classNameBuf: Buffer | null = null
let createdHwnd: unknown = null
let shellMsgId = 0

// Fonctions natives résolues
type Fn = (...args: unknown[]) => unknown
let DefWindowProcW: Fn | null = null
let PeekMessageW: Fn | null = null
let DispatchMessageW: Fn | null = null
let DeregisterShellHookWindow: Fn | null = null
let DestroyWindow: Fn | null = null

const HSHELL_FLASH = 0x8006
const PM_REMOVE = 0x0001

/** Encode une chaîne en UTF-16LE terminée par un nul (LPCWSTR), sans nul littéral en source. */
function wstr(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, 'utf16le'), Buffer.from([0, 0])])
}

function loadKoffi(): boolean {
  if (koffi) return true
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    koffi = require('koffi')
    return true
  } catch (err) {
    console.warn('[turnHook] koffi indisponible :', err)
    return false
  }
}

/**
 * Démarre le hook. `onFlash(handle)` est appelé avec le HWND de la fenêtre qui
 * flashe. Retourne true si le hook est actif.
 */
export function startTurnHook(onFlash: (handle: number) => void): boolean {
  onFlashCb = onFlash
  if (started) return true
  if (process.platform !== 'win32') return false
  if (!loadKoffi() || !koffi) return false

  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    koffi.struct('POINT', { x: 'int32', y: 'int32' })
    koffi.struct('MSG', {
      hwnd: 'void*',
      message: 'uint32',
      wParam: 'uintptr_t',
      lParam: 'intptr_t',
      time: 'uint32',
      pt: 'POINT',
      lPrivate: 'uint32'
    })
    koffi.struct('WNDCLASSEXW', {
      cbSize: 'uint32',
      style: 'uint32',
      lpfnWndProc: 'void*',
      cbClsExtra: 'int32',
      cbWndExtra: 'int32',
      hInstance: 'void*',
      hIcon: 'void*',
      hCursor: 'void*',
      hbrBackground: 'void*',
      lpszMenuName: 'void*',
      lpszClassName: 'void*',
      hIconSm: 'void*'
    })
    const WNDPROC = koffi.proto(
      'intptr_t WndProc(void* hwnd, uint32 msg, uintptr_t wParam, intptr_t lParam)'
    )

    const RegisterClassExW = user32.func('uint16 RegisterClassExW(WNDCLASSEXW* cls)') as unknown as Fn
    const CreateWindowExW = user32.func(
      'void* CreateWindowExW(uint32, void*, void*, uint32, int, int, int, int, void*, void*, void*, void*)'
    ) as unknown as Fn
    const RegisterShellHookWindow = user32.func('bool RegisterShellHookWindow(void*)') as unknown as Fn
    const RegisterWindowMessageW = user32.func('uint32 RegisterWindowMessageW(void*)') as unknown as Fn
    const GetModuleHandleW = kernel32.func('void* GetModuleHandleW(void*)') as unknown as Fn
    DefWindowProcW = user32.func('intptr_t DefWindowProcW(void*, uint32, uintptr_t, intptr_t)') as unknown as Fn
    PeekMessageW = user32.func('bool PeekMessageW(_Out_ MSG*, void*, uint32, uint32, uint32)') as unknown as Fn
    DispatchMessageW = user32.func('intptr_t DispatchMessageW(MSG*)') as unknown as Fn
    DeregisterShellHookWindow = user32.func('bool DeregisterShellHookWindow(void*)') as unknown as Fn
    DestroyWindow = user32.func('bool DestroyWindow(void*)') as unknown as Fn

    // WndProc : relaie HSHELL_FLASH puis délègue au traitement par défaut.
    const wndProc = (hwnd: unknown, msg: number, wParam: number, lParam: number): number => {
      try {
        if (shellMsgId && msg === shellMsgId && Number(wParam) === HSHELL_FLASH) {
          const handle = Number(lParam)
          if (handle && onFlashCb) onFlashCb(handle)
        }
      } catch {
        /* ignore */
      }
      return Number(DefWindowProcW!(hwnd, msg, wParam, lParam))
    }
    wndProcCb = koffi.register(wndProc, koffi.pointer(WNDPROC))

    classNameBuf = wstr('DofusMultiAccountTurnHook')
    const hInst = GetModuleHandleW(null)

    const atom = RegisterClassExW({
      cbSize: koffi.sizeof('WNDCLASSEXW'),
      style: 0,
      lpfnWndProc: wndProcCb,
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance: hInst,
      hIcon: null,
      hCursor: null,
      hbrBackground: null,
      lpszMenuName: null,
      lpszClassName: classNameBuf,
      hIconSm: null
    })
    if (!atom) throw new Error('RegisterClassExW a échoué')

    createdHwnd = CreateWindowExW(0, classNameBuf, classNameBuf, 0, 0, 0, 0, 0, null, null, hInst, null)
    if (!createdHwnd) throw new Error('CreateWindowExW a échoué')

    shellMsgId = Number(RegisterWindowMessageW(wstr('SHELLHOOK')))

    // UIPI : autorise la réception du message SHELLHOOK même si une fenêtre
    // émettrice tourne à un niveau d'intégrité différent (ex. Dofus en admin).
    // Best-effort : indisponible avant Win7 / peut échouer sans conséquence.
    try {
      const ChangeWindowMessageFilterEx = user32.func(
        'bool ChangeWindowMessageFilterEx(void*, uint32, uint32, void*)'
      ) as unknown as Fn
      const MSGFLT_ALLOW = 1
      ChangeWindowMessageFilterEx(createdHwnd, shellMsgId, MSGFLT_ALLOW, null)
    } catch (err) {
      console.warn('[turnHook] ChangeWindowMessageFilterEx indisponible :', err)
    }

    const ok = RegisterShellHookWindow(createdHwnd)
    if (!ok) throw new Error('RegisterShellHookWindow a échoué')

    // Pompe de messages : draine TOUTE la file du thread (hWnd = NULL) et
    // dispatche vers WndProc. Filtrer sur createdHwnd pouvait laisser passer
    // certains messages SHELLHOOK à côté ; on draine donc sans filtre.
    pumpTimer = setInterval(() => {
      try {
        const msg: Record<string, unknown> = {}
        let guard = 0
        while (PeekMessageW!(msg, null, 0, 0, PM_REMOVE) && guard++ < 128) {
          DispatchMessageW!(msg)
        }
      } catch {
        /* ignore */
      }
    }, 60)

    started = true
    console.log('[turnHook] actif (SHELLHOOK id=' + shellMsgId + ')')
    return true
  } catch (err) {
    console.warn('[turnHook] initialisation échouée :', err)
    stopTurnHook()
    return false
  }
}

export function stopTurnHook(): void {
  if (pumpTimer) {
    clearInterval(pumpTimer)
    pumpTimer = null
  }
  try {
    if (createdHwnd && DeregisterShellHookWindow) DeregisterShellHookWindow(createdHwnd)
    if (createdHwnd && DestroyWindow) DestroyWindow(createdHwnd)
  } catch {
    /* ignore */
  }
  createdHwnd = null
  started = false
}

export function isTurnHookActive(): boolean {
  return started
}
