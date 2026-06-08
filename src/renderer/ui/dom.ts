/** Mini-helper de création d'éléments DOM typé, sans framework. */
type Props = {
  class?: string
  text?: string
  html?: string
  type?: string
  value?: string
  placeholder?: string
  readonly?: boolean
  checked?: boolean
  title?: string
  dataset?: Record<string, string>
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>
  attrs?: Record<string, string>
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props.class) el.className = props.class
  if (props.text !== undefined) el.textContent = props.text
  if (props.html !== undefined) el.innerHTML = props.html
  if (props.title) el.title = props.title

  if (el instanceof HTMLInputElement) {
    if (props.type) el.type = props.type
    if (props.value !== undefined) el.value = props.value
    if (props.placeholder) el.placeholder = props.placeholder
    if (props.readonly) el.readOnly = true
    if (props.checked !== undefined) el.checked = props.checked
  }
  if (el instanceof HTMLSelectElement && props.value !== undefined) {
    el.value = props.value
  }

  if (props.dataset) {
    for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v
  }
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v)
  }
  if (props.on) {
    for (const [evt, fn] of Object.entries(props.on)) {
      el.addEventListener(evt, fn as EventListener)
    }
  }
  for (const child of children) {
    el.append(child)
  }
  return el
}

export function clear(el: HTMLElement): void {
  el.replaceChildren()
}
