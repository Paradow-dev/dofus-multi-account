// Overlay « barre de comptes » — fenêtre légère listant les comptes (clic = focus).
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './accountbar.css'
import type { AccountBarItem } from '@shared/types'
import { classGlyphInner } from './classGlyphs'

const barEl = document.getElementById('bar') as HTMLElement
const chipsEl = document.getElementById('chips') as HTMLElement

// Padding de .ab-body (8px de chaque côté) à ajouter autour de la barre.
const BODY_PAD = 16
const NS = 'http://www.w3.org/2000/svg'

/**
 * Jeton SVG : disque + emblème de la classe (silhouette si aucune classe).
 * La couleur suit `currentColor` (déterminée par l'état du chip via CSS).
 */
function tokenSvg(classId?: string): SVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'ab-token')
  svg.setAttribute('viewBox', '0 0 24 24')
  // Disque de fond + emblème (markup en currentColor).
  svg.innerHTML =
    `<circle class="tk-disc" cx="12" cy="12" r="11"/>` +
    `<g class="tk-fig">${classGlyphInner(classId)}</g>`
  return svg
}

function render(items: AccountBarItem[]): void {
  chipsEl.replaceChildren()

  if (items.length === 0) {
    const empty = document.createElement('span')
    empty.className = 'ab-empty'
    empty.textContent = 'Aucun compte configuré'
    chipsEl.append(empty)
    requestAnimationFrame(reportSize)
    return
  }

  for (const it of items) {
    const chip = document.createElement('button')
    chip.className =
      'ab-chip' + (it.active ? ' is-active' : '') + (it.detected ? '' : ' is-off')
    chip.title = it.detected
      ? `Activer ${it.label}`
      : `${it.label} — aucune fenêtre détectée`

    const name = document.createElement('span')
    name.className = 'ab-name'
    name.textContent = it.label

    chip.append(tokenSvg(it.class), name)
    chip.addEventListener('click', () => void window.api.focusAccount(it.id))
    chipsEl.append(chip)
  }

  requestAnimationFrame(reportSize)
}

/** Mesure la barre et demande au process principal d'ajuster la fenêtre. */
function reportSize(): void {
  const r = barEl.getBoundingClientRect()
  window.api.resizeAccountBar(Math.ceil(r.width) + BODY_PAD, Math.ceil(r.height) + BODY_PAD)
}

window.api.onAccountBarData((items) => render(items))

// Premier ajustement après chargement des polices (qui changent la largeur).
window.addEventListener('load', () => requestAnimationFrame(reportSize))
if (document.fonts?.ready) {
  void document.fonts.ready.then(() => reportSize())
}
