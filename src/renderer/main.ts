// Design system Paradow / Midnight Ember (fourni dans design-system/)
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import '@ds/ds/styles.css'
import './app.css'
import markUrl from '@ds/logo/midnight-ember__mark-square.svg'

import type {
  AccountConfig,
  AppConfig,
  DetectedWindow,
  ShortcutRegistration,
  UpdateState
} from '@shared/types'
import { h, clear } from './ui/dom'
import { eventToAccelerator } from './ui/accelerator'

interface State {
  config: AppConfig
  windows: DetectedWindow[]
  registrations: ShortcutRegistration[]
  update: UpdateState
  showAllWindows: boolean
  dirty: boolean
}

const state: State = {
  config: {
    accounts: [],
    cycleNext: '',
    cyclePrev: '',
    layoutMode: 'maximize-active',
    enabled: true,
    turnFollow: false
  },
  windows: [],
  registrations: [],
  update: { status: 'idle' },
  showAllWindows: false,
  dirty: false
}

const root = document.getElementById('app') as HTMLElement

async function init(): Promise<void> {
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

function render(): void {
  clear(root)
  root.append(renderTopbar())
  const main = h('main', { class: 'page' })

  const conflicts = failed()
  if (conflicts.length) main.append(renderConflicts(conflicts))

  main.append(renderAccounts())
  main.append(renderCycle())
  main.append(renderLayout())
  main.append(renderCombat())
  main.append(renderDetected())
  root.append(main)
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

  return h('header', { class: 'topbar' }, [brand, meta])
}

/** Indicateur de mise à jour dans l'en-tête (null si rien à montrer). */
function renderUpdate(): HTMLElement | null {
  const u = state.update
  switch (u.status) {
    case 'downloaded':
      return h('button', {
        class: 'btn btn--primary btn--sm',
        text: `Redémarrer pour installer${u.version ? ` v${u.version}` : ''}`,
        on: { click: () => void window.api.installUpdate() }
      })
    case 'downloading':
      return h('span', { class: 'upd-note', text: `MAJ… ${u.percent ?? 0}%` })
    case 'available':
      return h('span', { class: 'upd-note', text: 'MAJ disponible' })
    case 'checking':
      return h('span', { class: 'upd-note', text: 'Recherche MAJ…' })
    default:
      return null
  }
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

function sectionEl(kicker: string, title: string, ...rest: (Node | null)[]): HTMLElement {
  const head = h('div', { class: 'sec-head' }, [
    h('div', { class: 'kicker', text: kicker }),
    h('h2', { class: 'sec-title', text: title })
  ])
  const sec = h('section', { class: 'sec' }, [head])
  for (const r of rest) if (r) sec.append(r)
  return sec
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

  return sectionEl('comptes', 'Comptes', table, h('div', { class: 'row-actions' }, [addBtn]))
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
  return sectionEl('cycle', 'Raccourcis de cycle', grid)
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
  return sectionEl('disposition', 'Disposition des fenêtres', grid)
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

  return sectionEl('combat', 'Suivi de tour', h('div', { class: 'combat-row' }, [toggle]), note)
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

  const sec = sectionEl('détection', 'Fenêtres détectées', table, hint)
  sec.querySelector('.sec-head')?.append(tools)
  return sec
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
  const input = h('input', {
    class: 'input input--cell mono sc-capture',
    value: current,
    readonly: true,
    placeholder: 'cliquer + taper',
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
        if (accel) {
          input.value = accel
          onChange(accel)
          input.blur()
        }
      }
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
