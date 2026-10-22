/**
 * Application shell: sticky header, theme toggle, help trigger, footer and the
 * mount points that the feature modules fill in (share code, course summary,
 * video list, actions).
 */

import { fa } from './i18n/fa'
import { el } from './ui/el'
import { applyTheme, resolveInitialTheme, toggleTheme, type Theme } from './ui/theme'
import { mountToastContainer } from './ui/toast'

const ICONS = {
  play: '<path d="M8.4 5.6a1 1 0 0 1 1.53-.85l8 6.4a1 1 0 0 1 0 1.7l-8 6.4a1 1 0 0 1-1.53-.85Z" fill="currentColor" stroke="none" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.42 1.42" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.93 19.07 1.42-1.42" /><path d="m17.66 6.34 1.41-1.41" />',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />',
  help: '<circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.8" /><path d="M12 17h.01" />',
} as const

function svgIcon(paths: string, size = 20): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

function createBrand(): HTMLDivElement {
  return el(
    'div',
    { class: 'flex min-w-0 items-center gap-3' },
    el(
      'div',
      {
        class:
          'grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-content shadow-sm',
        'aria-hidden': 'true',
      },
      svgIcon(ICONS.play, 22),
    ),
    el(
      'div',
      { class: 'flex min-w-0 flex-col' },
      el(
        'p',
        { class: 'truncate text-sm font-bold leading-6 sm:text-base' },
        fa.brand.title,
      ),
      el(
        'p',
        { class: 'hidden truncate text-xs text-base-content/60 sm:block' },
        fa.brand.tagline,
      ),
    ),
  )
}

function createHelpButton(): HTMLButtonElement {
  return el(
    'button',
    {
      id: 'help-button',
      type: 'button',
      class: 'btn btn-ghost btn-circle',
      'aria-label': fa.nav.help,
      title: fa.nav.helpHint,
    },
    svgIcon(ICONS.help),
  )
}

function createThemeToggle(initial: Theme): HTMLButtonElement {
  const button = el('button', {
    id: 'theme-toggle',
    type: 'button',
    class: 'btn btn-ghost btn-circle',
  })

  const paint = (theme: Theme): void => {
    const label = theme === 'dark' ? fa.theme.switchToLight : fa.theme.switchToDark
    button.replaceChildren(svgIcon(theme === 'dark' ? ICONS.sun : ICONS.moon))
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(theme === 'dark'))
    button.title = label
  }

  paint(initial)
  button.addEventListener('click', () => paint(toggleTheme()))
  return button
}

function createHeader(theme: Theme): HTMLElement {
  return el(
    'header',
    {
      class: 'sticky top-0 z-30 border-b border-base-300 bg-base-200/80 backdrop-blur',
    },
    el(
      'div',
      { class: 'mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6' },
      createBrand(),
      el(
        'div',
        { class: 'ms-auto flex items-center gap-1' },
        createHelpButton(),
        createThemeToggle(theme),
      ),
    ),
  )
}

function createIntro(): HTMLElement {
  return el(
    'section',
    { class: 'flex flex-col gap-2' },
    el(
      'h1',
      { class: 'text-2xl font-bold tracking-tight sm:text-3xl' },
      fa.hero.title,
    ),
    el(
      'p',
      { class: 'max-w-2xl text-sm leading-6 text-base-content/70 sm:text-base' },
      fa.hero.subtitle,
    ),
  )
}

function createFooter(): HTMLElement {
  return el(
    'footer',
    { class: 'border-t border-base-300 bg-base-200/50' },
    el(
      'div',
      {
        class:
          'mx-auto flex w-full max-w-6xl flex-col gap-1.5 px-4 py-5 text-xs leading-5 text-base-content/60 sm:px-6',
      },
      el('p', {}, fa.footer.privacy),
      el(
        'div',
        { class: 'flex flex-wrap items-center gap-x-2 gap-y-1 text-base-content/50' },
        el('span', {}, fa.footer.ownership),
        el('span', { class: 'hidden sm:inline', 'aria-hidden': 'true' }, '·'),
        el('span', { class: 'hidden sm:inline' }, fa.footer.independent),
      ),
    ),
  )
}

/**
 * Builds the shell and mounts it into `root`.
 *
 * Feature modules are mounted into `#share-code-mount`, `#course-mount`,
 * `#video-list-mount` and `#action-bar-mount`; the latter three start hidden
 * and are revealed once a share code is loaded.
 */
export function startApp(root: HTMLElement): void {
  const theme = resolveInitialTheme()
  applyTheme(theme)
  mountToastContainer()

  const skipLink = el(
    'a',
    {
      href: '#app-main',
      class:
        'sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-content',
    },
    fa.nav.skipToContent,
  )

  const courseMount = el('div', { id: 'course-mount', class: 'flex flex-col gap-6' })
  const listMount = el('div', { id: 'video-list-mount', class: 'flex flex-col gap-6' })
  const actionMount = el('div', { id: 'action-bar-mount' })
  courseMount.hidden = true
  listMount.hidden = true
  actionMount.hidden = true

  const main = el(
    'main',
    {
      id: 'app-main',
      class:
        'mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8',
    },
    createIntro(),
    el('div', { id: 'share-code-mount' }),
    courseMount,
    listMount,
    actionMount,
  )

  const shell = el(
    'div',
    { class: 'flex min-h-dvh flex-col bg-base-200/40' },
    skipLink,
    createHeader(theme),
    main,
    createFooter(),
  )

  root.replaceChildren(shell)
}
