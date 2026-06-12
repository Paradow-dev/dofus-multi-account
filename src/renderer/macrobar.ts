// Panneau « macro rapide » — fenêtre légère affichant l'état de la macro
// (repos, compte à rebours, REC, confirmation, lecture) et ses actions.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './macrobar.css'
import type { QuickMacroAction, QuickMacroPhase, QuickMacroState } from '@shared/types'

const barEl = document.getElementById('bar') as HTMLElement
const contentEl = document.getElementById('content') as HTMLElement

// Padding de .mb-body (8px de chaque côté) à ajouter autour de la pilule.
const BODY_PAD = 16

/** Raccourci configuré, affiché dans l'indication en repos. */
let shortcut = 'Ctrl+Alt+R'

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, action: QuickMacroAction, primary = false): HTMLButtonElement {
  const btn = el('button', `mb-btn${primary ? ' mb-btn--primary' : ''}`, label) as HTMLButtonElement
  btn.addEventListener('click', () => window.api.macroAction(action))
  return btn
}

/** Durée en secondes, à la française (« 2,4 s »). */
function fmtDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

/* Mise à jour incrémentale : le DOM n'est reconstruit (et la fenêtre
 * redimensionnée) qu'au changement de phase ; les rafales d'événements
 * (compteur REC, progression de lecture) ne modifient que le texte/la barre. */
let lastPhase: QuickMacroPhase | null = null
let countdownTextEl: HTMLElement | null = null
let recTextEl: HTMLElement | null = null
let replayTextEl: HTMLElement | null = null
let progressFillEl: HTMLElement | null = null

function countdownText(state: QuickMacroState): string {
  return `⏺ Enregistrement dans ${state.countdown ?? 0}…`
}
function recText(state: QuickMacroState): string {
  return `REC — ${state.eventCount} évts · ${fmtDuration(state.durationMs)}`
}
function replayText(state: QuickMacroState): string {
  return `Compte ${state.replayIndex ?? 1}/${state.replayTotal ?? 1} · ${state.replayLabel ?? ''}`
}
function replayPct(state: QuickMacroState): string {
  const total = Math.max(1, state.replayTotal ?? 1)
  return `${Math.round(((state.replayIndex ?? 1) / total) * 100)}%`
}

/** Met à jour les éléments en place, sans reconstruire le DOM. */
function update(state: QuickMacroState): void {
  switch (state.phase) {
    case 'countdown':
      if (countdownTextEl) countdownTextEl.textContent = countdownText(state)
      break
    case 'recording':
      if (recTextEl) recTextEl.textContent = recText(state)
      break
    case 'replaying':
      if (replayTextEl) replayTextEl.textContent = replayText(state)
      if (progressFillEl) progressFillEl.style.width = replayPct(state)
      break
  }
}

function render(state: QuickMacroState): void {
  lastPhase = state.phase
  countdownTextEl = recTextEl = replayTextEl = progressFillEl = null
  contentEl.replaceChildren()

  switch (state.phase) {
    case 'idle':
      contentEl.append(
        button('⏺ Enregistrer', 'record', true),
        el('span', 'mb-text mb-text--hint', shortcut)
      )
      break

    case 'countdown':
      countdownTextEl = el('span', 'mb-text', countdownText(state))
      contentEl.append(countdownTextEl)
      break

    case 'recording': {
      recTextEl = el('span', 'mb-text', recText(state))
      contentEl.append(
        el('span', 'mb-dot mb-dot--rec'),
        recTextEl,
        button('■ Arrêter (F12)', 'stop')
      )
      break
    }

    case 'confirm': {
      const n = state.otherCount ?? 0
      contentEl.append(
        el('span', 'mb-text', `${state.eventCount} événements · ${fmtDuration(state.durationMs)}`),
        button(`▶ Appliquer sur les ${n} autres comptes`, 'apply-all', true),
        button('Compte actif seulement', 'apply-active'),
        button('✕ Annuler', 'cancel')
      )
      break
    }

    case 'replaying': {
      progressFillEl = el('div', 'mb-progress-fill')
      progressFillEl.style.width = replayPct(state)
      const progress = el('div', 'mb-progress')
      progress.append(progressFillEl)
      replayTextEl = el('span', 'mb-text', replayText(state))
      contentEl.append(
        el('span', 'mb-dot mb-dot--play'),
        replayTextEl,
        progress,
        el('span', 'mb-text mb-text--hint', 'Échap = stop')
      )
      break
    }
  }

  // La fenêtre n'est redimensionnée qu'au changement de phase (render).
  // La pilule est masquée le temps de l'ajustement : sinon le nouveau contenu
  // déborde de l'ancien cadre avant que la fenêtre ne s'agrandisse.
  barEl.style.visibility = 'hidden'
  requestAnimationFrame(() => {
    void reportSize().then(() => {
      barEl.style.visibility = ''
    })
  })
}

/** Mesure la pilule et demande au process principal d'ajuster la fenêtre. */
async function reportSize(): Promise<void> {
  const r = barEl.getBoundingClientRect()
  await window.api.resizeMacroBar(Math.ceil(r.width) + BODY_PAD, Math.ceil(r.height) + BODY_PAD)
}

window.api.onQuickMacroState((state) => {
  if (state.phase === lastPhase) {
    update(state)
    return
  }
  if (state.phase === 'idle') {
    // Le raccourci a pu changer dans les réglages : on le relit au repos.
    void window.api.getConfig().then((cfg) => {
      shortcut = cfg.quickMacro.shortcut
      render(state)
    })
    return
  }
  render(state)
})

void window.api.getConfig().then((cfg) => {
  shortcut = cfg.quickMacro.shortcut
  render({ phase: 'idle', eventCount: 0, durationMs: 0 })
})

// Premier ajustement après chargement des polices (qui changent la largeur).
window.addEventListener('load', () => requestAnimationFrame(() => void reportSize()))
if (document.fonts?.ready) {
  void document.fonts.ready.then(() => void reportSize())
}
