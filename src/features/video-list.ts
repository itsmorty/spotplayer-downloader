/**
 * Video list with selection, per-row statuses and empty states.
 *
 * Rows are built once per `setVideos` (a single DocumentFragment, so a 68-item
 * course renders in one paint). Status updates patch only the affected row, so
 * a running playlist keeps the user's selection intact.
 */

import { fa, selectedCount, videosCount } from '../i18n/fa'
import { formatBytes, formatDuration, formatNumber } from '../lib/format'
import type { Video } from '../lib/types'
import { el } from '../ui/el'

export type VideoItemStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

export interface VideoListOptions {
  onSelectionChange?: (selected: Video[]) => void
}

export interface VideoListHandle {
  element: HTMLElement
  setVideos(videos: Video[]): void
  clear(): void
  getSelected(): Video[]
  getAll(): Video[]
  setItemStatus(videoId: string, status: VideoItemStatus, error?: string): void
  resetStatuses(): void
  setDisabled(disabled: boolean): void
}

interface RowRefs {
  tr: HTMLTableRowElement
  checkbox: HTMLInputElement
  statusCell: HTMLTableCellElement
}

const STATUS_CLASS: Record<VideoItemStatus, string> = {
  idle: 'badge-ghost text-base-content/70',
  pending: 'badge-outline',
  running: 'badge-info',
  done: 'badge-success',
  error: 'badge-error',
}

const ICONS = {
  film: '<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16" /><path d="M17 4v16" /><path d="M3 9h4" /><path d="M3 15h4" /><path d="M17 9h4" /><path d="M17 15h4" />',
} as const

let instance = 0

function svgIcon(paths: string, size = 22): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  return template.content.firstElementChild as SVGSVGElement
}

function createStatusBadge(status: VideoItemStatus, error?: string): HTMLSpanElement {
  const badge = el('span', {
    class: `badge whitespace-nowrap ${STATUS_CLASS[status]}${status === 'running' ? ' gap-1' : ''}`,
  })

  if (status === 'running') {
    badge.append(
      el('span', { class: 'loading loading-spinner loading-xs', 'aria-hidden': 'true' }),
    )
  }

  badge.append(el('span', {}, fa.status[status]))

  if (status === 'error' && error) {
    badge.title = error
    badge.setAttribute('aria-label', `${fa.status.error}: ${error}`)
  } else {
    badge.setAttribute('aria-label', fa.videos.statusAria(fa.status[status]))
  }

  return badge
}

export function createVideoList(opts: VideoListOptions = {}): VideoListHandle {
  const uid = ++instance
  const headingId = `video-list-heading-${uid}`
  const selectAllId = `video-select-all-${uid}`

  let videos: Video[] = []
  let selected = new Set<string>()
  let statuses = new Map<string, { status: VideoItemStatus; error?: string }>()
  let disabled = false
  let mode: 'no-code' | 'list' = 'no-code'
  const rows = new Map<string, RowRefs>()

  const countBadge = el('span', { class: 'badge badge-sm badge-ghost tabular-nums' }, videosCount(0))
  const selectedCountEl = el('span', { class: 'font-medium text-base-content/70' }, selectedCount(0))
  const selectedSizeEl = el('span', { class: 'text-base-content/50' })

  const selectionSummary = el(
    'div',
    { class: 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', 'aria-live': 'polite' },
    selectedCountEl,
    el('span', { class: 'text-base-content/30', 'aria-hidden': 'true' }, '·'),
    selectedSizeEl,
  )

  const selectToggle = el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-xs sm:btn-sm',
    'aria-label': fa.videos.selectAllAria,
  })
  selectToggle.textContent = fa.videos.selectAll
  selectToggle.disabled = true

  const selectAllCheckbox = el('input', {
    id: selectAllId,
    type: 'checkbox',
    class: 'checkbox checkbox-sm',
    'aria-label': fa.videos.selectAllAria,
  })
  selectAllCheckbox.disabled = true

  const tbody = el('tbody')

  const th = (content: Node | string, extra = ''): HTMLTableCellElement =>
    el(
      'th',
      {
        class: `sticky top-0 z-10 whitespace-nowrap bg-base-200 text-start text-xs font-semibold text-base-content/60 ${extra}`,
      },
      content,
    )

  const table = el(
    'table',
    { class: 'table table-zebra table-sm md:table-md w-full', 'aria-label': fa.videos.tableAria },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        th(selectAllCheckbox, 'w-10'),
        th(fa.videos.row, 'w-14'),
        th(fa.videos.name, 'min-w-48'),
        th(fa.videos.duration, 'w-24'),
        th(fa.videos.size, 'w-28'),
        th(fa.videos.status, 'w-28'),
      ),
    ),
    tbody,
  )

  const tableWrap = el('div', { class: 'overflow-auto max-h-[30rem]' }, table)

  const emptyTitle = el('p', { class: 'text-sm font-semibold' }, fa.videos.emptyNoCode)
  const emptyHint = el(
    'p',
    { class: 'max-w-sm text-xs leading-5 text-base-content/55' },
    fa.videos.noCodeHint,
  )
  const emptyState = el(
    'div',
    {
      class: 'flex flex-col items-center gap-2 px-6 py-12 text-center text-base-content/70',
    },
    el(
      'div',
      {
        class: 'grid size-11 place-items-center rounded-full bg-base-200 text-base-content/50',
        'aria-hidden': 'true',
      },
      svgIcon(ICONS.film),
    ),
    emptyTitle,
    emptyHint,
  )

  const card = el(
    'section',
    {
      class: 'card border border-base-300 bg-base-100 shadow-sm transition-opacity',
      'aria-labelledby': headingId,
    },
    el(
      'div',
      { class: 'card-body gap-0 p-0' },
      el(
        'div',
        {
          class:
            'flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
        },
        el(
          'div',
          { class: 'flex min-w-0 flex-col gap-1.5' },
          el(
            'div',
            { class: 'flex flex-wrap items-center gap-2' },
            el('h2', { id: headingId, class: 'text-lg font-bold' }, fa.videos.title),
            countBadge,
          ),
          selectionSummary,
        ),
        selectToggle,
      ),
      tableWrap,
      emptyState,
    ),
  )

  function updateHeader(): void {
    const total = videos.length
    const count = selected.size
    let bytes = 0
    for (const video of videos) {
      if (selected.has(video.id)) bytes += video.size
    }

    countBadge.textContent = videosCount(total)
    selectedCountEl.textContent = count === 0 ? fa.selection.none : selectedCount(count)
    selectedSizeEl.textContent = `${fa.selection.selectedSize}: ${formatBytes(bytes)}`

    const all = total > 0 && count === total
    selectAllCheckbox.checked = all
    selectAllCheckbox.indeterminate = count > 0 && count < total
    selectAllCheckbox.disabled = disabled || total === 0
    selectAllCheckbox.setAttribute(
      'aria-label',
      all ? fa.videos.selectNoneAria : fa.videos.selectAllAria,
    )

    selectToggle.disabled = disabled || total === 0
    selectToggle.textContent = all ? fa.videos.selectNone : fa.videos.selectAll
    selectToggle.setAttribute(
      'aria-label',
      all ? fa.videos.selectNoneAria : fa.videos.selectAllAria,
    )
  }

  function getSelected(): Video[] {
    return videos.filter((video) => selected.has(video.id))
  }

  function notifySelection(): void {
    opts.onSelectionChange?.(getSelected())
  }

  function syncSelection(): void {
    updateHeader()
    notifySelection()
  }

  function setSelected(videoId: string, isSelected: boolean): void {
    if (isSelected) selected.add(videoId)
    else selected.delete(videoId)

    const row = rows.get(videoId)
    if (row) row.tr.classList.toggle('bg-primary/5', isSelected)
    syncSelection()
  }

  function clearSelection(): void {
    selected = new Set<string>()
    for (const row of rows.values()) {
      row.checkbox.checked = false
      row.tr.classList.remove('bg-primary/5')
    }
  }

  function updateVisibility(): void {
    const hasVideos = videos.length > 0
    tableWrap.style.display = hasVideos ? '' : 'none'
    emptyState.style.display = hasVideos ? 'none' : ''

    if (!hasVideos) {
      emptyTitle.textContent =
        mode === 'no-code' ? fa.videos.emptyNoCode : fa.videos.emptyNoVideos
      emptyHint.textContent = mode === 'no-code' ? fa.videos.noCodeHint : ''
      emptyHint.style.display = mode === 'no-code' ? '' : 'none'
    }
  }

  function buildRow(video: Video, index: number): HTMLTableRowElement {
    const checkbox = el('input', {
      type: 'checkbox',
      class: 'checkbox checkbox-sm',
      'aria-label': fa.videos.selectRow(video.name),
    })

    const status = statuses.get(video.id)?.status ?? 'idle'
    const statusCell = el('td', {}, createStatusBadge(status, statuses.get(video.id)?.error))

    const tr = el(
      'tr',
      { class: 'cursor-pointer', 'data-video-id': video.id },
      el('td', { class: 'w-10' }, checkbox),
      el(
        'td',
        { class: 'w-14 text-start text-xs tabular-nums text-base-content/45' },
        formatNumber(index + 1),
      ),
      el(
        'td',
        { class: 'min-w-48 max-w-md text-start' },
        el(
          'span',
          { class: 'cell-clamp text-sm font-medium leading-6', title: video.name },
          video.name,
        ),
      ),
      el(
        'td',
        { class: 'w-24 text-start' },
        el(
          'span',
          { class: 'badge badge-ghost whitespace-nowrap text-xs tabular-nums' },
          formatDuration(video.time),
        ),
      ),
      el(
        'td',
        { class: 'w-28 text-start' },
        el(
          'span',
          { class: 'badge badge-ghost whitespace-nowrap text-xs tabular-nums' },
          formatBytes(video.size),
        ),
      ),
      statusCell,
    )

    checkbox.addEventListener('change', () => setSelected(video.id, checkbox.checked))
    tr.addEventListener('click', (event) => {
      if (disabled) return
      const target = event.target as Element | null
      if (target?.closest('input, button, a, label, select, textarea')) return
      checkbox.checked = !checkbox.checked
      setSelected(video.id, checkbox.checked)
    })

    rows.set(video.id, { tr, checkbox, statusCell })
    return tr
  }

  function patchStatus(videoId: string, status: VideoItemStatus, error?: string): void {
    statuses.set(videoId, error === undefined ? { status } : { status, error })
    const row = rows.get(videoId)
    if (row) row.statusCell.replaceChildren(createStatusBadge(status, error))
  }

  selectAllCheckbox.addEventListener('change', () => {
    if (disabled) return
    const all = videos.length > 0 && selected.size === videos.length
    if (all || !selectAllCheckbox.checked) {
      clearSelection()
    } else {
      for (const video of videos) selected.add(video.id)
      for (const row of rows.values()) {
        row.checkbox.checked = true
        row.tr.classList.add('bg-primary/5')
      }
    }
    syncSelection()
  })

  selectToggle.addEventListener('click', () => {
    if (disabled || videos.length === 0) return
    const all = selected.size === videos.length
    if (all) {
      clearSelection()
    } else {
      for (const video of videos) selected.add(video.id)
      for (const row of rows.values()) {
        row.checkbox.checked = true
        row.tr.classList.add('bg-primary/5')
      }
    }
    syncSelection()
  })

  updateHeader()
  updateVisibility()

  return {
    element: card,

    setVideos(nextVideos: Video[]): void {
      videos = [...nextVideos]
      selected = new Set<string>()
      statuses = new Map(videos.map((video) => [video.id, { status: 'idle' as const }]))
      rows.clear()
      tbody.replaceChildren()

      const fragment = document.createDocumentFragment()
      videos.forEach((video, index) => fragment.append(buildRow(video, index)))
      tbody.append(fragment)

      mode = 'list'
      updateVisibility()
      syncSelection()
    },

    clear(): void {
      videos = []
      selected = new Set<string>()
      statuses.clear()
      rows.clear()
      tbody.replaceChildren()
      mode = 'no-code'
      updateVisibility()
      syncSelection()
    },

    getSelected,

    getAll(): Video[] {
      return [...videos]
    },

    setItemStatus(videoId: string, status: VideoItemStatus, error?: string): void {
      if (!statuses.has(videoId)) return
      patchStatus(videoId, status, error)
    },

    resetStatuses(): void {
      for (const videoId of statuses.keys()) patchStatus(videoId, 'idle')
    },

    setDisabled(next: boolean): void {
      disabled = next
      card.classList.toggle('opacity-60', next)
      card.setAttribute('aria-busy', String(next))
      for (const row of rows.values()) row.checkbox.disabled = next
      updateHeader()
    },
  }
}
