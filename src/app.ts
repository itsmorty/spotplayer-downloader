/**
 * Application shell: sticky header, theme toggle, help trigger, footer and the
 * mount points that the feature modules fill in (share code, course summary,
 * video list, actions).
 */

import { fa, selectedCount, videosCount } from './i18n/fa'
import { createDisclaimer } from './features/disclaimer'
import { openHelpDialog } from './features/help-dialog'
import { createProgress } from './features/progress'
import { createResultPanel } from './features/result-panel'
import { extractErrorMessage, isAbortFailure } from './features/extract-errors'
import { createShareCodeInput } from './features/share-code-input'
import { createVideoList } from './features/video-list'
import { saveBlob } from './lib/download'
import { extractVideo, ExtractError } from './lib/extract'
import { formatBytes } from './lib/format'
import { runQueue, type QueueItem } from './lib/queue'
import type { ShareCode, Video } from './lib/types'
import { el } from './ui/el'
import { applyTheme, resolveInitialTheme, toggleTheme, type Theme } from './ui/theme'
import { mountToastContainer, notify } from './ui/toast'

const ICONS = {
  play: '<path d="M8.4 5.6a1 1 0 0 1 1.53-.85l8 6.4a1 1 0 0 1 0 1.7l-8 6.4a1 1 0 0 1-1.53-.85Z" fill="currentColor" stroke="none" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.42 1.42" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.93 19.07 1.42-1.42" /><path d="m17.66 6.34 1.41-1.41" />',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />',
  help: '<circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.8" /><path d="M12 17h.01" />',
  download: '<path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" />',
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

function createHeader(theme: Theme, onHelp: () => void): HTMLElement {
  const helpButton = createHelpButton()
  helpButton.addEventListener('click', onHelp)

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
        helpButton,
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

interface CourseSummary {
  element: HTMLElement
  name: HTMLElement
  count: HTMLElement
  size: HTMLElement
}

function createCourseSummary(): CourseSummary {
  const name = el('h2', { id: 'course-name', class: 'text-xl font-bold leading-8' })
  const count = el('p', { class: 'text-sm font-semibold leading-6 tabular-nums' })
  const size = el('p', { class: 'text-sm font-semibold leading-6 tabular-nums' })

  const stat = (label: string, value: HTMLElement): HTMLElement =>
    el(
      'div',
      { class: 'rounded-lg border border-base-300 bg-base-200/50 px-3 py-2' },
      el('p', { class: 'text-xs leading-5 text-base-content/50' }, label),
      value,
    )

  const element = el(
    'section',
    {
      class: 'card border border-base-300 bg-base-100 shadow-sm',
      'aria-labelledby': 'course-name',
    },
    el(
      'div',
      { class: 'card-body gap-4 p-5 sm:p-6' },
      el(
        'div',
        { class: 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between' },
        el(
          'div',
          { class: 'flex min-w-0 flex-col gap-1' },
          el(
            'p',
            { class: 'text-xs font-medium leading-5 text-base-content/50' },
            fa.course.label,
          ),
          name,
        ),
        el(
          'div',
          { class: 'grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-64' },
          stat(fa.course.videosLabel, count),
          stat(fa.course.sizeLabel, size),
        ),
      ),
    ),
  )

  return { element, name, count, size }
}

interface ActionBar {
  element: HTMLElement
  extractOne: HTMLButtonElement
  downloadAll: HTMLButtonElement
  count: HTMLElement
  size: HTMLElement
  hint: HTMLElement
}

function createActionBar(): ActionBar {
  const count = el(
    'span',
    { class: 'text-sm font-medium leading-6 text-base-content/70' },
    fa.selection.none,
  )
  const size = el(
    'span',
    { class: 'text-xs leading-5 text-base-content/50' },
    `${fa.selection.selectedSize}: ${formatBytes(0)}`,
  )
  const hint = el(
    'p',
    { class: 'text-xs leading-5 text-base-content/55' },
    fa.selection.hintNone,
  )

  const extractOne = el(
    'button',
    {
      id: 'extract-one',
      type: 'button',
      class: 'btn btn-primary gap-2',
      disabled: 'disabled',
    },
    svgIcon(ICONS.play, 18),
    el('span', {}, fa.selection.extractOne),
  )

  const downloadAll = el(
    'button',
    {
      id: 'download-all',
      type: 'button',
      class: 'btn btn-secondary gap-2',
      disabled: 'disabled',
    },
    svgIcon(ICONS.download, 18),
    el('span', {}, fa.selection.downloadAll),
  )

  const element = el(
    'section',
    {
      class: 'card border border-base-300 bg-base-100 shadow-sm',
      'aria-labelledby': 'action-heading',
    },
    el(
      'div',
      {
        class:
          'card-body flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
      },
      el(
        'div',
        { class: 'flex min-w-0 flex-col gap-1' },
        el(
          'div',
          { class: 'flex flex-wrap items-baseline gap-x-3 gap-y-1' },
          el('h2', { id: 'action-heading', class: 'text-sm font-bold' }, fa.selection.title),
          count,
          size,
        ),
        hint,
      ),
      el('div', { class: 'flex flex-col gap-2 sm:flex-row' }, extractOne, downloadAll),
    ),
  )

  return { element, extractOne, downloadAll, count, size, hint }
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

  let currentCode: ShareCode | null = null
  let busy = false
  let activeRun: { controller: AbortController; id: number } | null = null
  let runSequence = 0

  const courseMount = el('div', {
    id: 'course-mount',
    class: 'flex flex-col gap-6 scroll-mt-24',
  })
  const listMount = el('div', {
    id: 'video-list-mount',
    class: 'flex flex-col gap-6 scroll-mt-24',
  })
  const actionMount = el('div', { id: 'action-bar-mount' })
  const progressMount = el('div', { id: 'progress-mount', class: 'scroll-mt-24' })
  const resultMount = el('div', { id: 'result-mount', class: 'scroll-mt-24' })
  courseMount.style.display = 'none'
  listMount.style.display = 'none'
  actionMount.style.display = 'none'

  const summary = createCourseSummary()
  const actionBar = createActionBar()
  const progress = createProgress()
  const resultPanel = createResultPanel()
  courseMount.append(summary.element)
  actionMount.append(actionBar.element)
  progressMount.append(progress.element)
  resultMount.append(resultPanel.element)

  function syncActions(selected: Video[]): void {
    const bytes = selected.reduce((total, video) => total + video.size, 0)
    actionBar.count.textContent =
      selected.length === 0 ? fa.selection.none : selectedCount(selected.length)
    actionBar.size.textContent = `${fa.selection.selectedSize}: ${formatBytes(bytes)}`
    actionBar.extractOne.disabled = busy || selected.length !== 1
    actionBar.downloadAll.disabled = busy || selected.length === 0
    actionBar.hint.textContent = busy
      ? fa.selection.hintRunning
      : selected.length === 0
        ? fa.selection.hintNone
        : selected.length === 1
          ? fa.selection.hintOne
          : fa.selection.hintMany
  }

  const videoList = createVideoList({ onSelectionChange: syncActions })
  listMount.append(videoList.element)

  const shareMount = el('div', { id: 'share-code-mount' })
  const shareInput = createShareCodeInput({ onLoaded: handleLoaded })
  shareMount.append(shareInput.element)

  const disclaimer = createDisclaimer({ onOpenHelp: openHelpDialog })

  function setBusy(next: boolean): void {
    busy = next
    videoList.setDisabled(next)
    shareInput.setBusy(next)
    actionBar.element.setAttribute('aria-busy', String(next))
    syncActions(videoList.getSelected())
  }

  function beginRun(): { controller: AbortController; id: number } | null {
    if (busy || activeRun) return null
    const controller = new AbortController()
    const run = { controller, id: ++runSequence }
    activeRun = run
    setBusy(true)
    return run
  }

  function isCurrent(run: { id: number }): boolean {
    return activeRun?.id === run.id
  }

  function endRun(run: { id: number }): void {
    if (!isCurrent(run)) return
    activeRun = null
    progress.setPhase(null)
    progress.setCancelEnabled(false)
    setBusy(false)
  }

  progress.onCancel(() => {
    const run = activeRun
    if (!run || run.controller.signal.aborted) return
    run.controller.abort()
    progress.setCancelEnabled(false)
    progress.setStatus(fa.progress.cancelling)
  })

  async function extractSelected(video: Video): Promise<void> {
    if (!currentCode) return
    const run = beginRun()
    if (!run) return
    const code = currentCode
    const signal = run.controller.signal

    resultPanel.clear()
    progress.show('single')
    progress.setCancelEnabled(true)
    progress.setStatus(fa.progress.starting)

    try {
      const blob = await extractVideo(code, video, {
        signal,
        onProgress: (event) => {
          if (!isCurrent(run)) return
          progress.setPhase(event.phase)
          progress.setItemProgress(event.done, event.total)
          progress.setStatus(fa.progress.phase[event.phase])
        },
      })

      if (!isCurrent(run)) return
      progress.setItemProgress(1, 1)
      progress.setStatus(fa.progress.done)
      progress.showAlert('success', fa.progress.singleSuccess)
      resultPanel.show(blob, `${video.name}.mp4`, video.time)
      notify(fa.toast.extractDone, 'success')
    } catch (error) {
      if (!isCurrent(run)) return
      if (isAbortFailure(error)) {
        progress.setStatus(fa.progress.stopped)
        progress.showAlert('info', fa.errors.aborted)
        notify(fa.toast.extractAborted, 'info')
      } else {
        progress.setStatus(fa.progress.failed)
        progress.showAlert('error', extractErrorMessage(error))
        notify(fa.toast.extractFailed, 'error')
      }
    } finally {
      endRun(run)
    }
  }

  async function extractPlaylist(videos: Video[]): Promise<void> {
    if (!currentCode || videos.length === 0) return
    const run = beginRun()
    if (!run) return
    const code = currentCode
    const signal = run.controller.signal
    const total = videos.length
    const items: QueueItem[] = videos.map((video) => ({ video, status: 'pending' }))

    resultPanel.clear()
    progress.show('queue')
    progress.setCancelEnabled(true)
    progress.setStatus(fa.progress.starting)
    progress.setItemProgress(0, 1)
    progress.setOverallProgress(0, total)
    progress.setOverallLabel(fa.progress.itemOf(1, total))

    videoList.resetStatuses()
    for (const item of items) videoList.setItemStatus(item.video.id, 'pending')

    let finished = 0
    let currentFraction = 0

    const updateOverall = (): void => {
      progress.setOverallProgress(finished + currentFraction, total)
    }

    // Extraction + save happen inside one queue step, so the next item cannot
    // start until the current file has been handed to the browser.
    const runOne = async (item: QueueItem): Promise<Blob> => {
      try {
        const blob = await extractVideo(code, item.video, {
          signal,
          onProgress: (event) => {
            if (!isCurrent(run)) return
            currentFraction = event.total > 0 ? event.done / event.total : 0
            progress.setPhase(event.phase)
            progress.setItemProgress(event.done, event.total)
            progress.setStatus(fa.progress.phase[event.phase])
            updateOverall()
          },
        })
        if (!isCurrent(run)) throw new DOMException('aborted', 'AbortError')

        // During saving the current item counts as complete in the overall bar.
        currentFraction = 1
        progress.setPhase(null)
        progress.setItemProgress(1, 1)
        progress.setStatus(fa.progress.saving)
        updateOverall()

        const saved = await saveBlob(blob, `${item.video.name}.mp4`)
        if (!saved) throw new Error(fa.errors.saveCancelled)
        return blob
      } catch (error) {
        if (isAbortFailure(error)) throw error
        if (error instanceof ExtractError) throw new Error(extractErrorMessage(error))
        throw error
      }
    }

    try {
      await runQueue(
        items,
        runOne,
        {
          onItemUpdate: (item) => {
            if (!isCurrent(run)) return

            if (item.status === 'running') {
              currentFraction = 0
              progress.setPhase(null)
              progress.setItemProgress(0, 1)
              progress.setStatus(fa.progress.starting)
              progress.setOverallLabel(fa.progress.itemOf(items.indexOf(item) + 1, total))
              videoList.setItemStatus(item.video.id, 'running')
              updateOverall()
              return
            }

            if (item.status === 'done') {
              finished++
              currentFraction = 0
              progress.setItemProgress(1, 1)
              videoList.setItemStatus(item.video.id, 'done')
              updateOverall()
              return
            }

            if (item.status === 'error') {
              finished++
              currentFraction = 0
              const message =
                item.error === 'aborted' || signal.aborted
                  ? fa.errors.aborted
                  : item.error ?? fa.errors.unknown
              videoList.setItemStatus(item.video.id, 'error', message)
              updateOverall()
            }
          },
          onItemDone: () => {
            // Saved inside `runOne`; the UI state is handled on `done` above.
          },
        },
        signal,
      )

      if (!isCurrent(run)) return

      const done = items.filter((item) => item.status === 'done').length
      const failed = items.filter((item) => item.status === 'error').length

      if (signal.aborted) {
        progress.setStatus(fa.progress.stopped)
        progress.showAlert('info', fa.progress.summaryAborted(done, total))
        notify(fa.toast.queueAborted, 'info')
      } else if (failed === 0) {
        progress.setStatus(fa.progress.done)
        progress.showAlert('success', fa.progress.summarySuccess(done))
        notify(fa.toast.queueDone, 'success')
      } else {
        progress.setStatus(fa.progress.failed)
        progress.showAlert('warning', fa.progress.summaryPartial(done, failed))
        notify(fa.toast.queuePartial(done, failed), 'info')
      }
      progress.setCancelEnabled(false)
    } finally {
      endRun(run)
    }
  }

  function handleLoaded(code: ShareCode): void {
    // A new share code invalidates any in-flight run and its result.
    if (activeRun) {
      activeRun.controller.abort()
      activeRun = null
      setBusy(false)
    }
    currentCode = code
    resultPanel.clear()
    progress.hide()
    progress.setCancelEnabled(false)
    const totalSize = code.videos.reduce((total, video) => total + video.size, 0)

    summary.name.textContent = code.name.trim() === '' ? fa.course.unnamed : code.name
    summary.count.textContent = videosCount(code.videos.length)
    summary.size.textContent = formatBytes(totalSize)

    videoList.setVideos(code.videos)
    courseMount.style.display = ''
    listMount.style.display = ''
    actionMount.style.display = ''

    const reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => {
      courseMount.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  actionBar.extractOne.addEventListener('click', () => {
    const selected = videoList.getSelected()
    if (!currentCode || selected.length !== 1 || busy) return
    void extractSelected(selected[0])
  })

  actionBar.downloadAll.addEventListener('click', () => {
    const selected = videoList.getSelected()
    if (!currentCode || selected.length === 0 || busy) return
    void extractPlaylist(selected)
  })

  const main = el(
    'main',
    {
      id: 'app-main',
      class:
        'mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8',
    },
    createIntro(),
    ...(disclaimer ? [disclaimer] : []),
    shareMount,
    courseMount,
    listMount,
    actionMount,
    progressMount,
    resultMount,
  )

  const shell = el(
    'div',
    { class: 'flex min-h-dvh flex-col bg-base-200/40' },
    skipLink,
    createHeader(theme, openHelpDialog),
    main,
    createFooter(),
  )

  root.replaceChildren(shell)
}
