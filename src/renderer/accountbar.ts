// Overlay « barre de comptes » — fenêtre légère listant les comptes (clic = focus).
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './accountbar.css'
import type { AccountBarItem } from '@shared/types'

const barEl = document.getElementById('bar') as HTMLElement
const chipsEl = document.getElementById('chips') as HTMLElement

// Padding de .ab-body (8px de chaque côté) à ajouter autour de la barre.
const BODY_PAD = 16
const NS = 'http://www.w3.org/2000/svg'

/** Jeton (avatar) SVG : disque + silhouette ; la couleur suit `currentColor`. */
function tokenSvg(): SVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'ab-token')
  svg.setAttribute('viewBox', '0 0 28 28')
  const disc = document.createElementNS(NS, 'circle')
  disc.setAttribute('class', 'tk-disc')
  disc.setAttribute('cx', '14')
  disc.setAttribute('cy', '14')
  disc.setAttribute('r', '12')
  const head = document.createElementNS(NS, 'circle')
  head.setAttribute('class', 'tk-fig')
  head.setAttribute('cx', '14')
  head.setAttribute('cy', '11')
  head.setAttribute('r', '3.6')
  const bust = document.createElementNS(NS, 'path')
  bust.setAttribute('class', 'tk-fig')
  bust.setAttribute('d', 'M8,20 a6 6 0 0 1 12 0 Z')
  svg.append(disc, head, bust)
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
      'ab-chip' +
      (it.active ? ' is-active' : '') +
      (it.turn ? ' is-turn' : '') +
      (it.detected ? '' : ' is-off')
    chip.title = it.turn
      ? `${it.label} — c’est son tour`
      : it.detected
        ? `Activer ${it.label}`
        : `${it.label} — aucune fenêtre détectée`

    const name = document.createElement('span')
    name.className = 'ab-name'
    name.textContent = it.label

    chip.append(tokenSvg(), name)
    if (it.turn) {
      const badge = document.createElement('span')
      badge.className = 'ab-turn'
      badge.textContent = '!'
      chip.append(badge)
    }
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
