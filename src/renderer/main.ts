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

type PageId =
  | 'accounts'
  | 'shortcuts'
  | 'layout'
  | 'overlay'
  | 'browser'
  | 'turn'
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
}

const state: State = {
  config: {
    accounts: [],
    cycleNext: '',
    cyclePrev: '',
    layoutMode: 'maximize-active',
    enabled: true,
    turnFollow: false,
    overlay: { enabled: false, opacity: 0.9 },
    browser: {
      enabled: false,
      opacity: 1,
      homeUrl: 'https://www.dofus.com/fr/mmorpg/encyclopedie/quetes'
    }
  },
  windows: [],
  registrations: [],
  update: { status: 'idle' },
  showAllWindows: false,
  dirty: false,
  page: 'accounts',
  version: ''
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
      { id: 'overlay', label: 'Overlay', icon: 'tag' },
      { id: 'browser', label: 'Navigateur', icon: 'globe' },
      { id: 'turn', label: 'Suivi de tour', icon: 'refresh' }
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
  overlay: renderOverlay,
  browser: renderBrowser,
  turn: renderCombat,
  windows: renderDetected,
  about: renderAbout
}

function setPage(id: PageId): void {
  state.page = id
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

  root.append(h('div', { class: 'layout' }, [renderSidebar(), content]))
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
  return h('aside', { class: 'sidebar' }, [nav])
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

  return h('header', { class: 'topbar' }, [brand, meta])
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
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01']
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
        h('td', { class: 'ink-3', attrs: { colspan: '6', style: 'text-align:center;padding:18px;' },
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
    matchCell,
    scCell,
    h('td', { attrs: { style: 'width:74px;' } }, [focusBtn]),
    h('td', { attrs: { style: 'width:44px;' } }, [delBtn])
  ])
}

function renderCycle(): HTMLElement {
  const grid = h('div', { class: 'input-grid two' }, [
    field('Compte suivant', shortcutCapture(state.config.cycleNext, (a) => {
      state.config.cycleNext = a
      markDirty()
    })),
    field('Compte précédent', shortcutCapture(state.config.cyclePrev, (a) => {
      state.config.cyclePrev = a
      markDirty()
    }))
  ])
  return pageEl(
    'Raccourcis de cycle',
    'Passez au compte suivant ou précédent dans l’ordre défini.',
    grid
  )
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

function renderOverlay(): HTMLElement {
  const ov = state.config.overlay

  const toggle = renderSwitch('Afficher l’overlay', ov.enabled, (v) => {
    ov.enabled = v
    void save() // prend effet immédiatement (crée/détruit la fenêtre)
  })

  // Curseur d'opacité : aperçu live via le libellé, application à la fin du drag.
  const pct = (o: number): string => `${Math.round(o * 100)}%`
  const valueLabel = h('span', { class: 'upd-pct', text: pct(ov.opacity) })
  const slider = h('input', {
    type: 'range',
    class: 'range',
    attrs: { min: '0.2', max: '1', step: '0.05', value: String(ov.opacity) },
    on: {
      input: (e) => {
        valueLabel.textContent = pct(Number((e.target as HTMLInputElement).value))
      },
      change: (e) => {
        ov.opacity = Number((e.target as HTMLInputElement).value)
        void save()
      }
    }
  }) as HTMLInputElement
  slider.disabled = !ov.enabled

  const opacityRow = h('div', { class: 'field' }, [
    h('span', { class: 'field-label', text: 'Opacité' }),
    h('div', { class: 'range-row' }, [slider, valueLabel])
  ])

  const resetBtn = h('button', {
    class: 'btn btn--secondary btn--sm',
    text: 'Réinitialiser la position',
    title: 'Re-centrer l’overlay en haut de l’écran',
    on: { click: () => void window.api.resetOverlayPosition() }
  }) as HTMLButtonElement
  resetBtn.disabled = !ov.enabled
  const resetRow = h('div', { class: 'row-actions' }, [resetBtn])

  const note = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Une étiquette <strong>toujours au premier plan</strong> affiche le nom du personnage actif. ' +
          'Sa taille s’ajuste au texte. Glissez-la pour la repositionner&nbsp;: sa place est mémorisée ' +
          '(bouton <strong>« Réinitialiser la position »</strong> pour la re-centrer). ' +
          'Le nom se met à jour à chaque changement de compte (raccourci, cycle ou suivi de tour).'
      })
    ])
  ])

  return pageEl(
    'Overlay du personnage',
    'Affiche le nom du personnage actif, toujours au premier plan.',
    h('div', { class: 'combat-row' }, [toggle]),
    opacityRow,
    resetRow,
    note
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
  const toggle = renderSwitch('Suivi de tour automatique', state.config.turnFollow, (v) => {
    state.config.turnFollow = v
    void save() // prend effet immédiatement (démarre/arrête le hook)
  })

  const note = h('div', { class: 'alert alert--info' }, [
    h('div', { class: 'alert-body' }, [
      h('p', {
        html:
          'Quand c’est le tour d’un perso, Dofus fait clignoter sa fenêtre : l’app la met alors au premier plan. ' +
          'Active l’option <strong>« Notification quand c’est mon tour »</strong> dans Dofus. ' +
          'Si Dofus tourne en administrateur, lance aussi cette app en administrateur.'
      })
    ])
  ])

  return pageEl(
    'Suivi de tour',
    'Bascule automatiquement vers la fenêtre dont c’est le tour de jeu.',
    h('div', { class: 'combat-row' }, [toggle]),
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
