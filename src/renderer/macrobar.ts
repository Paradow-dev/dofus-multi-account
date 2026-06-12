// Panneau « macro rapide » — fenêtre légère affichant l'état de la macro
// (repos, compte à rebours, REC, pause, confirmation, lecture) et ses actions.
// Carte à deux lignes : transport (état + boutons) puis détail (chips
// touches/clics/mouvements, progression de lecture).
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './macrobar.css'
import type { QuickMacroAction, QuickMacroState } from '@shared/types'

const barEl = document.getElementById('bar') as HTMLElement
const mainEl = document.getElementById('main') as HTMLElement
const subEl = document.getElementById('sub') as HTMLElement

// Padding de .mb-body (8px de chaque côté) à ajouter autour de la carte.
const BODY_PAD = 16

/** Raccourci configuré, affiché dans l'indication en repos. */
let shortcut = 'Ctrl+Alt+R'

/* ---------- Icônes SVG ---------- */

const ICONS = {
  record: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5"/></svg>',
  stop: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8a.8.8 0 0 1 1.2-.7l8 5.2a.8.8 0 0 1 0 1.4l-8 5.2a.8.8 0 0 1-1.2-.7V2.8z"/></svg>',
  pause:
    '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="2.5" width="3.4" height="11" rx="1"/><rect x="9.1" y="2.5" width="3.4" height="11" rx="1"/></svg>',
  restart:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.1"/><path d="M13.7 1.6v3h-3" stroke-linejoin="round"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  keyboard:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.8h.01M7 6.8h.01M10 6.8h.01M12 6.8h.01M4.5 9.5h7" stroke-linecap="round"/></svg>',
  mouse:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="1.5" width="7" height="13" rx="3.5"/><path d="M8 4v3" stroke-linecap="round"/></svg>',
  move: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 11.5c2.5 0 2.5-7 5-7s2.6 7 6 7"/><path d="M11.5 9.5l2 2-2 2"/></svg>'
} as const

type IconName = keyof typeof ICONS

/* ---------- Helpers DOM ---------- */

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon(name: IconName): HTMLElement {
  const span = el('span', 'mb-icon')
  span.style.display = 'contents'
  span.innerHTML = ICONS[name]
  return span
}

/** Bouton icône rond. */
function ibtn(
  name: IconName,
  title: string,
  action: QuickMacroAction,
  variant: '' | 'danger' | 'success' = ''
): HTMLButtonElement {
  const btn = el('button', `mb-ibtn${variant ? ` mb-ibtn--${variant}` : ''}`) as HTMLButtonElement
  btn.title = title
  btn.append(icon(name))
  btn.addEventListener('click', () => window.api.macroAction(action))
  return btn
}

/** Bouton texte + icône. */
function tbtn(
  name: IconName,
  label: string,
  action: QuickMacroAction,
  primary = false
): HTMLButtonElement {
  const btn = el('button', `mb-btn${primary ? ' mb-btn--primary' : ''}`) as HTMLButtonElement
  btn.append(icon(name), document.createTextNode(label))
  btn.addEventListener('click', () => window.api.macroAction(action))
  return btn
}

/** Chip de détail (icône + nombre + libellé optionnel). */
function chip(name: IconName, count: number, label: string): HTMLElement {
  const c = el('span', 'mb-chip')
  const num = el('span', 'mb-num', String(count))
  num.dataset.chip = name
  c.append(icon(name), num, document.createTextNode(` ${label}`))
  return c
}

function spacer(): HTMLElement {
  return el('span', 'mb-spacer')
}

/** Durée façon chrono (« 0:12,4 »). */
function fmtClock(ms: number): string {
  const totalSec = ms / 1000
  const min = Math.floor(totalSec / 60)
  const sec = (totalSec - min * 60).toFixed(1).replace('.', ',')
  return `${min}:${Number(sec.replace(',', '.')) < 10 ? '0' : ''}${sec}`
}

/** Durée en secondes, à la française (« 12,3 s »). */
function fmtDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

/* Mise à jour incrémentale : le DOM n'est reconstruit (et la fenêtre
 * redimensionnée) qu'au changement de phase/pause ; les rafales d'événements
 * (compteurs REC, progression de lecture) ne modifient que textes et barre. */
let lastRenderKey: string | null = null
let countdownTextEl: HTMLElement | null = null
let recClockEl: HTMLElement | null = null
let replayTitleEl: HTMLElement | null = null
let replayHintEl: HTMLElement | null = null
let progressFillEl: HTMLElement | null = null

function renderKey(state: QuickMacroState): string {
  return `${state.phase}:${state.paused ? 'p' : ''}`
}

function replayTitle(state: QuickMacroState): string {
  const pos = `${state.replayIndex ?? 1}/${state.replayTotal ?? 1}`
  const label = state.replayLabel ?? ''
  return state.paused ? `Lecture en pause — ${label}` : `Lecture ${pos} — ${label}`
}

function progressPct(state: QuickMacroState): number {
  return Math.max(0, Math.min(100, state.progressPct ?? 0))
}

/** Chips de détail des événements (mises à jour en place via data-chip). */
function statChips(state: QuickMacroState): HTMLElement[] {
  return [
    chip('keyboard', state.keyCount ?? 0, 'touches'),
    chip('mouse', state.clickCount ?? 0, 'clics'),
    chip('move', state.moveCount ?? 0, 'mvts')
  ]
}

function updateChips(state: QuickMacroState): void {
  const counts: Record<string, number> = {
    keyboard: state.keyCount ?? 0,
    mouse: state.clickCount ?? 0,
    move: state.moveCount ?? 0
  }
  for (const numEl of subEl.querySelectorAll<HTMLElement>('[data-chip]')) {
    const next = String(counts[numEl.dataset.chip ?? ''] ?? 0)
    if (numEl.textContent !== next) numEl.textContent = next
  }
}

/* Chrono REC local : l'état main n'arrive qu'au fil des événements capturés ;
 * un ticker basse fréquence (200 ms) anime le chrono entre deux réceptions. */
let recBaseMs = 0
let recBaseAt = 0
let recTicker: ReturnType<typeof setInterval> | null = null

function syncRecTicker(state: QuickMacroState): void {
  const wanted = state.phase === 'recording' && !state.paused
  if (state.phase === 'recording') {
    recBaseMs = state.durationMs
    recBaseAt = Date.now()
  }
  if (wanted && !recTicker) {
    recTicker = setInterval(() => {
      if (recClockEl) {
        recClockEl.textContent = `REC ${fmtClock(recBaseMs + (Date.now() - recBaseAt))}`
      }
    }, 200)
  } else if (!wanted && recTicker) {
    clearInterval(recTicker)
    recTicker = null
  }
}

/** Re-mesure throttlée : les compteurs qui s'allongent élargissent la carte
 * (le main no-op si la taille n'a pas changé). */
let lastMeasureAt = 0
function measureSoon(): void {
  if (Date.now() - lastMeasureAt < 300) return
  lastMeasureAt = Date.now()
  requestAnimationFrame(() => void reportSize())
}

/** Met à jour les éléments en place, sans reconstruire le DOM. */
function update(state: QuickMacroState): void {
  switch (state.phase) {
    case 'countdown':
      if (countdownTextEl) {
        countdownTextEl.textContent = `Enregistrement dans ${state.countdown ?? 0}…`
      }
      break
    case 'recording':
      if (recClockEl) recClockEl.textContent = `REC ${fmtClock(state.durationMs)}`
      updateChips(state)
      measureSoon()
      break
    case 'replaying': {
      if (replayTitleEl) replayTitleEl.textContent = replayTitle(state)
      const pct = progressPct(state)
      if (progressFillEl) progressFillEl.style.width = `${pct}%`
      if (replayHintEl && !state.paused) {
        replayHintEl.textContent = `${pct} % · Échap = stop`
      }
      break
    }
  }
}

/** Remplit la 2e ligne (masquée si vide). */
function setSub(...nodes: (Node | null)[]): void {
  subEl.replaceChildren(...nodes.filter((n): n is Node => n !== null))
  subEl.hidden = subEl.childNodes.length === 0
}

function render(state: QuickMacroState): void {
  lastRenderKey = renderKey(state)
  countdownTextEl = recClockEl = replayTitleEl = replayHintEl = progressFillEl = null
  mainEl.replaceChildren()

  switch (state.phase) {
    case 'idle': {
      mainEl.append(tbtn('record', 'Enregistrer', 'record', true), spacer(), el('span', 'mb-text mb-text--hint', shortcut))
      setSub()
      break
    }

    case 'countdown': {
      countdownTextEl = el('span', 'mb-title', `Enregistrement dans ${state.countdown ?? 0}…`)
      mainEl.append(
        el('span', 'mb-dot mb-dot--rec'),
        countdownTextEl,
        spacer(),
        ibtn('close', 'Annuler', 'cancel')
      )
      setSub(el('span', 'mb-text mb-text--hint', 'Tout sera capturé jusqu’à F12 (touches, clics, souris).'))
      break
    }

    case 'recording': {
      if (state.paused) {
        mainEl.append(
          el('span', 'mb-dot mb-dot--pause'),
          el('span', 'mb-title', 'Enregistrement en pause'),
          spacer(),
          ibtn('record', 'Reprendre', 'resume', 'success'),
          ibtn('stop', 'Arrêter', 'stop', 'danger')
        )
        setSub(
          ...statChips(state),
          spacer(),
          el('span', 'mb-text mb-text--hint', 'les entrées ne sont plus capturées')
        )
      } else {
        recClockEl = el('span', 'mb-title', `REC ${fmtClock(state.durationMs)}`)
        mainEl.append(
          el('span', 'mb-dot mb-dot--rec'),
          recClockEl,
          spacer(),
          ibtn('pause', 'Pause', 'pause'),
          ibtn('stop', 'Arrêter (F12)', 'stop', 'danger')
        )
        setSub(...statChips(state), spacer(), el('span', 'mb-text mb-text--hint', 'F12 = stop'))
      }
      break
    }

    case 'confirm': {
      const n = state.otherCount ?? 0
      mainEl.append(
        el('span', 'mb-title', `Macro prête · ${fmtDuration(state.durationMs)}`),
        spacer(),
        tbtn('play', n > 1 ? `${n} autres comptes` : n === 1 ? '1 autre compte' : 'Autres comptes', 'apply-all', true),
        tbtn('play', 'Actif', 'apply-active'),
        ibtn('close', 'Effacer la macro', 'cancel')
      )
      setSub(
        ...statChips(state),
        spacer(),
        el('span', 'mb-text mb-text--hint', 'conservée jusqu’à ✕')
      )
      break
    }

    case 'replaying': {
      replayTitleEl = el('span', 'mb-title', replayTitle(state))
      progressFillEl = el('div', `mb-progress-fill${state.paused ? ' is-paused' : ''}`)
      progressFillEl.style.width = `${progressPct(state)}%`
      const progress = el('div', 'mb-progress')
      progress.append(progressFillEl)
      replayHintEl = el(
        'span',
        'mb-text mb-text--hint',
        state.paused ? 'reprendra au prochain événement' : `${progressPct(state)} % · Échap = stop`
      )
      mainEl.append(
        el('span', `mb-dot ${state.paused ? 'mb-dot--pause' : 'mb-dot--play'}`),
        replayTitleEl,
        spacer(),
        state.paused ? ibtn('play', 'Reprendre', 'resume', 'success') : ibtn('pause', 'Pause', 'pause'),
        ibtn('restart', 'Recommencer du début', 'restart'),
        ibtn('stop', 'Stop (Échap)', 'stop', 'danger')
      )
      setSub(progress, replayHintEl)
      break
    }
  }

  // La fenêtre n'est redimensionnée qu'au changement de phase (render).
  // La carte est masquée le temps de l'ajustement : sinon le nouveau contenu
  // déborde de l'ancien cadre avant que la fenêtre ne s'agrandisse.
  barEl.style.visibility = 'hidden'
  barEl.classList.remove('mb-anim')
  requestAnimationFrame(() => {
    void reportSize().then(() => {
      barEl.style.visibility = ''
      // Relance l'animation d'entrée du contenu (one-shot, cf. .mb-anim).
      void barEl.offsetWidth
      barEl.classList.add('mb-anim')
    })
  })
}

/** Mesure la carte et demande au process principal d'ajuster la fenêtre. */
async function reportSize(): Promise<void> {
  const r = barEl.getBoundingClientRect()
  await window.api.resizeMacroBar(Math.ceil(r.width) + BODY_PAD, Math.ceil(r.height) + BODY_PAD)
}

window.api.onQuickMacroState((state) => {
  syncRecTicker(state)
  if (renderKey(state) === lastRenderKey) {
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
