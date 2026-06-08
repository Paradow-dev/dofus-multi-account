import { screen } from 'electron'
import type { AccountConfig, DetectedWindow } from '@shared/types'

/**
 * Accès à node-window-manager (addon natif Win32). Chargé paresseusement et de
 * façon défensive : sous WSL/Linux le module peut échouer à l'import, on dégrade
 * alors vers une liste vide pour que l'UI reste développable.
 */
interface NativeWindow {
  id: number
  getTitle(): string
  getBounds(): { x?: number; y?: number; width?: number; height?: number }
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void
  bringToTop(): void
  show(): void
  restore(): void
  maximize(): void
  isVisible(): boolean
  isWindow(): boolean
}

interface NativeWindowManager {
  getWindows(): NativeWindow[]
}

let nwm: NativeWindowManager | null = null
let nwmLoaded = false

function getManager(): NativeWindowManager | null {
  if (nwmLoaded) return nwm
  nwmLoaded = true
  try {
    // require dynamique : évite un crash au boot si l'addon natif est absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('node-window-manager') as { windowManager: NativeWindowManager }
    nwm = mod.windowManager
  } catch (err) {
    console.warn('[windowManager] node-window-manager indisponible (hors Windows ?) :', err)
    nwm = null
  }
  return nwm
}

/** Titre considéré comme une fenêtre de jeu Dofus. */
function isDofusTitle(title: string): boolean {
  return /dofus/i.test(title)
}

/**
 * Liste les fenêtres Dofus actuellement ouvertes, en associant chaque fenêtre
 * au premier compte dont `matchTitle` est contenu dans le titre.
 */
export function listDofusWindows(accounts: AccountConfig[] = []): DetectedWindow[] {
  const manager = getManager()
  if (!manager) return []

  const result: DetectedWindow[] = []
  for (const win of manager.getWindows()) {
    if (!win.isWindow()) continue
    const title = safeTitle(win)
    if (!title || !isDofusTitle(title)) continue

    const b = win.getBounds()
    const account = accounts.find(
      (a) => a.matchTitle && title.toLowerCase().includes(a.matchTitle.toLowerCase())
    )
    result.push({
      handle: win.id,
      title,
      bounds: {
        x: b.x ?? 0,
        y: b.y ?? 0,
        width: b.width ?? 0,
        height: b.height ?? 0
      },
      accountId: account?.id
    })
  }
  return result
}

function safeTitle(win: NativeWindow): string {
  try {
    return win.getTitle()
  } catch {
    return ''
  }
}

/** Retrouve la fenêtre native correspondant à un compte (par titre). */
function findWindowForAccount(account: AccountConfig): NativeWindow | null {
  const manager = getManager()
  if (!manager || !account.matchTitle) return null
  const needle = account.matchTitle.toLowerCase()
  return (
    manager
      .getWindows()
      .find((w) => w.isWindow() && safeTitle(w).toLowerCase().includes(needle)) ?? null
  )
}

/** Met la fenêtre d'un compte au premier plan. Retourne false si introuvable. */
export function focusAccount(account: AccountConfig): boolean {
  const win = findWindowForAccount(account)
  if (!win) return false
  try {
    win.restore()
    win.show()
    win.bringToTop()
    return true
  } catch (err) {
    console.warn('[windowManager] focus échoué :', err)
    return false
  }
}

/** Agrandit/avance la fenêtre active selon le mode de disposition. */
export function maximizeActive(account: AccountConfig): void {
  const win = findWindowForAccount(account)
  if (!win) return
  try {
    win.restore()
    win.maximize()
    win.bringToTop()
  } catch (err) {
    console.warn('[windowManager] maximize échoué :', err)
  }
}

/**
 * Dispose les fenêtres des comptes en mosaïque sur l'écran principal.
 * Les comptes sont ordonnés selon `order`.
 */
export function applyGridLayout(accounts: AccountConfig[]): void {
  const manager = getManager()
  if (!manager) return

  const ordered = [...accounts].sort((a, b) => a.order - b.order)
  const wins = ordered
    .map((a) => findWindowForAccount(a))
    .filter((w): w is NativeWindow => w !== null)

  if (wins.length === 0) return

  const work = screen.getPrimaryDisplay().workArea
  const cols = Math.ceil(Math.sqrt(wins.length))
  const rows = Math.ceil(wins.length / cols)
  const cellW = Math.floor(work.width / cols)
  const cellH = Math.floor(work.height / rows)

  wins.forEach((win, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    try {
      win.restore()
      win.setBounds({
        x: work.x + col * cellW,
        y: work.y + row * cellH,
        width: cellW,
        height: cellH
      })
    } catch (err) {
      console.warn('[windowManager] setBounds échoué :', err)
    }
  })
}
