// Mini-navigateur en overlay — onglets + barre d'outils pilotant des <webview>.
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import './browser.css'
import { h } from './ui/dom'

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

let homeUrl = ''

interface Tab {
  id: number
  view: Webview
  tabEl: HTMLElement
  titleEl: HTMLElement
  url: string
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
  }
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
  const tab: Tab = { id, view, tabEl, titleEl, url }

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
  view.addEventListener('did-stop-loading', () => {
    if (id === activeId) reloadBtn.classList.remove('is-loading')
    if (id === activeId) syncNavState()
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

/* ---------- Initialisation ---------- */

async function init(): Promise<void> {
  const cfg = await window.api.getBrowserConfig()
  homeUrl = cfg.homeUrl
  const initial = cfg.tabs && cfg.tabs.length ? cfg.tabs : [cfg.homeUrl]
  initial.forEach((url) => createTab(url, false))
  if (tabs.length) setActive(tabs[0].id)
}

void init()
