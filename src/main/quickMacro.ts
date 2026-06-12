/**
 * Macro rapide éphémère — machine à états.
 *
 * idle → countdown (ticks 1 s) → recording → confirm → replaying → idle.
 * L'utilisateur enregistre une séquence de touches/clics sur son premier compte
 * (macroRecorder), puis la rejoue une fois sur les autres comptes dans l'ordre
 * de cycle (macroPlayer). Rien n'est persisté : la macro est effacée après
 * exécution (ou annulation).
 */

import { IPC, type QuickMacroAction, type QuickMacroState } from '@shared/types'
import { getConfig, broadcast } from './state'
import { listWindows, boundsForHandle } from './windowManager'
import { activateAccount } from './shortcuts'
import { resolveVk } from './keyboardHook'
import { getForegroundHandle } from './focusWatch'
import { sendMacroBarState, refreshMacroBarVisibility } from './macroBar'
import {
  startMacroRecording,
  stopMacroRecording,
  type MacroEvent,
  type RecorderBounds
} from './macroRecorder'
import { replayEvents, isPlayerAvailable, sleep } from './macroPlayer'

/* ---------- État ---------- */

let state: QuickMacroState = { phase: 'idle', eventCount: 0, durationMs: 0 }
let countdownTimer: NodeJS.Timeout | null = null
/** Séquence enregistrée (éphémère, jamais persistée). */
let recordedEvents: MacroEvent[] = []
/** Bounds de la fenêtre de référence pendant l'enregistrement. */
let recordingBounds: RecorderBounds = { x: 0, y: 0, width: 1920, height: 1080 }
/** Compte sur lequel la macro a été enregistrée (exclu de la lecture « tous »). */
let recordingAccountId: string | undefined
/** HWND de la fenêtre d'enregistrement (exclusion même sans compte réconcilié). */
let recordingHandle: number | undefined
/** Drapeau d'interruption de la lecture (Échap / annulation). */
let replayAborted = false

export function getQuickMacroState(): QuickMacroState {
  return state
}

/**
 * Diffuse l'état : le panneau macro reçoit toutes les mises à jour (compteur
 * REC, progression), les autres fenêtres seulement les changements de phase
 * (évite le fan-out IPC à chaque frappe enregistrée).
 */
function setState(next: QuickMacroState): void {
  const phaseChanged = next.phase !== state.phase
  state = next
  sendMacroBarState(state)
  if (phaseChanged) {
    broadcast(IPC.macroState, state)
    // De retour au repos : ré-applique le masquage « hors jeu » éventuel.
    if (state.phase === 'idle') refreshMacroBarVisibility()
  }
}

/** Retour au repos : la macro est effacée (éphémère). */
function reset(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  stopMacroRecording()
  recordedEvents = []
  recordingAccountId = undefined
  recordingHandle = undefined
  setState({ phase: 'idle', eventCount: 0, durationMs: 0 })
}

/* ---------- Enregistrement ---------- */

/** Fenêtre Dofus au premier plan (bounds + compte réconcilié), si trouvée. */
function foregroundDofusWindow(): {
  bounds: RecorderBounds
  accountId?: string
  handle: number
} | null {
  const fg = getForegroundHandle()
  if (fg === null) return null
  try {
    const win = listWindows(getConfig().accounts, false).find((w) => w.handle === fg)
    if (!win || win.bounds.width <= 0 || win.bounds.height <= 0) return null
    return { bounds: win.bounds, accountId: win.accountId, handle: win.handle }
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
    recordingHandle = fg.handle
  } else {
    recordingAccountId = undefined
    recordingHandle = undefined
  }

  // Touche finale du raccourci de bascule : non enregistrée. F12 (stop) est
  // filtrée par le recorder lui-même. Si la touche du raccourci n'est pas
  // connue de VK_MAP (resolveVk null), on s'appuie sur l'assainissement de la
  // séquence à l'arrêt (macroRecorder) pour retirer les touches « collées ».
  const ignoreVks = new Set<number>()
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
    durationMs: state.durationMs,
    otherCount
  })
}

/* ---------- Lecture ---------- */

/** Rejoue la macro sur tous les autres comptes, dans l'ordre de cycle. */
async function replayAll(): Promise<void> {
  const cfg = getConfig()
  const events = recordedEvents
  const durationMs = state.durationMs
  // Une seule énumération : compte → handle (les bounds sont rafraîchis par
  // fenêtre, après mise au premier plan, via boundsForHandle).
  const handleByAccount = new Map<string, number>()
  try {
    for (const w of listWindows(cfg.accounts, false)) {
      if (w.accountId) handleByAccount.set(w.accountId, w.handle)
    }
  } catch {
    /* ignore */
  }
  // Exclut le compte d'enregistrement, par id et/ou par HWND (au cas où le
  // compte n'était pas réconcilié au moment de l'enregistrement).
  const targets = [...cfg.accounts]
    .sort((a, b) => a.order - b.order)
    .filter(
      (a) =>
        a.id !== recordingAccountId &&
        (recordingHandle === undefined || handleByAccount.get(a.id) !== recordingHandle)
    )
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
      durationMs,
      replayIndex: i + 1,
      replayTotal: targets.length,
      replayLabel: account.label
    })
    // Met la fenêtre du compte au premier plan (disposition habituelle).
    if (!activateAccount(cfg, account.id)) continue
    await sleep(cfg.quickMacro.betweenAccountsMs)
    if (replayAborted) break
    // Bounds frais de la fenêtre cible (conversion des ratios de clic).
    // Fenêtre disparue : on saute ce compte plutôt que de rejouer à l'aveugle.
    const handle = handleByAccount.get(account.id)
    const bounds = handle !== undefined ? boundsForHandle(handle) : null
    if (!bounds) continue
    const done = await replayEvents(events, bounds, () => replayAborted)
    if (!done) break
  }
  reset()
}

/** Rejoue la macro une seule fois, sur la fenêtre actuellement au premier plan. */
async function replayActive(): Promise<void> {
  const cfg = getConfig()
  const events = recordedEvents
  const durationMs = state.durationMs
  if (!isPlayerAvailable()) {
    reset()
    return
  }
  replayAborted = false
  setState({
    phase: 'replaying',
    eventCount: events.length,
    durationMs,
    replayIndex: 1,
    replayTotal: 1,
    replayLabel: 'Compte actif'
  })
  // Cible : la fenêtre Dofus au premier plan. À défaut (panneau cliqué alors
  // qu'une autre application a le focus), on rabat sur le compte
  // d'enregistrement ; sans aucune fenêtre, on annule plutôt que de rejouer
  // dans le vide avec des bounds périmés.
  let target = foregroundDofusWindow()
  if (!target && recordingAccountId && activateAccount(cfg, recordingAccountId)) {
    await sleep(cfg.quickMacro.betweenAccountsMs)
    try {
      const win = listWindows(cfg.accounts, false).find(
        (w) => w.accountId === recordingAccountId
      )
      if (win && win.bounds.width > 0 && win.bounds.height > 0) {
        target = { bounds: win.bounds, accountId: win.accountId, handle: win.handle }
      }
    } catch {
      /* ignore */
    }
  }
  if (!target) {
    reset()
    return
  }
  await replayEvents(events, target.bounds, () => replayAborted)
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

/**
 * Annule entièrement la macro rapide : interrompt la lecture, désinstalle les
 * hooks d'enregistrement, retour au repos. Appelé quand la fonctionnalité est
 * désactivée en cours de session et à la fermeture de l'application.
 */
export function cancelQuickMacro(): void {
  replayAborted = true
  reset()
}

/** Arrête proprement la macro rapide (fermeture de l'application). */
export function stopQuickMacro(): void {
  cancelQuickMacro()
}
