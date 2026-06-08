import { screen } from 'electron'
import type { AccountConfig, DetectedWindow, LayoutMode } from '@shared/types'

/**
 * Accès à node-window-manager (addon natif Win32). Chargé paresseusement et de
 * façon défensive : sous WSL/Linux le module peut échouer à l'import, on dégrade
 * alors vers une liste vide pour que l'UI reste développable.
 *
 * IMPORTANT : on énumère via l'addon BRUT (`addon.getWindows()`) plutôt que via
 * `windowManager.getWindows()`, car ce dernier filtre avec `isWindow()` qui exige
 * un chemin d'exécutable lisible — or Dofus lancé en administrateur (ou dont le
 * chemin n'est pas lisible) serait alors totalement masqué. L'énumération brute
 * conserve ces fenêtres : on a au moins leur titre et leur handle, suffisant pour
 * les activer.
 */
interface NativeWindow {
  id: number
  path?: string
  getTitle(): string
  getBounds(): { x?: number; y?: number; width?: number; height?: number }
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void
  bringToTop(): void
  restore(): void
  maximize(): void
  isVisible(): boolean
}

interface RawAddon {
  getWindows(): number[]
}
interface NwmModule {
  addon?: RawAddon
  Window: new (id: number) => NativeWindow
}

let mod: NwmModule | null = null
let modLoaded = false

function getModule(): NwmModule | null {
  if (modLoaded) return mod
  modLoaded = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('node-window-manager') as NwmModule
  } catch (err) {
    console.warn('[windowManager] node-window-manager indisponible (hors Windows ?) :', err)
    mod = null
  }
  return mod
}

/** Énumère toutes les fenêtres top-level (handles bruts -> objets Window). */
function enumerate(): NativeWindow[] {
  const m = getModule()
  if (!m || !m.addon) return []
  let handles: number[] = []
  try {
    handles = m.addon.getWindows()
  } catch (err) {
    console.warn('[windowManager] getWindows échoué :', err)
    return []
  }
  const wins: NativeWindow[] = []
  for (const h of handles) {
    try {
      wins.push(new m.Window(h))
    } catch {
      /* ignore une fenêtre qui ne s'initialise pas */
    }
  }
  return wins
}

function safeTitle(win: NativeWindow): string {
  try {
    return win.getTitle() ?? ''
  } catch {
    return ''
  }
}

function safeVisible(win: NativeWindow): boolean {
  try {
    return win.isVisible()
  } catch {
    return false
  }
}

function exeName(win: NativeWindow): string {
  return (win.path ?? '').split(/[\\/]/).pop() ?? ''
}

/** Une fenêtre est considérée « Dofus » si son titre OU son exe contient "dofus". */
function isDofusWindow(win: NativeWindow): boolean {
  return (
    safeTitle(win).toLowerCase().includes('dofus') ||
    exeName(win).toLowerCase().includes('dofus')
  )
}

/** Une fenêtre minimisée est positionnée hors écran par Windows (~ -32000). */
function isMinimized(win: NativeWindow): boolean {
  try {
    const b = win.getBounds()
    return (b.x ?? 0) <= -30000 || (b.y ?? 0) <= -30000
  } catch {
    return false
  }
}

function toDetected(win: NativeWindow, accounts: AccountConfig[]): DetectedWindow {
  const title = safeTitle(win)
  const b = win.getBounds()
  const account = accounts.find(
    (a) => a.matchTitle && title.toLowerCase().includes(a.matchTitle.toLowerCase())
  )
  return {
    handle: win.id,
    title,
    exePath: win.path || undefined,
    isGame: isDofusWindow(win),
    bounds: { x: b.x ?? 0, y: b.y ?? 0, width: b.width ?? 0, height: b.height ?? 0 },
    accountId: account?.id
  }
}

/**
 * Liste les fenêtres top-level visibles ayant un titre.
 * @param includeAll  si false, ne renvoie que les fenêtres détectées comme Dofus.
 */
export function listWindows(accounts: AccountConfig[] = [], includeAll = false): DetectedWindow[] {
  const result: DetectedWindow[] = []
  for (const win of enumerate()) {
    if (!safeVisible(win)) continue
    const title = safeTitle(win)
    if (!title.trim()) continue
    if (!includeAll && !isDofusWindow(win)) continue
    result.push(toDetected(win, accounts))
  }
  return result
}

/** Retrouve la fenêtre native correspondant à un compte (par titre). */
function findWindowForAccount(account: AccountConfig): NativeWindow | null {
  if (!account.matchTitle) return null
  const needle = account.matchTitle.toLowerCase()
  for (const win of enumerate()) {
    if (safeTitle(win).toLowerCase().includes(needle)) return win
  }
  return null
}

/**
 * Met une fenêtre au premier plan SANS modifier sa géométrie.
 * Ne restaure que si la fenêtre est minimisée (sinon `restore()` dé-maximiserait
 * une fenêtre maximisée, ce qui violerait le mode « ne rien toucher »).
 */
function bringForward(win: NativeWindow): void {
  if (isMinimized(win)) {
    try {
      win.restore()
    } catch {
      /* ignore */
    }
  }
  win.bringToTop()
}

/**
 * Focalise la fenêtre d'un compte et applique la disposition demandée.
 * Retourne false si aucune fenêtre ne correspond.
 */
export function focusAccount(account: AccountConfig, layout: LayoutMode = 'none'): boolean {
  const win = findWindowForAccount(account)
  if (!win) return false
  try {
    bringForward(win)
    if (layout === 'maximize-active') {
      win.maximize()
      win.bringToTop()
    }
    return true
  } catch (err) {
    console.warn('[windowManager] focus échoué :', err)
    return false
  }
}

/**
 * Dispose les fenêtres des comptes en mosaïque sur l'écran principal.
 * Les comptes sont ordonnés selon `order`.
 */
export function applyGridLayout(accounts: AccountConfig[]): void {
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
      if (isMinimized(win)) win.restore()
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
