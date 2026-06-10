// Mini-navigateur en overlay — barre d'outils maison pilotant une <webview>.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './browser.css'

// La <webview> n'est pas typée par défaut côté renderer : on déclare le minimum utilisé.
interface Webview extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  getURL(): string
}

const view = document.getElementById('view') as unknown as Webview
const urlInput = document.getElementById('url') as HTMLInputElement
const backBtn = document.getElementById('back') as HTMLButtonElement
const forwardBtn = document.getElementById('forward') as HTMLButtonElement
const reloadBtn = document.getElementById('reload') as HTMLButtonElement
const homeBtn = document.getElementById('home') as HTMLButtonElement
const pinBtn = document.getElementById('pin') as HTMLButtonElement
const closeBtn = document.getElementById('close') as HTMLButtonElement
const opacitySlider = document.getElementById('opacity') as HTMLInputElement

let homeUrl = ''
let pinned = true

/** Transforme une saisie en URL : adresse directe, ou recherche Google en repli. */
function toUrl(input: string): string {
  const value = input.trim()
  if (!value) return homeUrl
  if (/^https?:\/\//i.test(value)) return value
  // Ressemble à un domaine (contient un point, pas d'espace) → préfixe https.
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

function navigate(input: string): void {
  const url = toUrl(input)
  urlInput.value = url
  void view.loadURL(url)
}

/** Reflète l'URL courante et l'état des boutons précédent/suivant. */
function syncNavState(): void {
  const current = view.getURL?.() || ''
  if (current && document.activeElement !== urlInput) urlInput.value = current
  backBtn.disabled = !view.canGoBack?.()
  forwardBtn.disabled = !view.canGoForward?.()
  if (current) window.api.persistBrowserUrl(current)
}

function setPinned(value: boolean): void {
  pinned = value
  pinBtn.classList.toggle('is-on', value)
  pinBtn.title = value ? 'Toujours au premier plan (activé)' : 'Toujours au premier plan (désactivé)'
}

/* ---------- Câblage des contrôles ---------- */

backBtn.addEventListener('click', () => view.canGoBack() && view.goBack())
forwardBtn.addEventListener('click', () => view.canGoForward() && view.goForward())
reloadBtn.addEventListener('click', () => view.reload())
homeBtn.addEventListener('click', () => navigate(homeUrl))
closeBtn.addEventListener('click', () => void window.api.closeBrowser())

pinBtn.addEventListener('click', async () => {
  const next = await window.api.setBrowserAlwaysOnTop(!pinned)
  setPinned(next)
})

opacitySlider.addEventListener('input', () => {
  window.api.setBrowserOpacity(Number(opacitySlider.value))
})

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    navigate(urlInput.value)
    urlInput.blur()
  }
})
urlInput.addEventListener('focus', () => urlInput.select())

// Événements de la webview : titre, navigation, chargement.
view.addEventListener('did-navigate', syncNavState)
view.addEventListener('did-navigate-in-page', syncNavState)
view.addEventListener('did-start-loading', () => {
  reloadBtn.textContent = '✕'
  reloadBtn.title = 'Arrêter'
})
view.addEventListener('did-stop-loading', () => {
  reloadBtn.textContent = '⟳'
  reloadBtn.title = 'Recharger'
  syncNavState()
})

// Réglages mis à jour depuis la page de configuration (épinglage / opacité).
window.api.onBrowserState((cfg) => {
  setPinned(cfg.alwaysOnTop)
  opacitySlider.value = String(cfg.opacity)
})

/* ---------- Initialisation ---------- */

async function init(): Promise<void> {
  const cfg = await window.api.getBrowserConfig()
  homeUrl = cfg.homeUrl
  setPinned(cfg.alwaysOnTop)
  opacitySlider.value = String(cfg.opacity)
  const start = cfg.lastUrl || cfg.homeUrl
  urlInput.value = start
  view.src = start
}

void init()
