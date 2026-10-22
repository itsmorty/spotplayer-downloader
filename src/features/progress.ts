/**
 * Reusable extraction-progress card.
 *
 * The card is hidden until a run starts. In `single` mode it shows the current
 * video's phase and progress; in `queue` mode it adds an overall bar plus the
 * «ویدیوی n از m» position. All text comes from `fa`; the component never talks
 * to the network or to the extraction engine, so it stays easy to test.
 */

import { fa } from '../i18n/fa'
import { formatNumber, formatPercent } from '../lib/format'
import { el } from '../ui/el'

export type ProgressMode = 'single' | 'queue'
export type ProgressPhase = 'download' | 'decrypt' | 'remux'
export type ProgressAlertKind = 'success' | 'warning' | 'error' | 'info'

export interface ProgressHandle {
  element: HTMLElement
  show(mode: ProgressMode): void
  hide(): void
  setMode(mode: ProgressMode): void
  setPhase(phase: ProgressPhase | null): void
  setItemProgress(done: number, total: number): void
  setOverallProgress(done: number, total: number): void
  setOverallPercent(percent: number): void
  setOverallLabel(label: string): void
  setStatus(label: string): void
  showAlert(kind: ProgressAlertKind, message: string): void
  hideAlert(): void
  setCancelEnabled(enabled: boolean): void
  /** Registers a cancel handler; returns an unsubscribe function. */
  onCancel(cb: () => void): () => void
}

const PHASE_CLASS: Record<ProgressPhase, string> = {
  download: 'badge-primary',
  decrypt: 'badge-info',
  remux: 'badge-secondary',
}

const ICONS = {
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />',
  success: '<circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" />',
  warning: '<path d="M10.3 3.9 2.6 17a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 16.5h.01" />',
  error: '<circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" />',
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />',
} as const

const ALERT_CLASS: Record<ProgressAlertKind, string> = {
  success: 'border-success/30 bg-success/10',
  warning: 'border-warning/30 bg-warning/10',
  error: 'border-error/30 bg-error/10',
  info: 'border-info/30 bg-info/10',
}

let instance = 0

function svgIcon(paths: string, size = 16): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

function clampPercent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.max(0, (done / total) * 100))
}

function setProgressValue(bar: HTMLProgressElement, percent: number): void {
  bar.value = percent
  bar.setAttribute('aria-valuetext', formatPercent(percent))
}

function createProgress(): ProgressHandle {
  const uid = ++instance
  const headingId = `progress-heading-${uid}`

  const cancelHandlers = new Set<() => void>()

  const title = el('h2', { id: headingId, class: 'text-lg font-bold' }, fa.progress.title)
  const phaseBadge = el('span', {
    class: 'badge badge-sm badge-primary',
    'data-progress-phase': '',
  })
  phaseBadge.style.display = 'none'

  const status = el(
    'p',
    {
      class: 'text-sm leading-6 text-base-content/70',
      'data-progress-status': '',
      'aria-live': 'polite',
    },
    fa.progress.starting,
  )

  const cancelButton = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost btn-sm gap-2',
      'data-progress-cancel': '',
      'aria-label': fa.progress.cancelAria,
    },
    svgIcon(ICONS.stop),
    el('span', {}, fa.progress.cancel),
  )

  const itemBar = el('progress', {
    class: 'progress progress-primary w-full',
    max: '100',
    value: '0',
    'aria-label': fa.progress.itemLabel,
    'data-progress-item-bar': '',
  }) as HTMLProgressElement
  const itemPercent = el(
    'span',
    {
      class: 'text-xs font-semibold tabular-nums text-base-content/70',
      'data-progress-item-percent': '',
    },
    formatPercent(0),
  )
  const itemCount = el(
    'span',
    { class: 'text-xs tabular-nums text-base-content/45', 'data-progress-item-count': '' },
    '',
  )

  const itemBlock = el(
    'div',
    { class: 'flex flex-col gap-1.5', 'data-progress-item': '' },
    el(
      'div',
      { class: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1' },
      el('span', { class: 'text-xs font-medium text-base-content/60' }, fa.progress.itemLabel),
      el('span', { class: 'flex items-baseline gap-2' }, itemCount, itemPercent),
    ),
    itemBar,
  )

  const overallBar = el('progress', {
    class: 'progress progress-secondary w-full',
    max: '100',
    value: '0',
    'aria-label': fa.progress.overall,
    'data-progress-overall-bar': '',
  }) as HTMLProgressElement
  const overallPercent = el(
    'span',
    {
      class: 'text-xs font-semibold tabular-nums text-base-content/70',
      'data-progress-overall-percent': '',
    },
    formatPercent(0),
  )
  const overallLabel = el(
    'span',
    { class: 'text-xs tabular-nums text-base-content/60', 'data-progress-overall-label': '' },
    '',
  )

  const overallBlock = el(
    'div',
    { class: 'flex flex-col gap-1.5', 'data-progress-overall': '' },
    el(
      'div',
      { class: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1' },
      el('span', { class: 'text-xs font-medium text-base-content/60' }, fa.progress.overall),
      el('span', { class: 'flex items-baseline gap-2' }, overallLabel, overallPercent),
    ),
    overallBar,
  )
  overallBlock.style.display = 'none'

  const alertIcon = svgIcon(ICONS.info, 18)
  alertIcon.setAttribute('class', 'mt-0.5 shrink-0 text-info')
  const alertText = el('span', {})
  const alert = el(
    'div',
    {
      class: `alert items-start border shadow-none text-base-content text-sm leading-6 ${ALERT_CLASS.info}`,
      role: 'status',
      'data-progress-alert': '',
    },
    alertIcon,
    alertText,
  )
  alert.style.display = 'none'

  const card = el(
    'section',
    {
      class: 'card border border-base-300 bg-base-100 shadow-sm',
      'aria-labelledby': headingId,
      'data-progress-card': '',
      'data-mode': 'single',
    },
    el(
      'div',
      { class: 'card-body gap-4 p-5 sm:p-6' },
      el(
        'div',
        { class: 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between' },
        el(
          'div',
          { class: 'flex min-w-0 flex-col gap-1' },
          el('div', { class: 'flex flex-wrap items-center gap-2' }, title, phaseBadge),
          status,
        ),
        cancelButton,
      ),
      itemBlock,
      overallBlock,
      alert,
    ),
  )
  card.style.display = 'none'

  function setMode(next: ProgressMode): void {
    card.setAttribute('data-mode', next)
    title.textContent = next === 'queue' ? fa.progress.titleQueue : fa.progress.title
    overallBlock.style.display = next === 'queue' ? '' : 'none'
  }

  function setPhase(phase: ProgressPhase | null): void {
    if (phase === null) {
      phaseBadge.style.display = 'none'
      phaseBadge.textContent = ''
      return
    }
    phaseBadge.className = `badge badge-sm ${PHASE_CLASS[phase]}`
    phaseBadge.textContent = fa.progress.phase[phase]
    phaseBadge.style.display = ''
  }

  function setItemProgress(done: number, total: number): void {
    const percent = clampPercent(done, total)
    setProgressValue(itemBar, percent)
    itemPercent.textContent = formatPercent(percent)
    itemCount.textContent =
      Number.isFinite(total) && total > 0
        ? `${formatNumber(done)} / ${formatNumber(total)}`
        : ''
  }

  function setOverallProgress(done: number, total: number): void {
    setOverallPercent(clampPercent(done, total))
  }

  function setOverallPercent(percent: number): void {
    const safe = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))
    setProgressValue(overallBar, safe)
    overallPercent.textContent = formatPercent(safe)
  }

  function setOverallLabel(label: string): void {
    overallLabel.textContent = label
  }

  function setStatus(label: string): void {
    status.textContent = label
  }

  function showAlert(kind: ProgressAlertKind, message: string): void {
    alert.className = `alert items-start border shadow-none text-base-content text-sm leading-6 ${ALERT_CLASS[kind]}`
    alert.setAttribute('role', kind === 'error' ? 'alert' : 'status')
    alertIcon.innerHTML = ICONS[kind]
    alertIcon.setAttribute('class', `mt-0.5 shrink-0 text-${kind}`)
    alertText.textContent = message
    alert.style.display = ''
  }

  function hideAlert(): void {
    alertText.textContent = ''
    alert.style.display = 'none'
  }

  function setCancelEnabled(enabled: boolean): void {
    cancelButton.disabled = !enabled
  }

  function onCancel(cb: () => void): () => void {
    cancelHandlers.add(cb)
    return () => cancelHandlers.delete(cb)
  }

  cancelButton.addEventListener('click', () => {
    if (cancelButton.disabled) return
    for (const handler of cancelHandlers) handler()
  })

  return {
    element: card,
    show(nextMode: ProgressMode): void {
      setMode(nextMode)
      setPhase(null)
      setItemProgress(0, 1)
      setOverallProgress(0, 1)
      setOverallLabel('')
      setStatus(fa.progress.starting)
      hideAlert()
      setCancelEnabled(true)
      card.style.display = ''
    },
    hide(): void {
      card.style.display = 'none'
    },
    setMode,
    setPhase,
    setItemProgress,
    setOverallProgress,
    setOverallPercent,
    setOverallLabel,
    setStatus,
    showAlert,
    hideAlert,
    setCancelEnabled,
    onCancel,
  }
}

export { createProgress }
