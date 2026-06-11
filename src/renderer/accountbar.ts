// Overlay « barre de comptes » — fenêtre légère listant les comptes (clic = focus).
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './accountbar.css'
import type { AccountBarItem } from '@shared/types'
import { classGlyphInner } from './classGlyphs'
import { classIconUrl } from './classIcons'

const barEl = document.getElementById('bar') as HTMLElement
const chipsEl = document.getElementById('chips') as HTMLElement

// Padding de .ab-body (8px de chaque côté) à ajouter autour de la barre.
const BODY_PAD = 16
const NS = 'http://www.w3.org/2000/svg'

/**
 * Jeton (avatar) d'une classe. Si l'icône officielle bundlée existe, on l'affiche
 * dans un disque (anneau en `currentColor` selon l'état du chip). Sinon, repli
 * sur le jeton SVG monochrome : disque + emblème en `currentColor`.
 */
function token(classId?: string): Element {
  const iconUrl = classIconUrl(classId)
  if (iconUrl) {
    const img = document.createElement('img')
    img.className = 'ab-token ab-token--img'
    img.src = iconUrl
    img.alt = ''
    return img
  }
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'ab-token')
  svg.setAttribute('viewBox', '0 0 24 24')
  // Disque de fond + emblème (markup en currentColor).
  svg.innerHTML =
    `<circle class="tk-disc" cx="12" cy="12" r="11"/>` +
    `<g class="tk-fig">${classGlyphInner(classId)}</g>`
  return svg
}

/** Chips indexés par id de compte (réutilisés entre les mises à jour). */
const chipById = new Map<string, HTMLButtonElement>()
/**
 * Signature « structurelle » (ids + libellés + classes) : ne change que si la
 * composition de la barre change réellement — un simple changement de compte
 * actif n'altère pas la signature, donc pas de reconstruction ni de re-mesure.
 */
let lastSig = ''

function applyState(chip: HTMLButtonElement, it: AccountBarItem): void {
  chip.classList.toggle('is-active', it.active)
  chip.classList.toggle('is-off', !it.detected)
  chip.title = it.detected ? `Activer ${it.label}` : `${it.label} — aucune fenêtre détectée`
}

function buildChip(it: AccountBarItem): HTMLButtonElement {
  const chip = document.createElement('button')
  chip.className = 'ab-chip'
  const name = document.createElement('span')
  name.className = 'ab-name'
  name.textContent = it.label
  chip.append(token(it.class), name)
  chip.addEventListener('click', () => void window.api.focusAccount(it.id))
  applyState(chip, it)
  return chip
}

function render(items: AccountBarItem[]): void {
  const sig = items.map((i) => `${i.id}|${i.label}|${i.class ?? ''}`).join(';') || 'EMPTY'

  // Composition inchangée : on se contente de rafraîchir les états (actif /
  // détecté) sur les éléments existants — aucune reconstruction, aucun blink.
  if (sig === lastSig) {
    for (const it of items) {
      const chip = chipById.get(it.id)
      if (chip) applyState(chip, it)
    }
    return
  }

  // Composition changée (ajout/suppression/renommage/classe) : on reconstruit.
  lastSig = sig
  chipById.clear()
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
    const chip = buildChip(it)
    chipById.set(it.id, chip)
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
