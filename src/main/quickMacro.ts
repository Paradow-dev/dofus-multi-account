/**
 * Macro rapide éphémère — machine à états.
 *
 * idle → countdown (ticks 1 s) → recording → confirm → replaying → idle.
 * L'utilisateur enregistre une séquence de touches/clics sur son premier compte
 * (macroRecorder), puis la rejoue une fois sur les autres comptes dans l'ordre
 * de cycle (macroPlayer). Rien n'est persisté : la macro est effacée après
 * exécution (ou annulation).
 */

import { BrowserWindow } from 'electron'
import { IPC, type QuickMacroAction, type QuickMacroState } from '@shared/types'
import { getConfig } from './state'
import { listWindows } from './windowManager'
import { activateAccount } from './shortcuts'
import { resolveVk } from './keyboardHook'
import {
  startMacroRecording,
  stopMacroRecording,
  type MacroEvent,
  type RecorderBounds
} from './macroRecorder'
import { replayEvents, isPlayerAvailable } from './macroPlayer'

const VK_F12 = 0x7b

type Fn = (...args: unknown[]) => unknown
let GetForegroundWindow: Fn | null = null

function loadForegroundFn(): boolean {
  if (GetForegroundWindow) return true
  if (process.platform !== 'win32') return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    GetForegroundWindow = user32.func('void* GetForegroundWindow()') as unknown as Fn
    return true
  } catch {
    return false
  }
}

/* ---------- État ---------- */

let state: QuickMacroState = { phase: 'idle', eventCount: 0, durationMs: 0 }
let countdownTimer: NodeJS.Timeout | null = null
/** Séquence enregistrée (éphémère, jamais persistée). */
let recordedEvents: MacroEvent[] = []
let recordedDurationMs = 0
/** Bounds de la fenêtre de référence pendant l'enregistrement. */
let recordingBounds: RecorderBounds = { x: 0, y: 0, width: 1920, height: 1080 }
/** Compte sur lequel la macro a été enregistrée (exclu de la lecture « tous »). */
let recordingAccountId: string | undefined
/** Drapeau d'interruption de la lecture (Échap / annulation). */
let replayAborted = false

export function getQuickMacroState(): QuickMacroState {
  return state
}

/** Diffuse l'état courant au panneau macro et à la fenêtre de réglages. */
function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(IPC.macroState, state)
    } catch {
      /* ignore */
    }
  }
}

function setState(next: QuickMacroState): void {
  state = next
  broadcast()
}

/** Retour au repos : la macro est effacée (éphémère). */
function reset(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  stopMacroRecording()
  recordedEvents = []
  recordedDurationMs = 0
  recordingAccountId = undefined
  setState({ phase: 'idle', eventCount: 0, durationMs: 0 })
}

/* ---------- Enregistrement ---------- */

/** Fenêtre Dofus au premier plan (bounds + compte réconcilié), si trouvée. */
function foregroundDofusWindow(): { bounds: RecorderBounds; accountId?: string } | null {
  if (!loadForegroundFn() || !GetForegroundWindow) return null
  try {
    const fg = Number(GetForegroundWindow())
    const win = listWindows(getConfig().accounts, false).find((w) => w.handle === fg)
    if (!win || win.bounds.width <= 0 || win.bounds.height <= 0) return null
    return { bounds: win.bounds, accountId: win.accountId }
  } catch {
    return null
  }
}

function startCountdown(): void {
  const cfg = getConfig().quickMacro
  let remaining = Math.max(0, Math.round(cfg.countdownSec))
  if (remaining === 0) {
    startRecording()
    return
  }
  setState({ phase: 'countdown', countdown: remaining, eventCount: 0, durationMs: 0 })
  countdownTimer = setInterval(() => {
    remaining -= 1
    if (remaining <= 0) {
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
      startRecording()
    } else {
      setState({ ...state, countdown: remaining })
    }
  }, 1000)
}

function startRecording(): void {
  const cfg = getConfig()
  // Fenêtre de référence : la fenêtre Dofus au premier plan (clics en ratios).
  // À défaut, on garde les derniers bounds connus (écran complet par défaut).
  const fg = foregroundDofusWindow()
  if (fg) {
    recordingBounds = fg.bounds
    recordingAccountId = fg.accountId
  } else {
    recordingAccountId = undefined
  }

  // Touches à ne pas enregistrer : F12 (stop) et la touche finale du raccourci.
  const ignoreVks = new Set<number>([VK_F12])
  const shortcutVk = resolveVk(cfg.quickMacro.shortcut)
  if (shortcutVk !== null) ignoreVks.add(shortcutVk)

  const ok = startMacroRecording({
    bounds: recordingBounds,
    ignoreVks,
    onEvent: (count, durationMs) => {
      if (state.phase !== 'recording') return
      setState({ ...state, eventCount: count, durationMs })
    },
    onStop: () => finishRecording()
  })

  if (!ok) {
    console.warn('[quickMacro] enregistrement impossible (hooks indisponibles)')
    reset()
    return
  }
  setState({ phase: 'recording', eventCount: 0, durationMs: 0 })
}

/** Arrête l'enregistrement et passe en confirmation (ou repos si vide). */
function finishRecording(): void {
  if (state.phase !== 'recording') return
  recordedEvents = stopMacroRecording()
  recordedDurationMs = state.durationMs
  if (recordedEvents.length === 0) {
    reset()
    return
  }
  const accounts = getConfig().accounts
  const hasRecorded = recordingAccountId
    ? accounts.some((a) => a.id === recordingAccountId)
    : false
  const otherCount = Math.max(0, accounts.length - (hasRecorded ? 1 : 0))
  setState({
    phase: 'confirm',
    eventCount: recordedEvents.length,
    durationMs: recordedDurationMs,
    otherCount
  })
}

/* ---------- Lecture ---------- */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Rejoue la macro sur tous les autres comptes, dans l'ordre de cycle. */
async function replayAll(): Promise<void> {
  const cfg = getConfig()
  const events = recordedEvents
  const targets = [...cfg.accounts]
    .sort((a, b) => a.order - b.order)
    .filter((a) => a.id !== recordingAccountId)
  if (targets.length === 0 || !isPlayerAvailable()) {
    reset()
    return
  }

  replayAborted = false
  for (let i = 0; i < targets.length; i++) {
    const account = targets[i]
    setState({
      phase: 'replaying',
      eventCount: events.length,
      durationMs: recordedDurationMs,
      replayIndex: i + 1,
      replayTotal: targets.length,
      replayLabel: account.label
    })
    // Met la fenêtre du compte au premier plan (disposition habituelle).
    if (!activateAccount(cfg, account.id)) continue
    await sleep(cfg.quickMacro.betweenAccountsMs)
    if (replayAborted) break
    // Bounds frais de la fenêtre cible (conversion des ratios de clic).
    const win = listWindows(cfg.accounts, false).find((w) => w.accountId === account.id)
    const bounds = win && win.bounds.width > 0 ? win.bounds : recordingBounds
    const done = await replayEvents(events, bounds, () => replayAborted)
    if (!done) break
  }
  reset()
}

/** Rejoue la macro une seule fois, sur la fenêtre actuellement au premier plan. */
async function replayActive(): Promise<void> {
  const events = recordedEvents
  if (!isPlayerAvailable()) {
    reset()
    return
  }
  replayAborted = false
  setState({
    phase: 'replaying',
    eventCount: events.length,
    durationMs: recordedDurationMs,
    replayIndex: 1,
    replayTotal: 1,
    replayLabel: 'Compte actif'
  })
  const fg = foregroundDofusWindow()
  await replayEvents(events, fg?.bounds ?? recordingBounds, () => replayAborted)
  reset()
}

/* ---------- Entrées ---------- */

/**
 * Bascule depuis le raccourci global : repos → compte à rebours ;
 * compte à rebours → annulation ; enregistrement → confirmation.
 */
export function toggleQuickMacro(): void {
  switch (state.phase) {
    case 'idle':
      startCountdown()
      break
    case 'countdown':
      reset()
      break
    case 'recording':
      finishRecording()
      break
    default:
      // confirm / replaying : géré par les boutons du panneau (ou Échap).
      break
  }
}

/** Action utilisateur reçue du panneau macro (IPC). */
export function handleQuickMacroAction(action: QuickMacroAction): void {
  switch (action) {
    case 'stop':
      finishRecording()
      break
    case 'apply-all':
      if (state.phase === 'confirm') void replayAll()
      break
    case 'apply-active':
      if (state.phase === 'confirm') void replayActive()
      break
    case 'cancel':
      if (state.phase === 'replaying') replayAborted = true
      else reset()
      break
  }
}

/** Arrête proprement la macro rapide (fermeture de l'application). */
export function stopQuickMacro(): void {
  replayAborted = true
  reset()
}
