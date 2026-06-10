// Overlay « nom du personnage actif » — fenêtre légère, dédiée.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './overlay.css'

const cardEl = document.getElementById('overlay') as HTMLElement
const nameEl = document.getElementById('name') as HTMLElement

// Padding de .overlay-body (8px de chaque côté) à ajouter autour de la carte.
const BODY_PAD = 16

/** Mesure la carte et demande au process principal d'ajuster la fenêtre au contenu. */
function reportSize(): void {
  const r = cardEl.getBoundingClientRect()
  window.api.resizeOverlay(Math.ceil(r.width) + BODY_PAD, Math.ceil(r.height) + BODY_PAD)
}

// Reçoit le nom du personnage actif poussé par le process principal.
window.api.onOverlayCharacter((name) => {
  nameEl.textContent = name && name.trim() ? name : '—'
  // Après mise en page du nouveau texte, ajuste la taille de la fenêtre.
  requestAnimationFrame(reportSize)
})

// Premier ajustement (et après chargement des polices, qui changent la largeur).
window.addEventListener('load', () => requestAnimationFrame(reportSize))
if (document.fonts?.ready) {
  void document.fonts.ready.then(() => reportSize())
}
