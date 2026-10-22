/**
 * Step-by-step guide for adding the share-code bookmarklet in Chrome/Edge and
 * Firefox. Opened from the bookmarklet card in the help dialog as a second
 * native `<dialog>`, so Escape, backdrop clicks and the close form all return
 * cleanly to the help dialog underneath.
 */

import { fa } from '../i18n/fa'
import { openDialog } from '../ui/dialog'
import { el } from '../ui/el'
import { createIcon } from '../ui/icons'

const DOC_LINKS = [
  {
    href: 'https://support.google.com/chrome/answer/188842?hl=fa',
    label: fa.help.guide.docsChrome,
  },
  {
    href: 'https://support.mozilla.org/fa/kb/bookmarklets-perform-common-web-page-tasks',
    label: fa.help.guide.docsFirefoxBookmarklets,
  },
  {
    href: 'https://support.mozilla.org/fa/kb/bookmarks-firefox',
    label: fa.help.guide.docsFirefoxBookmarks,
  },
] as const

const EXTERNAL_ICON =
  '<path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />'

function externalIcon(): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${EXTERNAL_ICON}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

/** Highlights shortcuts and the `javascript:` prefix inside a translated step. */
const INLINE_TOKEN = /(Ctrl\+Shift\+[A-Z]|javascript:)/g

function inlineText(text: string): (Node | string)[] {
  const parts: (Node | string)[] = []
  let lastIndex = 0

  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push(text.slice(lastIndex, index))

    const token = match[0]
    if (token === 'javascript:') {
      parts.push(
        el(
          'code',
          {
            class: 'code-ltr rounded bg-base-300/70 px-1 py-0.5 text-[0.85em]',
            dir: 'ltr',
          },
          token,
        ),
      )
    } else {
      parts.push(el('kbd', { class: 'kbd kbd-sm mx-0.5 font-sans' }, token))
    }

    lastIndex = index + token.length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function createSteps(steps: readonly string[]): HTMLOListElement {
  return el(
    'ol',
    { class: 'flex list-none flex-col gap-3 p-0' },
    ...steps.map((step, index) =>
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
        el('p', { class: 'text-sm leading-6' }, ...inlineText(step)),
      ),
    ),
  )
}

let instance = 0

function createBrowserSection(
  uid: number,
  kind: 'chrome' | 'firefox',
  title: string,
  steps: readonly string[],
): HTMLElement {
  const titleId = `bookmarklet-guide-${kind}-${uid}`

  return el(
    'section',
    {
      class: 'flex flex-col gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3 sm:p-4',
      'aria-labelledby': titleId,
    },
    el('h4', { id: titleId, class: 'text-sm font-bold' }, title),
    createSteps(steps),
  )
}

function createTips(): HTMLElement {
  return el(
    'section',
    {
      class:
        'alert items-start border border-info/30 bg-info/10 text-sm leading-6 text-base-content shadow-none',
      role: 'note',
    },
    el(
      'span',
      { class: 'mt-0.5 shrink-0 text-info', 'aria-hidden': 'true' },
      createIcon('info'),
    ),
    el(
      'div',
      { class: 'flex flex-col gap-1' },
      el('p', { class: 'font-bold' }, fa.help.guide.tipsTitle),
      el(
        'ul',
        { class: 'list-inside list-disc space-y-1' },
        ...fa.help.guide.tips.map((tip) => el('li', {}, ...inlineText(tip))),
      ),
    ),
  )
}

function createDocs(): HTMLElement {
  return el(
    'section',
    { class: 'flex flex-col gap-2' },
    el('h4', { class: 'text-sm font-bold' }, fa.help.guide.docsTitle),
    el(
      'ul',
      { class: 'flex list-none flex-col gap-2 p-0' },
      ...DOC_LINKS.map((link) =>
        el(
          'li',
          {},
          el(
            'a',
            {
              href: link.href,
              target: '_blank',
              rel: 'noopener noreferrer',
              class: 'link link-primary inline-flex items-center gap-1 text-sm',
            },
            link.label,
            externalIcon(),
          ),
        ),
      ),
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

/** Opens the bookmarklet guide modal above the help dialog. */
export function openBookmarkletGuide(): void {
  const uid = ++instance

  const content = el(
    'div',
    { class: 'flex flex-col gap-5' },
    el('p', { class: 'text-sm leading-6 text-base-content/70' }, fa.help.guide.intro),
    createBrowserSection(uid, 'chrome', fa.help.guide.chromeTitle, fa.help.guide.chromeSteps),
    createBrowserSection(uid, 'firefox', fa.help.guide.firefoxTitle, fa.help.guide.firefoxSteps),
    createTips(),
    createDocs(),
    createCloseForm(),
  )

  openDialog(content, {
    title: fa.help.guide.title,
    className: 'max-h-[85vh] w-11/12 max-w-2xl overflow-y-auto',
  })
}
