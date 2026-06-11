/** Sélection de zone par drag : dessine le rectangle et renvoie la zone au main. */

const selection = document.getElementById('selection') as HTMLDivElement

let dragging = false
let startX = 0
let startY = 0

/** Taille minimale (px) pour considérer le drag comme une vraie sélection. */
const MIN_SIZE = 8

function rect(x1: number, y1: number, x2: number, y2: number): {
  x: number
  y: number
  width: number
  height: number
} {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}

document.addEventListener('mousedown', (e) => {
  dragging = true
  startX = e.clientX
  startY = e.clientY
  selection.style.display = 'block'
  selection.style.left = `${startX}px`
  selection.style.top = `${startY}px`
  selection.style.width = '0px'
  selection.style.height = '0px'
})

document.addEventListener('mousemove', (e) => {
  if (!dragging) return
  const r = rect(startX, startY, e.clientX, e.clientY)
  selection.style.left = `${r.x}px`
  selection.style.top = `${r.y}px`
  selection.style.width = `${r.width}px`
  selection.style.height = `${r.height}px`
})

document.addEventListener('mouseup', (e) => {
  if (!dragging) return
  dragging = false
  const r = rect(startX, startY, e.clientX, e.clientY)
  // Clic sans drag (ou trop petit) : annulation.
  window.api.sendZonePicked(r.width >= MIN_SIZE && r.height >= MIN_SIZE ? r : null)
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.sendZonePicked(null)
})
