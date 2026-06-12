// Design system Paradow / Midnight Ember (fourni dans design-system/)
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import '@ds/ds/styles.css'
import './app.css'
import markUrl from '@ds/logo/midnight-ember__mark-square.svg'
import faviconUrl from '@ds/logo/midnight-ember__favicon-512.svg'

// Favicon de la page = logo du design system (Midnight Ember).
const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = faviconUrl
document.head.append(favicon)

import type {
  AccountConfig,
  AppConfig,
  DetectedWindow,
  ShortcutRegistration,
  UpdateState
} from '@shared/types'
import { h, clear } from './ui/dom'
import { eventToAccelerator, eventToMouseAccelerator } from './ui/accelerator'
import { CLASSES, classGlyphInner } from './classGlyphs'
import { classIconUrl } from './classIcons'

type PageId =
  | 'accounts'
  | 'shortcuts'
  | 'layout'
  | 'overlay'
  | 'browser'
  | 'combat'
  | 'macro'
  | 'windows'
  | 'about'

interface State {
  config: AppConfig
  windows: DetectedWindow[]
  registrations: ShortcutRegistration[]
  update: UpdateState
  showAllWindows: boolean
  dirty: boolean
  page: PageId
  version: string
  /** Menu burger (navigation) ouvert — utile uniquement sur petite fenêtre. */
  menuOpen: boolean
}

const state: State = {
  config: {
    accounts: [],
    cycleNext: '',
    cyclePrev: '',
    layoutMode: 'maximize-active',
    enabled: true,
    overlay: { enabled: false, opacity: 0.9 },
    accountBar: { enabled: false, opacity: 0.95 },
    browser: {
      enabled: false,
      opacity: 1,
      homeUrl: 'https://www.google.com'
    },
    combat: { endTurnKey: 'F1', switchDelay: 150, autoDetect: false },
    quickMacro: {
      enabled: false,
      shortcut: 'Ctrl+Alt+R',
      countdownSec: 3,
      betweenAccountsMs: 600,
      opacity: 0.95
    },
    hideOverlaysOutsideGame: true
  },
  windows: [],
  registrations: [],
  update: { status: 'idle' },
  showAllWindows: false,
  dirty: false,
  page: 'accounts',
  version: '',
  menuOpen: false
}

const root = document.getElementById('app') as HTMLElement

async function init(): Promise<void> {
  state.version = await window.api.getVersion()
  state.config = await window.api.getConfig()
  await refreshWindows()
  window.api.onShortcutsState((regs) => {
    state.registrations = regs
    render()
  })
  window.api.onUpdateState((s) => {
    state.update = s
    render()
  })
  window.api.onBrowserState((cfg) => {
    // N'écrase pas une édition en cours (dirty) pour ne pas perdre la saisie.
    if (state.dirty) return
    state.config.browser = cfg
    render()
  })
  render()
}

/* ---------- État ---------- */

function markDirty(): void {
  state.dirty = true
  render()
}

async function save(): Promise<void> {
  const { config, shortcuts } = await window.api.setConfig(state.config)
  state.config = config
  state.registrations = shortcuts
  state.dirty = false
  await refreshWindows()
}

async function refreshWindows(): Promise<void> {
  state.windows = await window.api.listWindows(state.showAllWindows)
  render()
}

function addAccount(matchTitle = '', label = ''): void {
  const order = state.config.accounts.length
  state.config.accounts.push({
    id: crypto.randomUUID(),
    label: label || `Compte ${order + 1}`,
    matchTitle,
    order
  })
  markDirty()
}

function removeAccount(id: string): void {
  state.config.accounts = state.config.accounts
    .filter((a) => a.id !== id)
    .map((a, i) => ({ ...a, order: i }))
  markDirty()
}

function moveAccount(id: string, delta: number): void {
  const accounts = [...state.config.accounts].sort((a, b) => a.order - b.order)
  const i = accounts.findIndex((a) => a.id === id)
  const j = i + delta
  if (i === -1 || j < 0 || j >= accounts.length) return
  ;[accounts[i], accounts[j]] = [accounts[j], accounts[i]]
  state.config.accounts = accounts.map((a, idx) => ({ ...a, order: idx }))
  markDirty()
}

const failed = (): ShortcutRegistration[] => state.registrations.filter((r) => !r.ok)

/* ---------- Rendu ---------- */

/** Navigation latérale : une entrée par fonctionnalité, regroupées par thème. */
const NAV: { group: string; items: { id: PageId; label: string; icon: string }[] }[] = [
  {
    group: 'Configuration',
    items: [
      { id: 'accounts', label: 'Comptes', icon: 'users' },
      { id: 'shortcuts', label: 'Raccourcis', icon: 'key' },
      { id: 'layout', label: 'Disposition', icon: 'grid' },
      { id: 'overlay', label: 'Overlays', icon: 'tag' },
      { id: 'browser', label: 'Navigateur', icon: 'globe' },
      { id: 'combat', label: 'Mode combat', icon: 'sword' },
      { id: 'macro', label: 'Macro rapide', icon: 'rec' }
    ]
  },
  {
    group: 'Système',
    items: [
      { id: 'windows', label: 'Fenêtres détectées', icon: 'window' },
      { id: 'about', label: 'À propos', icon: 'info' }
    ]
  }
]

const PAGES: Record<PageId, () => HTMLElement> = {
  accounts: renderAccounts,
  shortcuts: renderCycle,
  layout: renderLayout,
  overlay: renderOverlays,
  browser: renderBrowser,
  combat: renderCombat,
  macro: renderMacro,
  windows: renderDetected,
  about: renderAbout
}

function setPage(id: PageId): void {
  state.page = id
  state.menuOpen = false
  render()
}

function toggleMenu(): void {
  state.menuOpen = !state.menuOpen
  render()
}

function render(): void {
  clear(root)
  root.append(renderTopbar())

  const content = h('div', { class: 'content' })

  const banner = renderUpdateBanner()
  if (banner) content.append(banner)
  const conflicts = failed()
  if (conflicts.length) content.append(renderConflicts(conflicts))

  content.append(PAGES[state.page]())

  const layout = h('div', { class: 'layout' }, [renderSidebar(), content])
  if (state.menuOpen) {
    layout.append(
      h('div', { class: 'menu-backdrop', on: { click: () => toggleMenu() } })
    )
  }
  root.append(layout)
}

function renderSidebar(): HTMLElement {
  const nav = h('nav', { class: 'toc' })
  for (const section of NAV) {
    nav.append(h('div', { class: 'toc-label', text: section.group }))
    for (const item of section.items) {
      nav.append(
        h('button', {
          class: `toc-link${state.page === item.id ? ' active' : ''}`,
          on: { click: () => setPage(item.id) }
        }, [iconEl(item.icon), h('span', { text: item.label })])
      )
    }
  }
  nav.append(
    h('div', { class: 'toc-foot' }, [
      h('span', { text: 'paradow' }),
      h('span', { class: 'toc-ver', text: state.version ? `v${state.version}` : '' })
    ])
  )
  return h('aside', { class: `sidebar${state.menuOpen ? ' open' : ''}` }, [nav])
}

/** En-tête de page : un seul titre (+ description courte facultative). */
function pageEl(title: string, desc: string, ...rest: (Node | null)[]): HTMLElement {
  const head = h('div', { class: 'page-head' }, [h('h1', { class: 'page-title', text: title })])
  if (desc) head.append(h('p', { class: 'page-desc', text: desc }))
  const sec = h('section', { class: 'page-sec' }, [head])
  for (const r of rest) if (r) sec.append(r)
  return sec
}

function renderTopbar(): HTMLElement {
  // Bouton burger : visible uniquement sur petite fenêtre (voir app.css),
  // ouvre la navigation en tiroir latéral.
  const burger = h('button', {
    class: 'burger',
    attrs: { 'aria-label': 'Menu', 'aria-expanded': String(state.menuOpen) },
    on: { click: () => toggleMenu() }
  })
  burger.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    (state.menuOpen
      ? '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>'
      : '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>') +
    '</svg>'

  const brand = h('div', { class: 'brand' }, [
    h('img', { attrs: { src: markUrl, width: '26', height: '26', alt: 'Paradow' } }),
    h('span', { class: 'brand-name', text: 'paradow' }),
    h('span', { class: 'brand-sep', text: '/' }),
    h('span', { class: 'brand-doc', text: 'Multi-Account' })
  ])

  const enabled = renderSwitch(
    state.config.enabled ? 'Actif' : 'Inactif',
    state.config.enabled,
    (v) => {
      state.config.enabled = v
      void save()
    }
  )

  const saveBtn = h('button', {
    class: `btn btn--sm ${state.dirty ? 'btn--primary' : 'btn--secondary'}`,
    text: state.dirty ? 'Enregistrer' : 'À jour',
    on: { click: () => void save() }
  }) as HTMLButtonElement
  saveBtn.disabled = !state.dirty

  const meta = h('div', { class: 'topbar-meta' }, [enabled, saveBtn])
  const upd = renderUpdate()
  if (upd) meta.prepend(upd)
  if (state.version) meta.prepend(h('span', { class: 'ver-chip', text: `v${state.version}` }))

  return h('header', { class: 'topbar' }, [
    h('div', { class: 'topbar-left' }, [burger, brand]),
    meta
  ])
}

/**
 * Indicateur compact de mise à jour dans l'en-tête (null si rien à montrer).
 * Les états « téléchargement » et « prêt » sont portés par la bannière pleine
 * largeur (renderUpdateBanner) ; l'en-tête ne garde que les états brefs.
 */
function renderUpdate(): HTMLElement | null {
  const u = state.update
  switch (u.status) {
    case 'available':
      return h('span', { class: 'upd-note', text: 'MAJ disponible' })
    case 'checking':
      return h('span', { class: 'upd-note', text: 'Recherche MAJ…' })
    default:
      return null
  }
}

/**
 * Bannière de mise à jour (pleine largeur) affichée pendant le cycle de MAJ :
 * mise en place dès le téléchargement automatique, avec barre de progression,
 * puis invite au redémarrage une fois la MAJ téléchargée.
 */
function renderUpdateBanner(): HTMLElement | null {
  const u = state.update

  if (u.status === 'downloading') {
    const pct = u.percent ?? 0
    const fill = h('div', { class: 'upd-progress-fill', attrs: { style: `width:${pct}%` } })
    const bar = h('div', {
      class: 'upd-progress',
      attrs: {
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(pct)
      }
    }, [fill])

    return h('div', { class: 'alert alert--info upd-banner' }, [
      h('div', { class: 'alert-body' }, [
        h('strong', { text: `Téléchargement de la mise à jour${u.version ? ` v${u.version}` : ''}…` }),
        h('p', { text: 'La mise à jour s’installera automatiquement à la prochaine fermeture.' }),
        h('div', { class: 'upd-banner-row' }, [bar, h('span', { class: 'upd-pct', text: `${pct}%` })])
      ])
    ])
  }

  if (u.status === 'downloaded') {
    return h('div', { class: 'alert alert--success upd-banner' }, [
      h('div', { class: 'alert-body' }, [
        h('strong', { text: `Mise à jour v${u.version ?? ''} prête` }),
        h('p', { text: 'Redémarrez l’application pour terminer l’installation.' }),
        h('div', { class: 'upd-banner-row' }, [
          h('button', {
            class: 'btn btn--primary btn--sm',
            text: 'Redémarrer maintenant',
            on: { click: () => void window.api.installUpdate() }
          })
        ])
      ])
    ])
  }

  return null
}

function renderConflicts(conflicts: ShortcutRegistration[]): HTMLElement {
  const list = conflicts.map((c) => `${c.label} (${c.accelerator})`).join(', ')
  return h('div', { class: 'alert alert--danger' }, [
    h('div', { class: 'alert-body' }, [
      h('strong', { text: 'Raccourci(s) en conflit' }),
      h('p', { text: `Impossible d'enregistrer : ${list}. Déjà utilisés par une autre application ?` })
    ])
  ])
}

/** Jeu d'icônes monochromes (stroke) pour la navigation latérale. */
const ICONS: Record<string, string[]> = {
  users: [
    'M17 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1',
    'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
    'M22 20v-1a4 4 0 0 0-3-3.87',
    'M16 4.13a4 4 0 0 1 0 7.75'
  ],
  key: ['M3 6h18v12H3z', 'M7 10h.01', 'M11 10h.01', 'M15 10h.01', 'M7 14h10'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  tag: [
    'M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82z',
    'M7.5 7.5h.01'
  ],
  refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v5h-5'],
  window: ['M3 4h18v16H3z', 'M3 9h18'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3a15 15 0 0 1 0 18', 'M12 3a15 15 0 0 0 0 18'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  sword: ['M5 19L19 5', 'M8.5 9.5L14.5 15.5', 'M5 19 m0 0 a1.8 1.8 0 1 0 0.01 0'],
  rec: ['M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 0 0-4 0']
}

function iconEl(name: string): SVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const d of ICONS[name] ?? []) {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    svg.append(p)
  }
  return svg
}

function renderAccounts(): HTMLElement {
  const accounts = [...state.config.accounts].sort((a, b) => a.order - b.order)

  const body = h('tbody', {})
  if (accounts.length === 0) {
    body.append(
      h('tr', {}, [
        h('td', { class: 'ink-3', attrs: { colspan: '7', style: 'text-align:center;padding:18px;' },
          text: 'Aucun compte. Ajoutez-en un, ou créez-en depuis les fenêtres détectées ci-dessous.' })
      ])
    )
  }
  accounts.forEach((acc, i) => body.append(renderAccountRow(acc, i, accounts.length)))

  const table = h('div', { class: 'table-wrap' }, [
    h('table', { class: 'table' }, [
      h('thead', {}, [
        h('tr', {}, [
          h('th', { text: '' }),
          h('th', { text: 'Compte' }),
          h('th', { text: 'Classe' }),
          h('th', { text: 'Filtre du titre' }),
          h('th', { text: 'Raccourci' }),
          h('th', { text: '' }),
          h('th', { text: '' })
        ])
      ]),
      body
    ])
  ])

  const addBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: '+ Ajouter un compte',
    on: { click: () => addAccount() }
  })

  return pageEl(
    'Comptes',
    'Associez chaque personnage à sa fenêtre Dofus pour l’activer au raccourci.',
    table,
    h('div', { class: 'row-actions' }, [addBtn])
  )
}

function renderAccountRow(acc: AccountConfig, idx: number, total: number): HTMLElement {
  const active = state.windows.some((w) => w.accountId === acc.id)

  const order = h('div', { class: 'order-ctrl' }, [
    iconBtn('▲', idx === 0, () => moveAccount(acc.id, -1)),
    iconBtn('▼', idx === total - 1, () => moveAccount(acc.id, 1))
  ])
  const orderCell = h('td', { attrs: { style: 'width:34px;' } }, [order])

  const dot = h('span', {
    class: active ? 'dot dot--success' : 'dot dot--off',
    title: active ? 'Fenêtre détectée' : 'Aucune fenêtre détectée'
  })
  const label = textInput(acc.label, 'Nom du personnage', (v) => {
    acc.label = v
    state.dirty = true
    syncSaveButton()
  })
  const labelCell = h('td', {}, [h('div', { class: 'cell-flex' }, [dot, label])])

  const classCell = h('td', { attrs: { style: 'width:170px;' } }, [classSelect(acc)])

  const matchCell = h('td', {}, [
    textInput(acc.matchTitle, 'Texte du titre', (v) => {
      acc.matchTitle = v
      state.dirty = true
      syncSaveButton()
    }, true)
  ])

  const scCell = h('td', { attrs: { style: 'width:150px;' } }, [
    shortcutCapture(acc.shortcut ?? '', (a) => {
      acc.shortcut = a || undefined
      markDirty()
    })
  ])

  const focusBtn = h('button', {
    class: 'btn btn--ghost btn--sm',
    text: 'Activer',
    title: 'Mettre cette fenêtre au premier plan',
    on: { click: () => void window.api.focusAccount(acc.id) }
  })
  const delBtn = h('button', {
    class: 'btn btn--ghost btn--sm btn--icon',
    text: '✕',
    title: 'Supprimer',
    on: { click: () => removeAccount(acc.id) }
  })

  return h('tr', {}, [
    orderCell,
    labelCell,
    classCell,
    matchCell,
    scCell,
    h('td', { attrs: { style: 'width:74px;' } }, [focusBtn]),
    h('td', { attrs: { style: 'width:44px;' } }, [delBtn])
  ])
}

/**
 * Petit emblème d'une classe : icône officielle bundlée si disponible, sinon
 * repli sur l'emblème monochrome SVG (couleur accent si définie, sinon atténué).
 */
function classEmblem(classId?: string): HTMLElement | SVGElement {
  const iconUrl = classIconUrl(classId)
  if (iconUrl) {
    return h('img', {
      class: 'class-icon',
      attrs: { src: iconUrl, alt: '', width: '20', height: '20' }
    })
  }
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '20')
  svg.setAttribute('height', '20')
  svg.style.color = classId ? 'var(--accent)' : 'var(--ink-4)'
  svg.style.flex = 'none'
  svg.innerHTML = classGlyphInner(classId)
  return svg
}

/** Sélecteur de classe d'un compte (emblème + liste déroulante). */
function classSelect(acc: AccountConfig): HTMLElement {
  const sel = h('select', {
    class: 'input',
    on: {
      change: (e) => {
        acc.class = (e.target as HTMLSelectElement).value || undefined
        markDirty()
      }
    }
  }) as HTMLSelectElement
  sel.append(optionEl('', '(aucune)'))
  for (const c of CLASSES) sel.append(optionEl(c.id, c.label))
  sel.value = acc.class ?? ''
  return h('div', { class: 'cell-flex' }, [
    classEmblem(acc.class),
    h('div', { class: 'select-wrap' }, [sel, caret()])
  ])
}

function renderCycle(): HTMLElement {
  const cycleGrid = h('div', { class: 'input-grid two' }, [
    field('Compte suivant', shortcutCapture(state.config.cycleNext, (a) => {
      state.config.cycleNext = a
      markDirty()
    })),
    field('Compte précédent', shortcutCapture(state.config.cyclePrev, (a) => {
      state.config.cyclePrev = a
      markDirty()
    }))
  ])

  const overlayGrid = h('div', { class: 'input-grid two' }, [
    field('Overlay personnage', shortcutCapture(state.config.overlayToggle ?? '', (a) => {
      state.config.overlayToggle = a || undefined
      markDirty()
    })),
    field('Barre de comptes', shortcutCapture(state.config.accountBarToggle ?? '', (a) => {
      state.config.accountBarToggle = a || undefined
      markDirty()
    })),
    field('Overlay navigateur', shortcutCapture(state.config.browserToggle ?? '', (a) => {
      state.config.browserToggle = a || undefined
      markDirty()
    }))
  ])

  return pageEl(
    'Raccourcis',
    'Cyclez entre les comptes et affichez/masquez les overlays.',
    h('div', { class: 'field-label', text: 'Cycle des comptes' }),
    cycleGrid,
    h('div', { class: 'field-label sec-gap', text: 'Affichage des overlays' }),
    overlayGrid,
  )
}

/** Page dédiée à la macro rapide éphémère. */
function renderMacro(): HTMLElement {
  return pageEl(
    'Macro rapide',
    'Enregistrez une séquence de touches et de clics sur votre premier compte, puis rejouez-la sur les autres. La macro est effacée après exécution.',
    ...quickMacroSection()
  )
}

/** Section « macro rapide » : enregistrer une séquence puis la rejouer sur les autres comptes. */
function quickMacroSection(): (Node | null)[] {
  const qm = state.config.quickMacro

  const toggle = renderSwitch('Activer la macro rapide', qm.enabled, (v) => {
    qm.enabled = v
    void save()
  })

  const shortcutRow = field(
    'Raccourci d’enregistrement',
    shortcutCapture(qm.shortcut, (a) => {
      if (!a) return
      qm.shortcut = a
      markDirty()
    })
  )

  // Compte à rebours avant l'enregistrement (1 / 3 / 5 secondes).
  const countdownSel = h('select', {
    class: 'input',
    on: {
      change: (e) => {
        qm.countdownSec = Number((e.target as HTMLSelectElement).value)
        markDirty()
      }
    }
  }, [
    optionEl('1', '1 seconde'),
    optionEl('3', '3 secondes'),
    optionEl('5', '5 secondes')
  ]) as HTMLSelectElement
  countdownSel.value = String(qm.countdownSec)
  const countdownRow = field(
    'Délai avant enregistrement',
    h('div', { class: 'select-wrap' }, [countdownSel, caret()])
  )

  const grid = h('div', { class: 'input-grid two' }, [shortcutRow, countdownRow])

  // Délai entre chaque compte lors de la lecture (0 → 2000 ms).
  const delayPct = (v: number): string => `${v} ms`
  const delayLabel = h('span', { class: 'upd-pct', text: delayPct(qm.betweenAccountsMs) })
  const delaySlider = h('input', {
    type: 'range',
    class: 'range',
    attrs: { min: '0', max: '2000', step: '100', value: String(qm.betweenAccountsMs) },
    on: {
      input: (e) => {
        delayLabel.textContent = delayPct(Number((e.target as HTMLInputElement).value))
      },
      change: (e) => {
        qm.betweenAccountsMs = Number((e.target as HTMLInputElement).value)
        markDirty()
      }
    }
  }) as HTMLInputElement
  const delayRow = h('div', { class: 'field' }, [
    h('span', { class: 'field-label', text: 'Délai entre les comptes' }),
    h('div', { class: 'range-row' }, [delaySlider, delayLabel])
  ])

  const opacityRow = opacityField(qm.opacity, qm.enabled, (v) => {
    qm.opacity = v
    void save()
  })

  const resetBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Réinitialiser la position',
    title: 'Re-centrer le panneau en bas de l’écran',
    on: { click: () => void window.api.resetMacroBarPosition() }
  }) as HTMLButtonElement
  resetBtn.disabled = !qm.enabled

  const note = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Enregistrez une séquence de <strong>touches et clics</strong> sur votre premier compte ' +
          '(raccourci ci-dessus, puis <strong>F12</strong> pour arrêter), et rejouez-la sur les ' +
          '<strong>autres comptes</strong> dans l’ordre de cycle. <strong>Échap</strong> interrompt la lecture. ' +
          'La macro est <strong>éphémère</strong>&nbsp;: elle est effacée après exécution.'
      })
    ])
  ])

  return [
    h('div', { class: 'combat-row' }, [toggle]),
    grid,
    delayRow,
    opacityRow,
    h('div', { class: 'row-actions' }, [resetBtn]),
    note
  ]
}

function renderLayout(): HTMLElement {
  const select = h('select', {
    class: 'input',
    on: {
      change: (e) => {
        state.config.layoutMode = (e.target as HTMLSelectElement).value as AppConfig['layoutMode']
        markDirty()
      }
    }
  }, [
    optionEl('none', 'Ne rien toucher (juste mettre au premier plan)'),
    optionEl('maximize-active', 'Agrandir la fenêtre active'),
    optionEl('grid', 'Mosaïque (toutes les fenêtres)')
  ]) as HTMLSelectElement
  select.value = state.config.layoutMode

  const grid = h('div', { class: 'input-grid' }, [
    field('Au changement de compte', h('div', { class: 'select-wrap' }, [select, caret()]))
  ])
  return pageEl(
    'Disposition des fenêtres',
    'Comment placer les fenêtres lors d’un changement de compte.',
    grid
  )
}

/** Curseur d'opacité réutilisable (aperçu live, application à la fin du drag). */
function opacityField(value: number, enabled: boolean, onChange: (v: number) => void): HTMLElement {
  const pct = (o: number): string => `${Math.round(o * 100)}%`
  const valueLabel = h('span', { class: 'upd-pct', text: pct(value) })
  const slider = h('input', {
    type: 'range',
    class: 'range',
    attrs: { min: '0.2', max: '1', step: '0.05', value: String(value) },
    on: {
      input: (e) => {
        valueLabel.textContent = pct(Number((e.target as HTMLInputElement).value))
      },
      change: (e) => onChange(Number((e.target as HTMLInputElement).value))
    }
  }) as HTMLInputElement
  slider.disabled = !enabled
  return h('div', { class: 'field' }, [
    h('span', { class: 'field-label', text: 'Opacité' }),
    h('div', { class: 'range-row' }, [slider, valueLabel])
  ])
}

/** Section « overlay du personnage » (étiquette du nom actif). */
function overlaySection(): (Node | null)[] {
  const ov = state.config.overlay
  const toggle = renderSwitch('Afficher l’overlay', ov.enabled, (v) => {
    ov.enabled = v
    void save()
  })
  const opacityRow = opacityField(ov.opacity, ov.enabled, (v) => {
    ov.opacity = v
    void save()
  })
  const resetBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Réinitialiser la position',
    title: 'Re-centrer l’overlay en haut de l’écran',
    on: { click: () => void window.api.resetOverlayPosition() }
  }) as HTMLButtonElement
  resetBtn.disabled = !ov.enabled
  const note = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Une étiquette <strong>toujours au premier plan</strong> affiche le nom du personnage actif. ' +
          'Sa taille s’ajuste au texte. Glissez-la pour la repositionner&nbsp;: sa place est mémorisée. ' +
          'Le nom se met à jour à chaque changement de compte.'
      })
    ])
  ])
  return [
    h('div', { class: 'combat-row' }, [toggle]),
    opacityRow,
    h('div', { class: 'row-actions' }, [resetBtn]),
    note
  ]
}

/** Section « barre de comptes » (tous les comptes, clic = focus). */
function accountBarSection(): (Node | null)[] {
  const ab = state.config.accountBar
  const toggle = renderSwitch('Afficher la barre de comptes', ab.enabled, (v) => {
    ab.enabled = v
    void save()
  })
  const opacityRow = opacityField(ab.opacity, ab.enabled, (v) => {
    ab.opacity = v
    void save()
  })
  const resetBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Réinitialiser la position',
    title: 'Re-centrer la barre en haut de l’écran',
    on: { click: () => void window.api.resetAccountBarPosition() }
  }) as HTMLButtonElement
  resetBtn.disabled = !ab.enabled
  const note = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Une barre <strong>toujours au premier plan</strong> liste tous vos comptes (emblème de classe + nom). ' +
          'Le compte <strong>actif</strong> est mis en avant (rouge), ceux <strong>sans fenêtre détectée</strong> sont atténués. ' +
          'Un <strong>clic</strong> sur un compte met sa fenêtre au premier plan. ' +
          'Glissez la barre pour la repositionner&nbsp;: sa place est mémorisée. ' +
          'L’emblème provient de la <strong>classe</strong> définie par compte (page Comptes).'
      })
    ])
  ])
  return [
    h('div', { class: 'combat-row' }, [toggle]),
    opacityRow,
    h('div', { class: 'row-actions' }, [resetBtn]),
    note
  ]
}

/** Page « Overlays » : overlay du personnage + barre de comptes réunis. */
function renderOverlays(): HTMLElement {
  const hideToggle = renderSwitch(
    'Masquer les overlays hors du jeu',
    state.config.hideOverlaysOutsideGame ?? true,
    (v) => {
      state.config.hideOverlaysOutsideGame = v
      void save()
    }
  )
  return pageEl(
    'Overlays',
    'Affichages flottants toujours au premier plan.',
    h('div', { class: 'combat-row' }, [hideToggle]),
    h('div', { class: 'field-label sec-gap', text: 'Overlay du personnage' }),
    ...overlaySection(),
    h('div', { class: 'field-label sec-gap', text: 'Barre de comptes' }),
    ...accountBarSection()
  )
}

function renderBrowser(): HTMLElement {
  const bx = state.config.browser

  const toggle = renderSwitch('Afficher le navigateur', bx.enabled, (v) => {
    bx.enabled = v
    void save() // prend effet immédiatement (ouvre/ferme la fenêtre)
  })

  const openBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Ouvrir maintenant',
    on: { click: () => void window.api.openBrowser() }
  })

  const homeInput = textInput(bx.homeUrl, 'https://…', (v) => {
    bx.homeUrl = v
    state.dirty = true
    syncSaveButton()
  }, true)
  const homeRow = field('Page d’accueil', homeInput)

  // Curseur d'opacité : aperçu live via le libellé, application à la fin du drag.
  const pct = (o: number): string => `${Math.round(o * 100)}%`
  const valueLabel = h('span', { class: 'upd-pct', text: pct(bx.opacity) })
  const slider = h('input', {
    type: 'range',
    class: 'range',
    attrs: { min: '0.3', max: '1', step: '0.05', value: String(bx.opacity) },
    on: {
      input: (e) => {
        valueLabel.textContent = pct(Number((e.target as HTMLInputElement).value))
      },
      change: (e) => {
        bx.opacity = Number((e.target as HTMLInputElement).value)
        void save()
      }
    }
  }) as HTMLInputElement
  const opacityRow = h('div', { class: 'field' }, [
    h('span', { class: 'field-label', text: 'Opacité' }),
    h('div', { class: 'range-row' }, [slider, valueLabel])
  ])

  const note = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Une fenêtre <strong>navigateur</strong> légère, redimensionnable et déplaçable ' +
          '(glissez la barre d’outils), <strong>toujours au premier plan</strong> pendant le jeu. ' +
          'Gérez plusieurs <strong>guides de quêtes</strong> via les <strong>onglets</strong>. ' +
          'Réglez sa transparence avec l’<strong>opacité</strong> ci-dessus. ' +
          'Les onglets ouverts et la taille de la fenêtre sont mémorisés.'
      })
    ])
  ])

  return pageEl(
    'Navigateur',
    'Un mini-navigateur en overlay pour consulter des guides tout en jouant.',
    h('div', { class: 'combat-row' }, [toggle, openBtn]),
    homeRow,
    opacityRow,
    note
  )
}

function renderCombat(): HTMLElement {
  const cm = state.config.combat ?? { endTurnKey: 'F1', switchDelay: 150, autoDetect: false }

  const toggleShortcut = field(
    'Raccourci mode combat',
    shortcutCapture(state.config.combatToggle ?? '', (a) => {
      state.config.combatToggle = a || undefined
      markDirty()
    })
  )

  const endTurnShortcut = field(
    'Touche fin de tour',
    shortcutCapture(cm.endTurnKey, (a) => {
      if (!a) return
      state.config.combat = { ...cm, endTurnKey: a }
      markDirty()
    })
  )

  const delayPct = (v: number): string => `${v} ms`
  const delayLabel = h('span', { class: 'upd-pct', text: delayPct(cm.switchDelay) })
  const delaySlider = h('input', {
    type: 'range',
    class: 'range',
    attrs: { min: '0', max: '500', step: '25', value: String(cm.switchDelay) },
    on: {
      input: (e) => {
        delayLabel.textContent = delayPct(Number((e.target as HTMLInputElement).value))
      },
      change: (e) => {
        state.config.combat = { ...cm, switchDelay: Number((e.target as HTMLInputElement).value) }
        markDirty()
      }
    }
  }) as HTMLInputElement
  const delayRow = h('div', { class: 'field', attrs: { style: 'margin-top: 32px' } }, [
    h('span', { class: 'field-label', text: 'Délai avant switch' }),
    h('div', { class: 'range-row' }, [delaySlider, delayLabel])
  ])

  const grid = h('div', { class: 'input-grid' }, [toggleShortcut, endTurnShortcut])

  // --- Détection automatique du combat (capture de la zone du bouton fin de tour) ---
  const detectToggle = renderSwitch(
    'Détection automatique du combat',
    cm.autoDetect ?? false,
    (v) => {
      state.config.combat = { ...cm, autoDetect: v }
      void save()
    }
  )

  const zoneStatus = h('span', {
    class: 'upd-pct',
    text: cm.detectZone
      ? `Zone : ${cm.detectZone.width}×${cm.detectZone.height} px @ (${cm.detectZone.x}, ${cm.detectZone.y})`
      : 'Aucune zone définie'
  })

  const pickBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: cm.detectZone ? 'Redéfinir la zone' : 'Définir la zone',
    title: 'À faire pendant un combat, bouton fin de tour visible',
    on: {
      click: () => {
        void (async () => {
          const updated = await window.api.pickCombatZone()
          if (updated) {
            state.config = updated
            render()
          }
        })()
      }
    }
  })

  // Aperçu de ce que « voit » la détection : capture courante de la zone +
  // distance à la signature de référence (verdict combat / hors combat).
  const previewImg = h('img', {
    class: 'zone-preview-img',
    attrs: { alt: 'Aperçu de la zone capturée' }
  }) as HTMLImageElement
  const previewVerdict = h('span', { class: 'upd-pct', text: '' })
  const previewBox = h('div', { class: 'zone-preview', attrs: { style: 'display: none' } }, [
    previewImg,
    previewVerdict
  ])

  const refreshPreview = async (): Promise<void> => {
    const p = await window.api.previewCombatZone()
    if (!p) {
      previewBox.style.display = 'none'
      return
    }
    previewImg.src = p.image
    previewVerdict.textContent = p.match
      ? `Combat détecté — distance ${p.distance} (seuil ${p.threshold})`
      : `Hors combat — distance ${p.distance} (seuil ${p.threshold})`
    previewVerdict.classList.toggle('zone-match', p.match)
    previewBox.style.display = 'flex'
  }

  const previewBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Aperçu de la zone',
    title: 'Capture la zone maintenant et compare à la référence',
    on: { click: () => void refreshPreview() }
  }) as HTMLButtonElement
  previewBtn.disabled = !cm.detectZone
  if (cm.detectZone) void refreshPreview()

  const detectRow = h(
    'div',
    { class: 'field', attrs: { style: 'margin-top: 32px' } },
    [
      h('span', { class: 'field-label', text: 'Détection automatique' }),
      h('div', { class: 'combat-row' }, [detectToggle]),
      h('div', { class: 'row-actions', attrs: { style: 'margin-top: 12px; display: flex; align-items: center; gap: 12px' } }, [
        pickBtn,
        previewBtn,
        zoneStatus
      ]),
      previewBox
    ]
  )

  const note = h('div', { class: 'alert alert--info', attrs: { style: 'margin-top: 32px' } }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Activez le mode combat via le <strong>raccourci clavier</strong> ou le bouton <strong>⚔</strong> dans la barre de comptes. ' +
          'Quand actif, appuyer sur la <strong>touche fin de tour</strong> (ex. F1) envoie la touche à Dofus ' +
          '<em>puis</em> bascule automatiquement vers le compte suivant après le délai configuré. ' +
          "Le mode combat se désactive seul après <strong>90 secondes</strong> d’inactivité."
      }),
      h('p', {
        attrs: { style: 'margin-top: 8px' },
        html:
          '<strong>Détection automatique</strong> : pendant un combat, cliquez « Définir la zone » puis ' +
          'dessinez un rectangle autour du bouton <strong>fin de tour</strong>. L’outil capture cette zone ' +
          'toutes les 2 secondes : si le bouton est visible, le mode combat s’active tout seul (et se ' +
          'désactive quand il disparaît).'
      })
    ])
  ])

  return pageEl(
    'Mode combat',
    'Switch automatique de compte à chaque fin de tour.',
    grid,
    delayRow,
    detectRow,
    note
  )
}

function renderDetected(): HTMLElement {
  const allSwitch = renderSwitch('Tout afficher', state.showAllWindows, (v) => {
    state.showAllWindows = v
    void refreshWindows()
  })
  const rescan = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Re-scanner',
    on: { click: () => void refreshWindows() }
  })
  const tools = h('div', { class: 'sec-tools' }, [allSwitch, rescan])

  const body = h('tbody', {})
  if (state.windows.length === 0) {
    body.append(
      h('tr', {}, [
        h('td', { class: 'ink-3', attrs: { colspan: '4', style: 'text-align:center;padding:18px;' },
          text: 'Aucune fenêtre détectée. Lancez Dofus puis re-scannez (ou activez « Tout afficher »).' })
      ])
    )
  }
  for (const win of state.windows) {
    const matched = win.accountId !== undefined
    const dotCls = matched ? 'dot dot--success' : win.isGame ? 'dot dot--info' : 'dot dot--off'
    const action = matched
      ? h('span', { class: 'ink-4 small', text: 'associé' })
      : h('button', {
          class: 'btn btn--ghost btn--sm',
          text: '+ Compte',
          on: { click: () => addAccount(win.title, win.title) }
        })
    body.append(
      h('tr', {}, [
        h('td', { attrs: { style: 'width:20px;' } }, [h('span', { class: dotCls })]),
        h('td', {}, [h('strong', { text: win.title })]),
        h('td', { class: 'mono small ink-3', text: win.exePath ?? '—' }),
        h('td', { attrs: { style: 'width:90px;' } }, [action])
      ])
    )
  }

  const table = h('div', { class: 'table-wrap' }, [
    h('table', { class: 'table' }, [
      h('thead', {}, [
        h('tr', {}, [h('th', { text: '' }), h('th', { text: 'Titre de la fenêtre' }), h('th', { text: 'Exécutable' }), h('th', { text: '' })])
      ]),
      body
    ])
  ])

  const hint = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', { html: 'Une fenêtre Dofus n’apparaît pas&nbsp;? Si le jeu est lancé <strong>en administrateur</strong>, lancez aussi cette application en administrateur.' })
    ])
  ])

  return pageEl(
    'Fenêtres détectées',
    'Les fenêtres ouvertes et leur association éventuelle à un compte.',
    h('div', { class: 'page-toolbar' }, [tools]),
    table,
    hint
  )
}

function renderAbout(): HTMLElement {
  const rows = h('div', { class: 'about-grid' }, [
    h('div', { class: 'about-cell' }, [
      h('span', { class: 'meta-k', text: 'Application' }),
      h('span', { class: 'meta-v', text: 'Dofus Multi-Account' })
    ]),
    h('div', { class: 'about-cell' }, [
      h('span', { class: 'meta-k', text: 'Version' }),
      h('span', { class: 'meta-v', text: state.version ? `v${state.version}` : '—' })
    ]),
    h('div', { class: 'about-cell' }, [
      h('span', { class: 'meta-k', text: 'Éditeur' }),
      h('span', { class: 'meta-v', text: 'paradow' })
    ])
  ])

  const u = state.update
  const statusText =
    u.status === 'downloaded'
      ? `Mise à jour v${u.version ?? ''} prête — redémarrez pour l’installer.`
      : u.status === 'downloading'
        ? `Téléchargement de la mise à jour… ${u.percent ?? 0}%`
        : u.status === 'available'
          ? `Mise à jour v${u.version ?? ''} disponible.`
          : u.status === 'checking'
            ? 'Recherche de mise à jour…'
            : u.status === 'error'
              ? `Erreur de mise à jour : ${u.error ?? ''}`
              : 'L’application est à jour.'

  const checkBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Vérifier les mises à jour',
    on: { click: () => void window.api.checkUpdate() }
  }) as HTMLButtonElement
  checkBtn.disabled = u.status === 'checking' || u.status === 'downloading'

  const updateBox = h('div', { class: 'field' }, [
    h('span', { class: 'field-label', text: 'Mises à jour' }),
    h('div', { class: 'about-update' }, [h('span', { class: 'small ink-2', text: statusText }), checkBtn])
  ])

  return pageEl(
    'À propos',
    'Informations sur l’application et mises à jour.',
    rows,
    updateBox
  )
}

/* ---------- Composants ---------- */

function textInput(value: string, placeholder: string, onInput: (v: string) => void, mono = false): HTMLInputElement {
  return h('input', {
    class: `input input--cell${mono ? ' mono' : ''}`,
    value,
    placeholder,
    on: { input: (e) => onInput((e.target as HTMLInputElement).value) }
  }) as HTMLInputElement
}

function shortcutCapture(current: string, onChange: (accel: string) => void): HTMLInputElement {
  const set = (accel: string): void => {
    input.value = accel
    onChange(accel)
    input.blur()
  }

  const input = h('input', {
    class: 'input input--cell mono sc-capture',
    value: current,
    readonly: true,
    placeholder: 'touche ou bouton souris',
    title: 'Cliquer puis taper une touche, ou utiliser la molette / un bouton latéral de la souris',
    on: {
      keydown: (e) => {
        const ke = e as KeyboardEvent
        e.preventDefault()
        if (ke.key === 'Backspace' || ke.key === 'Delete') {
          input.value = ''
          onChange('')
          return
        }
        const accel = eventToAccelerator(ke)
        if (accel) set(accel)
      },
      // Boutons souris « non essentiels » (molette, latéraux) : capturés comme raccourci.
      mousedown: (e) => {
        const me = e as MouseEvent
        const accel = eventToMouseAccelerator(me)
        if (accel) {
          e.preventDefault()
          set(accel)
        }
      },
      // Empêche le menu contextuel / la navigation arrière-avant pendant la capture.
      contextmenu: (e) => e.preventDefault(),
      auxclick: (e) => e.preventDefault()
    }
  }) as HTMLInputElement
  return input
}

function renderSwitch(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    checked,
    on: { change: (e) => onChange((e.target as HTMLInputElement).checked) }
  })
  return h('label', { class: 'switch' }, [
    input,
    h('span', { class: 'switch-track' }, [h('span', { class: 'switch-thumb' })]),
    h('span', { class: 'small', text: label })
  ])
}

function field(label: string, control: Node): HTMLElement {
  return h('div', { class: 'field' }, [h('span', { class: 'field-label', text: label }), control])
}

function optionEl(value: string, label: string): HTMLOptionElement {
  const o = document.createElement('option')
  o.value = value
  o.textContent = label
  return o
}

function caret(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'M6 9l6 6 6-6')
  svg.append(path)
  return svg
}

function iconBtn(symbol: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const btn = h('button', {
    class: 'btn btn--ghost order-btn',
    text: symbol,
    on: { click: onClick }
  }) as HTMLButtonElement
  btn.disabled = disabled
  return btn
}

/** Met à jour l'état du bouton Enregistrer sans re-rendre (évite de perdre le focus input). */
function syncSaveButton(): void {
  const btn = document.querySelector('.topbar-meta .btn') as HTMLButtonElement | null
  if (!btn) return
  btn.disabled = !state.dirty
  btn.textContent = state.dirty ? 'Enregistrer' : 'À jour'
  btn.classList.toggle('btn--primary', state.dirty)
  btn.classList.toggle('btn--secondary', !state.dirty)
}

void init()
