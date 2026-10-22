/**
 * Share-code input: paste, type, pick a file or drop one on the card.
 *
 * Decoding is fully local (`decodeShareCode`); failures surface as a Persian
 * inline alert, successes as a toast plus the `onLoaded` callback.
 */

import { fa } from '../i18n/fa'
import { decodeShareCode, ShareCodeError } from '../lib/share'
import type { ShareCode } from '../lib/types'
import { el } from '../ui/el'
import { notify } from '../ui/toast'

export interface ShareCodeInputOptions {
  onLoaded: (code: ShareCode) => void
}

export interface ShareCodeInputHandle {
  element: HTMLElement
  reset(): void
  focus(): void
  setBusy(busy: boolean): void
}

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ICONS = {
  upload: '<path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" />',
  alert: '<circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" />',
} as const

let instance = 0

function svgIcon(paths: string, size = 18): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

function messageFor(error: unknown): string {
  if (error instanceof ShareCodeError) return fa.errors.shareCode[error.code]
  return fa.errors.unknown
}

export function createShareCodeInput(opts: ShareCodeInputOptions): ShareCodeInputHandle {
  const uid = ++instance
  const inputId = `share-code-${uid}`
  const fileId = `share-code-file-${uid}`
  const errorId = `share-code-error-${uid}`
  const headingId = `share-code-heading-${uid}`

  let busy = false
  let dragDepth = 0

  const textarea = el('textarea', {
    id: inputId,
    class:
      'textarea textarea-bordered code-ltr min-h-28 w-full resize-y font-mono text-sm leading-6',
    dir: 'ltr',
    rows: '4',
    placeholder: fa.shareCode.placeholder,
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-label': fa.shareCode.inputAria,
    'aria-describedby': errorId,
    'aria-invalid': 'false',
  })

  const submitIcon = svgIcon(ICONS.upload)
  const spinner = el('span', { class: 'loading loading-spinner loading-sm', 'aria-hidden': 'true' })
  spinner.style.display = 'none'
  const submitLabel = el('span', {}, fa.shareCode.load)
  const submitButton = el(
    'button',
    { type: 'submit', class: 'btn btn-primary gap-2' },
    submitIcon,
    spinner,
    submitLabel,
  )

  const fileInput = el('input', {
    id: fileId,
    type: 'file',
    accept: '.txt,.json,.gz,text/plain,application/json',
    class: 'hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
  })

  const fileButton = el(
    'button',
    { type: 'button', class: 'btn btn-ghost gap-2' },
    svgIcon(ICONS.file),
    el('span', {}, fa.shareCode.chooseFile),
  )

  const errorText = el('span', {})
  const errorAlert = el(
    'div',
    { id: errorId, class: 'alert alert-error', role: 'alert' },
    svgIcon(ICONS.alert, 20),
    errorText,
  )
  errorAlert.style.display = 'none'

  const dropHint = el(
    'div',
    {
      class:
        'items-center gap-2 rounded-lg border border-dashed border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary',
    },
    svgIcon(ICONS.upload, 18),
    el('span', {}, fa.shareCode.dropActive),
  )
  dropHint.style.display = 'none'

  const shortcutHint = el(
    'p',
    { class: 'text-xs leading-5 text-base-content/50' },
    `${fa.shareCode.shortcut} · ${fa.shareCode.dropHere}`,
  )

  const form = el(
    'form',
    { class: 'flex flex-col gap-4', novalidate: 'novalidate' },
    el(
      'fieldset',
      { class: 'fieldset min-w-0 gap-2 p-0' },
      el('legend', { class: 'fieldset-legend text-sm font-medium' }, fa.shareCode.label),
      textarea,
    ),
    el(
      'div',
      { class: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between' },
      el('div', { class: 'flex flex-wrap items-center gap-2' }, submitButton, fileButton, fileInput),
      shortcutHint,
    ),
    errorAlert,
  )

  const card = el(
    'section',
    {
      class: 'card border border-base-300 bg-base-100 shadow-sm transition-colors',
      'aria-labelledby': headingId,
    },
    el(
      'div',
      { class: 'card-body gap-4 p-5 sm:p-6' },
      el(
        'div',
        { class: 'flex items-start gap-3' },
        el(
          'span',
          {
            class:
              'grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-content',
            'aria-hidden': 'true',
          },
          fa.shareCode.step,
        ),
        el(
          'div',
          { class: 'flex min-w-0 flex-col gap-1' },
          el('h2', { id: headingId, class: 'card-title text-lg' }, fa.shareCode.title),
          el('p', { class: 'text-sm leading-6 text-base-content/70' }, fa.shareCode.hint),
        ),
      ),
      dropHint,
      form,
    ),
  )

  const baseCardClass = 'card border border-base-300 bg-base-100 shadow-sm transition-colors'
  const activeCardClass = 'border-primary border-dashed ring-2 ring-primary/20 bg-primary/5'

  function setDragActive(active: boolean): void {
    card.className = active ? `${baseCardClass} ${activeCardClass}` : baseCardClass
    dropHint.style.display = active ? 'flex' : 'none'
  }

  function showError(message: string): void {
    errorText.textContent = message
    errorAlert.style.display = ''
    textarea.setAttribute('aria-invalid', 'true')
  }

  function clearError(): void {
    errorText.textContent = ''
    errorAlert.style.display = 'none'
    textarea.setAttribute('aria-invalid', 'false')
  }

  function setBusy(next: boolean): void {
    busy = next
    submitButton.disabled = next
    fileButton.disabled = next
    textarea.disabled = next
    submitIcon.style.display = next ? 'none' : ''
    spinner.style.display = next ? '' : 'none'
    submitLabel.textContent = next ? fa.shareCode.loading : fa.shareCode.load
    form.setAttribute('aria-busy', String(next))
    if (!next) setDragActive(false)
  }

  async function load(raw: string): Promise<void> {
    if (busy) return
    clearError()

    const text = raw.trim()
    if (text === '') {
      showError(fa.shareCode.empty)
      textarea.focus()
      return
    }

    setBusy(true)
    try {
      const code = await decodeShareCode(text)
      opts.onLoaded(code)
      notify(fa.shareCode.success, 'success')
    } catch (error) {
      showError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  async function loadFile(file: File): Promise<void> {
    if (busy) return
    clearError()

    if (file.size === 0) {
      showError(fa.shareCode.fileEmpty)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      showError(fa.shareCode.fileTooLarge)
      return
    }

    let text: string
    try {
      text = await file.text()
    } catch {
      showError(fa.shareCode.fileReadError)
      return
    }

    textarea.value = text
    await load(text)
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void load(textarea.value)
  })

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      form.requestSubmit()
    }
  })

  fileButton.addEventListener('click', () => fileInput.click())

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void loadFile(file)
  })

  card.addEventListener('dragenter', (event) => {
    event.preventDefault()
    if (busy) return
    dragDepth++
    setDragActive(true)
  })

  card.addEventListener('dragover', (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })

  card.addEventListener('dragleave', (event) => {
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) setDragActive(false)
  })

  card.addEventListener('drop', (event) => {
    event.preventDefault()
    dragDepth = 0
    setDragActive(false)
    if (busy) return
    const file = event.dataTransfer?.files?.[0]
    if (file) void loadFile(file)
  })

  return {
    element: card,
    reset(): void {
      clearError()
      textarea.value = ''
      dragDepth = 0
      setBusy(false)
    },
    focus(): void {
      textarea.focus()
    },
    setBusy,
  }
}
