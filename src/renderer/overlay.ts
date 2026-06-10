// Overlay « nom du personnage actif » — fenêtre légère, dédiée.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './overlay.css'

const nameEl = document.getElementById('name') as HTMLElement

// Reçoit le nom du personnage actif poussé par le process principal.
window.api.onOverlayCharacter((name) => {
  nameEl.textContent = name && name.trim() ? name : '—'
})
