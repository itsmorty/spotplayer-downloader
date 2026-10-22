/**
 * Share-code bookmarklet: load it once from `public/bookmarklet.txt`, let the
 * user copy it, and never navigate to the `javascript:` URL from this page.
 *
 * The file is a single-line `javascript:…` URL produced from
 * `spikes/003-creds-handoff/bookmarklet.js` (same data logic, Persian messages).
 */

import { fa } from '../i18n/fa'
import { el } from '../ui/el'
import { notify } from '../ui/toast'
import { openBookmarkletGuide } from './bookmarklet-guide'

const ICONS = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />',
  alert: '<circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" />',
  book: '<path d="M6 3h12v18l-6-4-6 4V3z" />',
} as const

function svgIcon(paths: string, size = 18): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

/** Resolves `./bookmarklet.txt` against the page, so it works on any Pages path. */
export function bookmarkletUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}bookmarklet.txt`, location.href).href
}

let pending: Promise<string> | null = null

/**
 * Fetches and validates the bookmarklet once. A failed load is not cached, so
 * the next call retries.
 */
export function loadBookmarkletText(): Promise<string> {
  if (pending) return pending

  const request = fetch(bookmarkletUrl())
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = (await response.text()).trim()
      if (!text.startsWith('javascript:') || /[\r\n]/.test(text)) {
        throw new Error('invalid bookmarklet')
      }
      return text
    })
    .catch((error: unknown) => {
      pending = null
      throw error
    })

  pending = request
  return request
}

function legacyCopy(text: string): boolean {
  const area = el('textarea', {
    class: 'sr-only',
    readonly: 'readonly',
    tabindex: '-1',
    'aria-hidden': 'true',
  })
  area.value = text
  const active = document.activeElement
  document.body.append(area)
  area.select()
  area.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
    if (active instanceof HTMLElement && active.isConnected) active.focus()
  }
}

/**
 * Copies text with the async Clipboard API, falling back to a hidden textarea
 * for browsers/contexts where it is unavailable or denied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or not focused: try the legacy path.
    }
  }
  return typeof document !== 'undefined' && legacyCopy(text)
}

let instance = 0

/** Bookmarklet card: title, hint, copy button and a link to the setup guide. */
export function createBookmarkletSection(): HTMLElement {
  const uid = ++instance
  const titleId = `bookmarklet-title-${uid}`
  const statusId = `bookmarklet-status-${uid}`

  const spinner = el('span', {
    class: 'loading loading-spinner loading-xs',
    'aria-hidden': 'true',
  })
  const button = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary btn-sm gap-2',
      disabled: 'disabled',
      'aria-describedby': statusId,
    },
    svgIcon(ICONS.copy),
    spinner,
    el('span', {}, fa.help.copyBookmarklet),
  )

  const status = el(
    'p',
    { id: statusId, class: 'text-xs leading-5 text-base-content/60', role: 'status', 'aria-live': 'polite' },
    fa.common.loading,
  )

  const guideButton = el(
    'button',
    { type: 'button', class: 'btn btn-outline btn-sm gap-2' },
    svgIcon(ICONS.book),
    el('span', {}, fa.help.bookmarkletGuide),
  )

  const section = el(
    'section',
    {
      class: 'flex flex-col gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3 sm:p-4',
      'aria-labelledby': titleId,
    },
    el(
      'div',
      { class: 'flex flex-col gap-1' },
      el('h4', { id: titleId, class: 'text-sm font-bold' }, fa.help.bookmarkletTitle),
      el('p', { class: 'text-xs leading-5 text-base-content/70' }, fa.help.bookmarkletHint),
    ),
    el('div', { class: 'flex flex-wrap items-center gap-2' }, button, guideButton, status),
  )

  let text: string | null = null
  let copying = false

  void loadBookmarkletText().then(
    (value) => {
      text = value
      spinner.remove()
      button.disabled = false
      status.remove()
    },
    () => {
      spinner.remove()
      button.disabled = true
      status.className = 'alert alert-error alert-soft gap-2 px-3 py-2 text-xs leading-5'
      status.replaceChildren(
        svgIcon(ICONS.alert, 16),
        el('span', {}, fa.help.bookmarkletLoadFailed),
      )
    },
  )

  button.addEventListener('click', () => {
    if (!text || copying) return
    copying = true
    button.disabled = true
    button.setAttribute('aria-busy', 'true')

    void copyText(text)
      .then((ok) => {
        notify(ok ? fa.help.copiedBookmarklet : fa.toast.copyFailed, ok ? 'success' : 'error')
      })
      .finally(() => {
        copying = false
        button.disabled = false
        button.removeAttribute('aria-busy')
      })
  })

  guideButton.addEventListener('click', () => openBookmarkletGuide())

  return section
}
