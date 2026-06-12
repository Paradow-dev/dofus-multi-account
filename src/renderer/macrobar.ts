// Panneau « macro rapide » — fenêtre légère affichant l'état de la macro
// (repos, compte à rebours, REC, confirmation, lecture) et ses actions.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './macrobar.css'
import type { QuickMacroAction, QuickMacroState } from '@shared/types'

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

function render(state: QuickMacroState): void {
  contentEl.replaceChildren()

  switch (state.phase) {
    case 'idle':
      contentEl.append(el('span', 'mb-text mb-text--hint', `Macro · ${shortcut} pour enregistrer`))
      break

    case 'countdown':
      contentEl.append(
        el('span', 'mb-text', `⏺ Enregistrement dans ${state.countdown ?? 0}…`)
      )
      break

    case 'recording': {
      contentEl.append(
        el('span', 'mb-dot mb-dot--rec'),
        el('span', 'mb-text', `REC — ${state.eventCount} évts · ${fmtDuration(state.durationMs)}`),
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
      const total = state.replayTotal ?? 1
      const index = state.replayIndex ?? 1
      const pct = Math.round((index / Math.max(1, total)) * 100)
      const fill = el('div', 'mb-progress-fill')
      fill.style.width = `${pct}%`
      const progress = el('div', 'mb-progress')
      progress.append(fill)
      contentEl.append(
        el('span', 'mb-dot mb-dot--play'),
        el('span', 'mb-text', `Compte ${index}/${total} · ${state.replayLabel ?? ''}`),
        progress,
        el('span', 'mb-text mb-text--hint', 'Échap = stop')
      )
      break
    }
  }

  requestAnimationFrame(reportSize)
}

/** Mesure la pilule et demande au process principal d'ajuster la fenêtre. */
function reportSize(): void {
  const r = barEl.getBoundingClientRect()
  window.api.resizeMacroBar(Math.ceil(r.width) + BODY_PAD, Math.ceil(r.height) + BODY_PAD)
}

window.api.onQuickMacroState((state) => {
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
window.addEventListener('load', () => requestAnimationFrame(reportSize))
if (document.fonts?.ready) {
  void document.fonts.ready.then(() => reportSize())
}
