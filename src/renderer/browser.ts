// Mini-navigateur en overlay — onglets + barre d'outils pilotant des <webview>.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './browser.css'
import { h } from './ui/dom'
import type { Favorite } from '@shared/types'

// La <webview> n'est pas typée par défaut côté renderer : on déclare le minimum utilisé.
interface Webview extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  loadURL(url: string): Promise<void>
  getURL(): string
  setZoomFactor(factor: number): void
  getWebContentsId(): number
}

const tabsBar = document.getElementById('tabs') as HTMLElement
const newTabBtn = document.getElementById('newtab') as HTMLButtonElement
const viewsBox = document.getElementById('views') as HTMLElement
const urlInput = document.getElementById('url') as HTMLInputElement
const backBtn = document.getElementById('back') as HTMLButtonElement
const forwardBtn = document.getElementById('forward') as HTMLButtonElement
const reloadBtn = document.getElementById('reload') as HTMLButtonElement
const homeBtn = document.getElementById('home') as HTMLButtonElement
const closeBtn = document.getElementById('close') as HTMLButtonElement
const zoomOutBtn = document.getElementById('zoomout') as HTMLButtonElement
const zoomInBtn = document.getElementById('zoomin') as HTMLButtonElement
const zoomLevelBtn = document.getElementById('zoomlevel') as HTMLButtonElement
const favBtn = document.getElementById('fav') as HTMLButtonElement
const favMenu = document.getElementById('favmenu') as HTMLElement

let homeUrl = ''
let favorites: Favorite[] = []

interface Tab {
  id: number
  view: Webview
  tabEl: HTMLElement
  titleEl: HTMLElement
  url: string
  /** Facteur de zoom de l'onglet (1 = 100 %). */
  zoom: number
  /** id de la webContents (lien avec les événements zoom côté main). */
  wcId: number
}

const tabs: Tab[] = []
let activeId = -1
let seq = 0

const activeTab = (): Tab | undefined => tabs.find((t) => t.id === activeId)

/** Transforme une saisie en URL : adresse directe, ou recherche Google en repli. */
function toUrl(input: string): string {
  const value = input.trim()
  if (!value) return homeUrl
  if (/^https?:\/\//i.test(value)) return value
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

/** Libellé court d'onglet à partir d'une URL (repli avant le titre de page). */
function shortLabel(u: string): string {
  try {
    const x = new URL(u)
    const path = x.pathname !== '/' ? x.pathname : ''
    return x.hostname.replace(/^www\./, '') + path
  } catch {
    return u
  }
}

/** Mémorise la liste des onglets ouverts (restaurés à la réouverture). */
function persistTabs(): void {
  window.api.persistBrowserTabs(tabs.map((t) => t.url))
}

/** Reflète l'état précédent/suivant de l'onglet actif. */
function syncNavState(): void {
  const t = activeTab()
  backBtn.disabled = !t?.view.canGoBack?.()
  forwardBtn.disabled = !t?.view.canGoForward?.()
}

function setActive(id: number): void {
  activeId = id
  for (const t of tabs) {
    const on = t.id === id
    t.view.style.display = on ? '' : 'none'
    t.tabEl.classList.toggle('is-active', on)
  }
  const t = activeTab()
  if (t) {
    urlInput.value = t.url
    syncNavState()
    updateZoomLabel()
    updateFavState()
  }
}

/* ---------- Zoom ---------- */

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3

function updateZoomLabel(): void {
  const t = activeTab()
  zoomLevelBtn.textContent = `${Math.round((t?.zoom ?? 1) * 100)}%`
}

/** Applique un facteur de zoom à un onglet (borné, arrondi à 0,1). */
function setZoom(tab: Tab, factor: number): void {
  tab.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(factor * 10) / 10))
  tab.view.setZoomFactor(tab.zoom)
  if (tab.id === activeId) updateZoomLabel()
}

function zoomActive(delta: number): void {
  const t = activeTab()
  if (t) setZoom(t, t.zoom + delta)
}

function resetZoomActive(): void {
  const t = activeTab()
  if (t) setZoom(t, 1)
}

/* ---------- Favoris ---------- */

const isFavorite = (url: string): boolean => favorites.some((f) => f.url === url)

/** Met à jour l'étoile (pleine si la page active est en favori). */
function updateFavState(): void {
  const t = activeTab()
  const on = !!t && isFavorite(t.url)
  favBtn.classList.toggle('is-on', on)
  favBtn.textContent = on ? '★' : '☆'
  favBtn.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris'
}

/** Ajoute/retire la page active des favoris. */
function toggleFavorite(): void {
  const t = activeTab()
  if (!t) return
  if (isFavorite(t.url)) {
    favorites = favorites.filter((f) => f.url !== t.url)
  } else {
    favorites.push({ title: t.titleEl.textContent || shortLabel(t.url), url: t.url })
  }
  window.api.persistBrowserFavorites(favorites)
  updateFavState()
  renderFavMenu()
}

function removeFavorite(url: string): void {
  favorites = favorites.filter((f) => f.url !== url)
  window.api.persistBrowserFavorites(favorites)
  updateFavState()
  renderFavMenu()
}

/** (Re)construit le contenu du menu favoris. */
function renderFavMenu(): void {
  favMenu.replaceChildren()

  const t = activeTab()
  const current = t && !isFavorite(t.url)
  const addBtn = h('button', {
    class: 'bx-fav-add',
    text: current ? '＋ Ajouter cette page' : '★ Page déjà en favori',
    on: { click: () => toggleFavorite() }
  }) as HTMLButtonElement
  addBtn.disabled = !current
  favMenu.append(addBtn)

  if (favorites.length === 0) {
    favMenu.append(h('div', { class: 'bx-fav-empty', text: 'Aucun favori pour le moment.' }))
    return
  }

  for (const fav of favorites) {
    const link = h('button', {
      class: 'bx-fav-link',
      text: fav.title || shortLabel(fav.url),
      title: fav.url,
      on: {
        click: () => {
          navigate(fav.url)
          closeFavMenu()
        }
      }
    })
    const del = h('button', {
      class: 'bx-fav-del',
      text: '✕',
      title: 'Retirer ce favori',
      on: { click: () => removeFavorite(fav.url) }
    })
    favMenu.append(h('div', { class: 'bx-fav-item' }, [link, del]))
  }
}

function openFavMenu(): void {
  renderFavMenu()
  favMenu.hidden = false
}
function closeFavMenu(): void {
  favMenu.hidden = true
}
function toggleFavMenu(): void {
  if (favMenu.hidden) openFavMenu()
  else closeFavMenu()
}

function navigate(input: string): void {
  const t = activeTab()
  if (!t) return
  const url = toUrl(input)
  urlInput.value = url
  void t.view.loadURL(url)
}

function createTab(url: string, activate = true): void {
  const view = document.createElement('webview') as unknown as Webview
  view.setAttribute('class', 'bx-view')
  view.setAttribute('allowpopups', '')
  view.setAttribute('src', url)
  viewsBox.append(view)

  const id = ++seq
  const titleEl = h('span', { class: 'bx-tab-title', text: shortLabel(url) })
  const closeEl = h('button', { class: 'bx-tab-close', text: '✕', title: 'Fermer l’onglet' })
  const tabEl = h('div', { class: 'bx-tab', title: url }, [titleEl, closeEl])
  const tab: Tab = { id, view, tabEl, titleEl, url, zoom: 1, wcId: 0 }

  tabEl.addEventListener('click', (e) => {
    if (e.target === closeEl) return
    setActive(id)
  })
  closeEl.addEventListener('click', (e) => {
    e.stopPropagation()
    closeTab(id)
  })

  const onNav = (): void => {
    tab.url = view.getURL?.() || tab.url
    tab.tabEl.title = tab.url
    if (id === activeId) {
      if (document.activeElement !== urlInput) urlInput.value = tab.url
      syncNavState()
      updateFavState()
    }
    persistTabs()
  }
  view.addEventListener('did-navigate', onNav)
  view.addEventListener('did-navigate-in-page', onNav)
  view.addEventListener('page-title-updated', (e: Event) => {
    const title = (e as unknown as { title?: string }).title
    titleEl.textContent = title || shortLabel(tab.url)
  })
  view.addEventListener('did-start-loading', () => {
    if (id === activeId) reloadBtn.classList.add('is-loading')
  })
  view.addEventListener('dom-ready', () => {
    tab.wcId = view.getWebContentsId?.() ?? 0
  })
  view.addEventListener('did-stop-loading', () => {
    if (id === activeId) reloadBtn.classList.remove('is-loading')
    if (id === activeId) syncNavState()
    // Le zoom peut être réinitialisé après une navigation cross-origin : on le réapplique.
    view.setZoomFactor(tab.zoom)
  })

  tabs.push(tab)
  tabsBar.insertBefore(tabEl, newTabBtn)
  if (activate) setActive(id)
  persistTabs()
}

function closeTab(id: number): void {
  const idx = tabs.findIndex((t) => t.id === id)
  if (idx === -1) return
  const [t] = tabs.splice(idx, 1)
  t.tabEl.remove()
  t.view.remove()
  // Fermer le dernier onglet ferme la fenêtre du navigateur.
  if (tabs.length === 0) {
    void window.api.closeBrowser()
    return
  }
  if (activeId === id) setActive(tabs[Math.min(idx, tabs.length - 1)].id)
  persistTabs()
}

/* ---------- Câblage des contrôles ---------- */

backBtn.addEventListener('click', () => {
  const t = activeTab()
  if (t?.view.canGoBack()) t.view.goBack()
})
forwardBtn.addEventListener('click', () => {
  const t = activeTab()
  if (t?.view.canGoForward()) t.view.goForward()
})
reloadBtn.addEventListener('click', () => activeTab()?.view.reload())
homeBtn.addEventListener('click', () => navigate(homeUrl))
closeBtn.addEventListener('click', () => void window.api.closeBrowser())
newTabBtn.addEventListener('click', () => createTab(homeUrl))
zoomOutBtn.addEventListener('click', () => zoomActive(-0.1))
zoomInBtn.addEventListener('click', () => zoomActive(0.1))
zoomLevelBtn.addEventListener('click', () => resetZoomActive())
favBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleFavMenu()
})
// Ferme le menu favoris au clic en dehors.
document.addEventListener('click', (e) => {
  if (!favMenu.hidden && !favMenu.contains(e.target as Node) && e.target !== favBtn) closeFavMenu()
})

// Raccourcis clavier de zoom quand la barre d'outils a le focus (Ctrl +/-/0).
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return
  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    zoomActive(0.1)
  } else if (e.key === '-') {
    e.preventDefault()
    zoomActive(-0.1)
  } else if (e.key === '0') {
    e.preventDefault()
    resetZoomActive()
  }
})

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    navigate(urlInput.value)
    urlInput.blur()
  }
})
urlInput.addEventListener('focus', () => urlInput.select())

// Lien ouvrant une nouvelle fenêtre (target=_blank, window.open, Ctrl/clic-milieu)
// → ouvre un nouvel onglet (en avant-plan, ou en arrière-plan pour Ctrl/clic-milieu).
window.api.onBrowserOpenTab(({ url, active }) => createTab(url, active))

// Zoom appliqué côté main (raccourci/molette pendant que la page a le focus) :
// on met à jour l'état de l'onglet correspondant et le label si actif.
window.api.onBrowserZoom(({ wcId, factor }) => {
  const t = tabs.find((tab) => tab.wcId === wcId)
  if (!t) return
  t.zoom = factor
  if (t.id === activeId) updateZoomLabel()
})

/* ---------- Initialisation ---------- */

async function init(): Promise<void> {
  const cfg = await window.api.getBrowserConfig()
  homeUrl = cfg.homeUrl
  favorites = cfg.favorites ? [...cfg.favorites] : []
  const initial = cfg.tabs && cfg.tabs.length ? cfg.tabs : [cfg.homeUrl]
  initial.forEach((url) => createTab(url, false))
  if (tabs.length) setActive(tabs[0].id)
}

void init()
