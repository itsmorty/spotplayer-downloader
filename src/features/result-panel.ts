/**
 * Result card for a finished single-video extraction.
 *
 * Owns exactly one object URL at a time: replacing or clearing the result
 * revokes the previous URL, so a long playlist cannot leak memory. The download
 * button delegates to `saveBlob` and stays silent when the user cancels the
 * native save picker.
 */

import { fa } from '../i18n/fa'
import { saveBlob } from '../lib/download'
import { formatBytes, formatDuration } from '../lib/format'
import { el } from '../ui/el'
import { notify } from '../ui/toast'

export interface ResultPanelHandle {
  element: HTMLElement
  show(blob: Blob, filename: string, expectedSeconds?: number): void
  clear(): void
}

const ICONS = {
  download: '<path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" />',
} as const

let instance = 0

function svgIcon(paths: string, size = 18): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

/** Full-precision seconds for the badge tooltip (Latin digits, up to 6 dp). */
function preciseSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0'
  return seconds.toFixed(6).replace(/\.?0+$/, '')
}

function createResultPanel(): ResultPanelHandle {
  const uid = ++instance
  const headingId = `result-heading-${uid}`

  let current: { blob: Blob; filename: string } | null = null
  let objectUrl: string | null = null
  let saving = false

  const filenameEl = el('p', {
    class: 'max-w-full truncate text-xs text-base-content/60',
    dir: 'auto',
    'data-result-filename': '',
  })

  const sizeBadge = el(
    'span',
    {
      class: 'badge badge-ghost whitespace-nowrap text-xs tabular-nums',
      'data-result-size': '',
    },
    '',
  )

  const durationBadge = el(
    'span',
    {
      class: 'badge badge-ghost whitespace-nowrap text-xs tabular-nums',
      'data-result-duration': '',
    },
    '',
  )
  durationBadge.style.display = 'none'

  const video = el('video', {
    class: 'aspect-video w-full rounded-box bg-base-300',
    controls: 'controls',
    playsinline: 'playsinline',
    preload: 'metadata',
    'aria-label': fa.result.videoAria,
    'data-result-video': '',
  })

  const spinner = el('span', {
    class: 'loading loading-spinner loading-sm',
    'aria-hidden': 'true',
  })
  spinner.style.display = 'none'
  const downloadLabel = el('span', {}, fa.result.download)
  const downloadButton = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary gap-2',
      'data-result-download': '',
    },
    svgIcon(ICONS.download),
    spinner,
    downloadLabel,
  )

  const card = el(
    'section',
    {
      class: 'card border border-base-300 bg-base-100 shadow-sm',
      'aria-labelledby': headingId,
      'data-result-card': '',
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
          el('h2', { id: headingId, class: 'text-lg font-bold' }, fa.result.title),
          filenameEl,
        ),
        el('div', { class: 'flex flex-wrap items-center gap-2' }, sizeBadge, durationBadge),
      ),
      video,
      el('div', { class: 'flex justify-end' }, downloadButton),
    ),
  )
  card.style.display = 'none'

  function revokeUrl(): void {
    if (objectUrl !== null) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
  }

  function setDuration(seconds: number | undefined): void {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
      durationBadge.textContent = ''
      durationBadge.removeAttribute('title')
      durationBadge.removeAttribute('aria-label')
      durationBadge.style.display = 'none'
      return
    }
    durationBadge.textContent = formatDuration(seconds)
    durationBadge.title = fa.result.durationExact(preciseSeconds(seconds))
    durationBadge.setAttribute('aria-label', `${fa.result.duration}: ${formatDuration(seconds)}`)
    durationBadge.style.display = ''
  }

  function setSaving(next: boolean): void {
    saving = next
    downloadButton.disabled = next
    spinner.style.display = next ? '' : 'none'
    downloadLabel.textContent = next ? fa.result.downloading : fa.result.download
    downloadButton.setAttribute('aria-busy', String(next))
  }

  video.addEventListener('loadedmetadata', () => {
    // Trust the produced file over the share code's advertised duration.
    if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration)
  })

  async function download(): Promise<void> {
    if (current === null || saving) return
    const { blob, filename } = current
    setSaving(true)
    try {
      const saved = await saveBlob(blob, filename)
      if (saved) notify(fa.toast.saved, 'success')
    } catch {
      notify(fa.errors.save, 'error')
    } finally {
      setSaving(false)
    }
  }

  downloadButton.addEventListener('click', () => {
    void download()
  })

  return {
    element: card,

    show(blob: Blob, filename: string, expectedSeconds?: number): void {
      revokeUrl()
      current = { blob, filename }
      objectUrl = URL.createObjectURL(blob)
      video.src = objectUrl
      filenameEl.textContent = filename
      filenameEl.title = filename
      sizeBadge.textContent = formatBytes(blob.size)
      sizeBadge.title = fa.result.size
      sizeBadge.setAttribute('aria-label', `${fa.result.size}: ${formatBytes(blob.size)}`)
      setDuration(expectedSeconds)
      setSaving(false)
      card.style.display = ''
    },

    clear(): void {
      revokeUrl()
      current = null
      video.removeAttribute('src')
      if (typeof video.load === 'function') video.load()
      filenameEl.textContent = ''
      filenameEl.removeAttribute('title')
      sizeBadge.textContent = ''
      sizeBadge.removeAttribute('title')
      sizeBadge.removeAttribute('aria-label')
      setDuration(undefined)
      setSaving(false)
      card.style.display = 'none'
    },
  }
}

export { createResultPanel }
