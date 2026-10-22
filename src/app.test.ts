// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startApp } from './app'
import { ExtractError, extractVideo } from './lib/extract'
import { saveBlob } from './lib/download'
import { fa } from './i18n/fa'

vi.mock('./lib/extract', async () => {
  const actual = await vi.importActual<typeof import('./lib/extract')>('./lib/extract')
  return { ...actual, extractVideo: vi.fn() }
})

vi.mock('./lib/download', async () => {
  const actual = await vi.importActual<typeof import('./lib/download')>('./lib/download')
  return { ...actual, saveBlob: vi.fn(async () => true) }
})

const CODE_JSON = JSON.stringify({
  l: 'licence',
  m: 'machine',
  course: 'course-1',
  name: 'Course One',
  videos: [
    { id: 'v1', name: 'Lesson 1', size: 1000, cdn: 1, time: 10 },
    { id: 'v2', name: 'Lesson 2', size: 2000, cdn: 1, time: 20 },
    { id: 'v3', name: 'Lesson 3', size: 3000, cdn: 1, time: 30 },
  ],
})

function q<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`missing ${selector}`)
  return found
}

function select(videoId: string): void {
  const checkbox = q<HTMLInputElement>(`[data-video-id="${videoId}"] input[type="checkbox"]`)
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
}

async function loadCourse(): Promise<void> {
  const textarea = q<HTMLTextAreaElement>('#share-code-mount textarea')
  textarea.value = CODE_JSON
  const form = textarea.closest('form')
  if (!form) throw new Error('share-code form is missing')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(document.querySelectorAll('[data-video-id]')).toHaveLength(3))
}

function mockProgress(): void {
  vi.mocked(extractVideo).mockImplementation(async (_code, video, opts) => {
    opts?.onProgress?.({ phase: 'download', done: 1, total: 2 })
    opts?.onProgress?.({ phase: 'download', done: 2, total: 2 })
    opts?.onProgress?.({ phase: 'decrypt', done: 1, total: 1 })
    opts?.onProgress?.({ phase: 'remux', done: 1, total: 1 })
    return new Blob([video.id], { type: 'video/mp4' })
  })
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  )
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:result'),
    revokeObjectURL: vi.fn(),
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  vi.mocked(extractVideo).mockReset()
  vi.mocked(saveBlob).mockReset()
  vi.mocked(saveBlob).mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('single-video extraction UI', () => {
  it('shows progress, then the result, and re-enables the UI', async () => {
    mockProgress()
    startApp(q<HTMLElement>('#app'))
    await loadCourse()
    select('v1')

    q<HTMLButtonElement>('#extract-one').click()

    const progressCard = q<HTMLElement>('[data-progress-card]')
    expect(progressCard.style.display).toBe('')
    expect(progressCard.getAttribute('data-mode')).toBe('single')
    expect(q<HTMLButtonElement>('#download-all').disabled).toBe(true)
    expect(q<HTMLTextAreaElement>('#share-code-mount textarea').disabled).toBe(true)

    await vi.waitFor(() => expect(q<HTMLElement>('[data-result-card]').style.display).toBe(''))
    await vi.waitFor(() =>
      expect(q<HTMLVideoElement>('[data-result-video]').getAttribute('src')).toBe('blob:result'),
    )

    expect(extractVideo).toHaveBeenCalledTimes(1)
    expect(q('[data-result-filename]').textContent).toBe('Lesson 1.mp4')
    expect(q<HTMLElement>('[data-progress-alert]').className).toContain('bg-success/10')
    expect(q('[data-progress-alert]').textContent).toBe(fa.progress.singleSuccess)

    // Finally re-enables everything according to the selection.
    expect(q<HTMLButtonElement>('#extract-one').disabled).toBe(false)
    expect(q<HTMLButtonElement>('#download-all').disabled).toBe(false)
    expect(q<HTMLTextAreaElement>('#share-code-mount textarea').disabled).toBe(false)
  })

  it('aborts on cancel and reports it as informational', async () => {
    vi.mocked(extractVideo).mockImplementation(
      (_code, _video, opts) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('the operation was aborted', 'AbortError'))
          })
        }),
    )
    startApp(q<HTMLElement>('#app'))
    await loadCourse()
    select('v1')

    q<HTMLButtonElement>('#extract-one').click()
    q<HTMLButtonElement>('[data-progress-cancel]').click()

    expect(q<HTMLElement>('[data-progress-status]').textContent).toBe(fa.progress.cancelling)

    await vi.waitFor(() =>
      expect(q<HTMLElement>('[data-progress-alert]').className).toContain('bg-info/10'),
    )
    expect(q('[data-progress-alert]').textContent).toBe(fa.errors.aborted)
    expect(q<HTMLElement>('[data-result-card]').style.display).toBe('none')
    expect(q<HTMLButtonElement>('#extract-one').disabled).toBe(false)
  })

  it('maps an engine HTTP failure to a persistent Persian alert', async () => {
    vi.mocked(extractVideo).mockRejectedValue(
      new ExtractError('http', 'segment 0: HTTP 403', { status: 403 }),
    )
    startApp(q<HTMLElement>('#app'))
    await loadCourse()
    select('v1')

    q<HTMLButtonElement>('#extract-one').click()

    await vi.waitFor(() =>
      expect(q<HTMLElement>('[data-progress-alert]').className).toContain('bg-error/10'),
    )
    expect(q('[data-progress-alert]').textContent).toBe(fa.errors.http(403))
    expect(q<HTMLElement>('[data-progress-status]').textContent).toBe(fa.progress.failed)
    expect(q<HTMLButtonElement>('#extract-one').disabled).toBe(false)
  })
})

describe('playlist extraction UI', () => {
  it('saves two selected videos strictly one after the other', async () => {
    mockProgress()
    startApp(q<HTMLElement>('#app'))
    await loadCourse()
    select('v1')
    select('v2')

    let releaseFirst: () => void = () => {}
    const firstSave = new Promise<boolean>((resolve) => {
      releaseFirst = () => resolve(true)
    })
    const savedNames: string[] = []
    vi.mocked(saveBlob).mockImplementation(async (_blob, filename) => {
      savedNames.push(filename)
      if (savedNames.length === 1) return firstSave
      return true
    })

    q<HTMLButtonElement>('#download-all').click()

    expect(q<HTMLElement>('[data-progress-card]').getAttribute('data-mode')).toBe('queue')
    expect(q<HTMLButtonElement>('#extract-one').disabled).toBe(true)
    expect(q<HTMLTextAreaElement>('#share-code-mount textarea').disabled).toBe(true)

    await vi.waitFor(() => expect(savedNames).toEqual(['Lesson 1.mp4']))
    // The first file is still being saved: item 2 must not have started.
    expect(extractVideo).toHaveBeenCalledTimes(1)
    expect(q('[data-video-id="v1"] td:last-child .badge').textContent).toContain(
      fa.status.running,
    )
    expect(q('[data-video-id="v2"] td:last-child .badge').textContent).toContain(
      fa.status.pending,
    )

    releaseFirst()

    await vi.waitFor(() => expect(savedNames).toEqual(['Lesson 1.mp4', 'Lesson 2.mp4']))
    await vi.waitFor(() =>
      expect(q<HTMLElement>('[data-progress-alert]').className).toContain('bg-success/10'),
    )

    expect(extractVideo).toHaveBeenCalledTimes(2)
    expect(q('[data-progress-alert]').textContent).toBe(fa.progress.summarySuccess(2))
    expect(q('[data-video-id="v1"] td:last-child .badge').textContent).toContain(fa.status.done)
    expect(q('[data-video-id="v2"] td:last-child .badge').textContent).toContain(fa.status.done)
    expect(q<HTMLButtonElement>('#download-all').disabled).toBe(false)
    expect(q<HTMLTextAreaElement>('#share-code-mount textarea').disabled).toBe(false)
  })

  it('continues after a failed item and shows a warning summary', async () => {
    vi.mocked(extractVideo).mockImplementation(async (_code, video) => {
      if (video.id === 'v1') {
        throw new ExtractError('http', 'segment 0: HTTP 500', { status: 500 })
      }
      return new Blob([video.id], { type: 'video/mp4' })
    })
    startApp(q<HTMLElement>('#app'))
    await loadCourse()
    select('v1')
    select('v2')

    q<HTMLButtonElement>('#download-all').click()

    await vi.waitFor(() =>
      expect(q<HTMLElement>('[data-progress-alert]').className).toContain('bg-warning/10'),
    )

    expect(q('[data-progress-alert]').textContent).toBe(fa.progress.summaryPartial(1, 1))
    expect(extractVideo).toHaveBeenCalledTimes(2)
    const failedBadge = q<HTMLElement>('[data-video-id="v1"] td:last-child .badge')
    expect(failedBadge.textContent).toContain(fa.status.error)
    expect(failedBadge.title).toBe(fa.errors.http(500))
    expect(q('[data-video-id="v2"] td:last-child .badge').textContent).toContain(fa.status.done)
  })
})
