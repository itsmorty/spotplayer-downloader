/**
 * Help dialog: Persian steps, the share-code bookmarklet and a privacy note.
 * Built on the shared native-`<dialog>` helper, so Escape and backdrop clicks
 * close it and keyboard focus stays inside the modal.
 */

import { fa } from '../i18n/fa'
import { openDialog } from '../ui/dialog'
import { el } from '../ui/el'
import { createBookmarkletSection } from './bookmarklet'

function createSteps(): HTMLOListElement {
  return el(
    'ol',
    { class: 'flex list-none flex-col gap-3 p-0' },
    ...fa.help.steps.map((step, index) =>
      el(
        'li',
        { class: 'flex items-start gap-3' },
        el(
          'span',
          {
            class: 'badge badge-primary badge-sm mt-0.5 shrink-0 tabular-nums',
            'aria-hidden': 'true',
          },
          String(index + 1),
        ),
        el('p', { class: 'text-sm leading-6' }, step),
      ),
    ),
  )
}

function createPrivacyNote(): HTMLElement {
  return el(
    'div',
    { class: 'alert alert-info items-start text-sm leading-6', role: 'note' },
    el(
      'div',
      { class: 'flex flex-col gap-1' },
      el('p', { class: 'font-bold' }, fa.help.privacyTitle),
      el('p', {}, fa.help.privacy),
    ),
  )
}

function createCloseForm(): HTMLFormElement {
  return el(
    'form',
    { method: 'dialog', class: 'flex justify-end' },
    el('button', { type: 'submit', class: 'btn btn-primary' }, fa.common.close),
  )
}

/** Opens the help modal (one instance at a time; the helper manages cleanup). */
export function openHelpDialog(): void {
  const content = el(
    'div',
    { class: 'flex flex-col gap-5' },
    el('p', { class: 'text-sm leading-6 text-base-content/70' }, fa.help.intro),
    el(
      'section',
      { class: 'flex flex-col gap-3' },
      el('h4', { class: 'text-sm font-bold' }, fa.help.stepsTitle),
      createSteps(),
    ),
    createBookmarkletSection(),
    createPrivacyNote(),
    createCloseForm(),
  )

  openDialog(content, {
    title: fa.help.title,
    className: 'max-h-[85vh] w-11/12 max-w-2xl overflow-y-auto',
  })
}
