/**
 * First-run disclaimer banner.
 *
 * Inline (never a blocking modal): accepting it hides it immediately and stores
 * the acknowledgement in `localStorage`. Storage failures are non-fatal — the
 * banner simply shows again next time.
 */

import { fa } from '../i18n/fa'
import { el } from '../ui/el'

export const DISCLAIMER_KEY = 'sp-disclaimer-ack'

export interface DisclaimerOptions {
  /** Opens the help dialog from the banner. */
  onOpenHelp?: () => void
}

/** `true` once the user has accepted the disclaimer; `false` when unreadable. */
export function isDisclaimerAcknowledged(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_KEY) === '1'
  } catch {
    return false
  }
}

function acknowledge(): void {
  try {
    localStorage.setItem(DISCLAIMER_KEY, '1')
  } catch {
    // Private mode / blocked storage: accept for this page view only.
  }
}

let instance = 0

/** Returns the banner, or `null` when it has already been accepted. */
export function createDisclaimer(opts: DisclaimerOptions = {}): HTMLElement | null {
  if (isDisclaimerAcknowledged()) return null

  const uid = ++instance
  const titleId = `disclaimer-title-${uid}`

  const accept = el(
    'button',
    { type: 'button', class: 'btn btn-sm btn-primary' },
    fa.disclaimer.accept,
  )
  const help = el(
    'button',
    { type: 'button', class: 'btn btn-sm btn-ghost' },
    fa.nav.help,
  )

  const banner = el(
    'section',
    {
      class: 'alert alert-info items-start text-sm leading-6',
      role: 'note',
      'aria-labelledby': titleId,
    },
    el(
      'div',
      { class: 'flex flex-col gap-2' },
      el('p', { id: titleId, class: 'font-bold' }, fa.disclaimer.title),
      el('p', {}, fa.disclaimer.body),
      el('div', { class: 'flex flex-wrap items-center gap-2' }, accept, help),
    ),
  )

  accept.addEventListener('click', () => {
    acknowledge()
    banner.remove()
  })
  help.addEventListener('click', () => opts.onOpenHelp?.())

  return banner
}
