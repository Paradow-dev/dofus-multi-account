/**
 * Conversion d'un événement clavier/souris en accélérateur.
 *
 * Clavier → accélérateur Electron (ex. "Ctrl+Alt+Right", "F1", "Ctrl+Shift+A").
 * Voir https://www.electronjs.org/docs/latest/api/accelerator
 *
 * Souris → jeton dédié non géré par Electron (ex. "MouseBack", "Ctrl+MouseForward").
 * Ces accélérateurs sont interprétés côté main par un hook souris natif.
 */

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

/** Jetons de boutons souris reconnus (boutons non essentiels uniquement). */
const MOUSE_TOKENS: Record<number, string> = {
  1: 'MouseMiddle',
  3: 'MouseBack', // bouton latéral « Précédent » (X1)
  4: 'MouseForward' // bouton latéral « Suivant » (X2)
}

/**
 * Convertit un événement souris en accélérateur, ou null si le bouton n'est pas
 * captable (clic gauche/droit, réservés à l'usage normal).
 */
export function eventToMouseAccelerator(e: MouseEvent): string | null {
  const token = MOUSE_TOKENS[e.button]
  if (!token) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  parts.push(token)
  return parts.join('+')
}

/** Retourne null si seule une touche modificatrice est pressée. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')

  const key = normalizeKey(e)
  if (!key) return null

  parts.push(key)
  return parts.join('+')
}

function normalizeKey(e: KeyboardEvent): string | null {
  const k = e.key

  // Flèches : "ArrowRight" -> "Right"
  if (k.startsWith('Arrow')) return k.slice(5)

  // Touches de fonction F1..F24
  if (/^F\d{1,2}$/.test(k)) return k

  // Lettres
  if (/^[a-zA-Z]$/.test(k)) return k.toUpperCase()

  // Chiffres (rangée du haut ou pavé)
  if (/^[0-9]$/.test(k)) return k

  switch (k) {
    case ' ':
      return 'Space'
    case 'Escape':
      return 'Esc'
    case 'Enter':
      return 'Return'
    case 'Tab':
      return 'Tab'
    case 'Backspace':
      return 'Backspace'
    case 'Delete':
      return 'Delete'
    case 'Home':
    case 'End':
    case 'PageUp':
    case 'PageDown':
    case 'Insert':
      return k
    case '+':
      return 'Plus'
    default:
      // Symboles simples imprimables (-, =, [, ], etc.)
      return k.length === 1 ? k : null
  }
}
