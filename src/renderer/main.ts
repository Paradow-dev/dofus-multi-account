// Design system Paradow / Midnight Ember (fourni dans design-system/)
import '@ds/fonts.css'
import '@ds/tokens/tokens.css'
import '@ds/ds/styles.css'
import logoUrl from '@ds/logo/midnight-ember__lockup-inline-nobg-white.svg'

import type {
  AccountConfig,
  AppConfig,
  DetectedWindow,
  ShortcutRegistration
} from '@shared/types'
import { h, clear } from './ui/dom'
import { eventToAccelerator } from './ui/accelerator'

interface State {
  config: AppConfig
  windows: DetectedWindow[]
  registrations: ShortcutRegistration[]
  dirty: boolean
}

const state: State = {
  config: {
    accounts: [],
    cycleNext: '',
    cyclePrev: '',
    layoutMode: 'maximize-active',
    enabled: true
  },
  windows: [],
  registrations: [],
  dirty: false
}

const root = document.getElementById('app') as HTMLElement

async function init(): Promise<void> {
  state.config = await window.api.getConfig()
  state.windows = await window.api.listWindows()
  window.api.onShortcutsState((regs) => {
    state.registrations = regs
    render()
  })
  render()
}

/* ---------- Helpers d'état ---------- */

function markDirty(): void {
  state.dirty = true
  render()
}

async function save(): Promise<void> {
  const { config, shortcuts } = await window.api.setConfig(state.config)
  state.config = config
  state.registrations = shortcuts
  state.dirty = false
  render()
}

async function rescan(): Promise<void> {
  state.windows = await window.api.listWindows()
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

function failedRegistrations(): ShortcutRegistration[] {
  return state.registrations.filter((r) => !r.ok)
}

/* ---------- Rendu ---------- */

function render(): void {
  clear(root)
  root.append(renderTopbar())

  const main = h('div', { class: 'content', attrs: { style: 'max-width:880px;margin:0 auto;padding:28px;' } })

  const conflicts = failedRegistrations()
  if (conflicts.length > 0) {
    main.append(renderConflicts(conflicts))
  }

  main.append(renderAccountsSection())
  main.append(renderGlobalShortcutsSection())
  main.append(renderLayoutSection())
  main.append(renderDetectedSection())

  root.append(main)
}

function renderTopbar(): HTMLElement {
  const logo = h('img', { attrs: { src: logoUrl, alt: 'Paradow', height: '22' } })
  const brand = h('div', { class: 'brand' }, [
    logo,
    h('span', { class: 'brand-sep', text: '·' }),
    h('span', { class: 'brand-doc', text: 'Dofus Multi-Account' })
  ])

  const enabledSwitch = renderSwitch('Raccourcis activés', state.config.enabled, (v) => {
    state.config.enabled = v
    void save()
  })

  const saveBtn = h(
    'button',
    {
      class: `btn ${state.dirty ? 'btn--primary' : 'btn--secondary'}`,
      text: state.dirty ? 'Enregistrer' : 'Enregistré',
      on: { click: () => void save() }
    }
  )
  ;(saveBtn as HTMLButtonElement).disabled = !state.dirty

  const meta = h('div', { class: 'topbar-meta' }, [enabledSwitch, saveBtn])
  return h('div', { class: 'topbar' }, [brand, meta])
}

function renderConflicts(conflicts: ShortcutRegistration[]): HTMLElement {
  const list = conflicts.map((c) => `${c.label} (${c.accelerator})`).join(', ')
  return h('div', { class: 'alert alert--danger' }, [
    h('div', { class: 'alert-body' }, [
      h('strong', { text: 'Raccourcis en conflit' }),
      h('p', {
        text: `Impossible d'enregistrer : ${list}. Ils sont peut-être déjà utilisés par une autre application.`
      })
    ])
  ])
}

function sectionHead(kicker: string, title: string, lede?: string): HTMLElement {
  const head = h('div', { class: 'section-head' }, [
    h('div', { class: 'kicker', text: kicker }),
    h('h2', { text: title, attrs: { style: 'font-size:22px;' } })
  ])
  if (lede) head.append(h('p', { class: 'lede', text: lede }))
  return head
}

function renderAccountsSection(): HTMLElement {
  const section = h('div', { class: 'section', attrs: { style: 'padding:24px 0;' } })
  section.append(
    sectionHead('comptes', 'Comptes', 'Ordre de cycle, fenêtre associée (par titre) et raccourci dédié.')
  )

  const accounts = [...state.config.accounts].sort((a, b) => a.order - b.order)
  const listEl = h('div', { class: 'status-list' })

  if (accounts.length === 0) {
    listEl.append(
      h('div', { class: 'status-row' }, [
        h('span', { class: 'ink-3', text: 'Aucun compte. Ajoutez-en un ci-dessous ou depuis les fenêtres détectées.' })
      ])
    )
  }

  accounts.forEach((acc, idx) => listEl.append(renderAccountRow(acc, idx, accounts.length)))
  section.append(listEl)

  const actions = h('div', { attrs: { style: 'display:flex;gap:10px;margin-top:14px;' } }, [
    h('button', {
      class: 'btn btn--secondary btn--sm',
      text: '+ Ajouter un compte',
      on: { click: () => addAccount() }
    })
  ])
  section.append(actions)
  return section
}

function renderAccountRow(acc: AccountConfig, idx: number, total: number): HTMLElement {
  const isActive = state.windows.some((w) => w.accountId === acc.id)

  const orderCtrl = h('div', { attrs: { style: 'display:flex;flex-direction:column;gap:2px;' } }, [
    iconBtn('▲', idx === 0, () => moveAccount(acc.id, -1)),
    iconBtn('▼', idx === total - 1, () => moveAccount(acc.id, 1))
  ])

  const statusDot = h('span', {
    class: isActive ? 'dot dot--success' : 'dot',
    title: isActive ? 'Fenêtre détectée' : 'Aucune fenêtre détectée',
    attrs: isActive ? {} : { style: 'background:var(--ink-4);' }
  })

  const labelInput = h('input', {
    class: 'input btn--sm',
    value: acc.label,
    placeholder: 'Nom du personnage',
    attrs: { style: 'height:32px;' },
    on: {
      input: (e) => {
        acc.label = (e.target as HTMLInputElement).value
        state.dirty = true
      }
    }
  })

  const matchInput = h('input', {
    class: 'input mono',
    value: acc.matchTitle,
    placeholder: 'Texte dans le titre (ex. nom perso)',
    attrs: { style: 'height:32px;' },
    on: {
      input: (e) => {
        acc.matchTitle = (e.target as HTMLInputElement).value
        state.dirty = true
      }
    }
  })

  const shortcutInput = renderShortcutCapture(acc.shortcut ?? '', (accel) => {
    acc.shortcut = accel || undefined
    markDirty()
  })

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

  const row = h('div', {
    class: 'status-row',
    attrs: { style: 'grid-template-columns:auto auto 1fr 1.4fr 1.4fr auto auto;' }
  }, [orderCtrl, statusDot, labelInput, matchInput, shortcutInput, focusBtn, delBtn])

  return row
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

function renderGlobalShortcutsSection(): HTMLElement {
  const section = h('div', { class: 'section', attrs: { style: 'padding:24px 0;' } })
  section.append(sectionHead('cycle', 'Raccourcis de cycle', 'Basculer entre les comptes dans l’ordre défini.'))

  const grid = h('div', { class: 'input-grid' }, [
    field('Compte suivant', renderShortcutCapture(state.config.cycleNext, (a) => {
      state.config.cycleNext = a
      markDirty()
    })),
    field('Compte précédent', renderShortcutCapture(state.config.cyclePrev, (a) => {
      state.config.cyclePrev = a
      markDirty()
    }))
  ])
  section.append(grid)
  return section
}

function renderLayoutSection(): HTMLElement {
  const section = h('div', { class: 'section', attrs: { style: 'padding:24px 0;' } })
  section.append(sectionHead('disposition', 'Disposition des fenêtres'))

  const select = h('select', {
    class: 'input',
    value: state.config.layoutMode,
    on: {
      change: (e) => {
        state.config.layoutMode = (e.target as HTMLSelectElement).value as AppConfig['layoutMode']
        markDirty()
      }
    }
  }, [
    optionEl('none', 'Aucune (ne pas toucher aux fenêtres)'),
    optionEl('maximize-active', 'Agrandir la fenêtre active'),
    optionEl('grid', 'Mosaïque (toutes les fenêtres)')
  ])
  ;(select as HTMLSelectElement).value = state.config.layoutMode

  const wrap = h('div', { class: 'select-wrap' }, [select])
  const grid = h('div', { class: 'input-grid' }, [field('Au changement de compte', wrap)])
  section.append(grid)
  return section
}

function renderDetectedSection(): HTMLElement {
  const section = h('div', { class: 'section', attrs: { style: 'padding:24px 0;border-bottom:none;' } })
  const head = h('div', {
    attrs: { style: 'display:flex;justify-content:space-between;align-items:flex-end;' }
  }, [
    sectionHead('détection', 'Fenêtres Dofus détectées'),
    h('button', { class: 'btn btn--secondary btn--sm', text: 'Re-scanner', on: { click: () => void rescan() } })
  ])
  section.append(head)

  const listEl = h('div', { class: 'status-list' })
  if (state.windows.length === 0) {
    listEl.append(
      h('div', { class: 'status-row' }, [
        h('span', { class: 'ink-3', text: 'Aucune fenêtre Dofus détectée (lancez le jeu, puis re-scannez).' })
      ])
    )
  }
  for (const win of state.windows) {
    const matched = win.accountId !== undefined
    const row = h('div', { class: 'status-row' }, [
      h('span', { class: matched ? 'dot dot--success' : 'dot', attrs: matched ? {} : { style: 'background:var(--ink-4);' } }),
      h('strong', { text: win.title }),
      h('code', { text: matched ? 'associé' : 'non associé' }),
      matched
        ? h('span', { class: 'ink-3', text: '' })
        : h('button', {
            class: 'btn btn--ghost btn--sm',
            text: '+ Compte',
            title: 'Créer un compte à partir de cette fenêtre',
            on: { click: () => addAccount(win.title, win.title) }
          })
    ])
    listEl.append(row)
  }
  section.append(listEl)
  return section
}

/* ---------- Composants réutilisables ---------- */

function renderShortcutCapture(current: string, onChange: (accel: string) => void): HTMLElement {
  const input = h('input', {
    class: 'input mono',
    value: current,
    readonly: true,
    placeholder: 'Cliquez puis tapez…',
    attrs: { style: 'height:32px;cursor:pointer;' },
    on: {
      keydown: (e) => {
        const ke = e as KeyboardEvent
        e.preventDefault()
        if (ke.key === 'Backspace' || ke.key === 'Delete') {
          ;(input as HTMLInputElement).value = ''
          onChange('')
          return
        }
        const accel = eventToAccelerator(ke)
        if (accel) {
          ;(input as HTMLInputElement).value = accel
          onChange(accel)
          ;(input as HTMLInputElement).blur()
        }
      },
      focus: () => input.classList.add('is-focus'),
      blur: () => input.classList.remove('is-focus')
    }
  })
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
    h('span', { text: label })
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

function iconBtn(symbol: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const btn = h('button', {
    class: 'btn btn--ghost btn--icon',
    text: symbol,
    attrs: { style: 'height:16px;width:20px;padding:0;font-size:10px;' },
    on: { click: onClick }
  }) as HTMLButtonElement
  btn.disabled = disabled
  return btn
}

void init()
