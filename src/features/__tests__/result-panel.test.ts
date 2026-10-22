// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createResultPanel } from '../result-panel'
import { saveBlob } from '../../lib/download'
import { fa } from '../../i18n/fa'
import { notify } from '../../ui/toast'

vi.mock('../../lib/download', () => ({ saveBlob: vi.fn(async () => true) }))
vi.mock('../../ui/toast', () => ({ notify: vi.fn() }))

function q<T extends Element>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`missing ${selector}`)
  return found
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let nextUrl = 0

beforeEach(() => {
  nextUrl = 0
  createObjectURL = vi.fn(() => `blob:${++nextUrl}`)
  revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.mocked(saveBlob).mockReset()
  vi.mocked(saveBlob).mockResolvedValue(true)
  vi.mocked(notify).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createResultPanel', () => {
  it('is hidden until a result arrives and fills the preview', () => {
    const panel = createResultPanel()
    expect(panel.element.style.display).toBe('none')

    const blob = new Blob(['video bytes'], { type: 'video/mp4' })
    panel.show(blob, 'Lesson 1.mp4', 429.418667)

    expect(panel.element.style.display).toBe('')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(q<HTMLVideoElement>(panel.element, '[data-result-video]').getAttribute('src')).toBe(
      'blob:1',
    )
    expect(q(panel.element, '[data-result-filename]').textContent).toBe('Lesson 1.mp4')
    expect(q(panel.element, '[data-result-size]').getAttribute('title')).toBe(fa.result.size)
    expect(q(panel.element, '[data-result-duration]').textContent).toBe('07:09')
    expect(q(panel.element, '[data-result-duration]').getAttribute('title')).toBe(
      fa.result.durationExact('429.418667'),
    )
  })

  it('prefers the produced file duration once metadata loads', () => {
    const panel = createResultPanel()
    panel.show(new Blob(['x']), 'a.mp4', 429.418667)
    const video = q<HTMLVideoElement>(panel.element, '[data-result-video]')
    const duration = q(panel.element, '[data-result-duration]')

    Object.defineProperty(video, 'duration', { configurable: true, value: 100.5 })
    video.dispatchEvent(new Event('loadedmetadata'))

    expect(duration.textContent).toBe('01:41')
    expect(duration.getAttribute('title')).toBe(fa.result.durationExact('100.5'))
  })

  it('revokes the previous object URL when replaced and on clear', () => {
    const panel = createResultPanel()
    const video = q<HTMLVideoElement>(panel.element, '[data-result-video]')

    panel.show(new Blob(['one']), 'one.mp4')
    panel.show(new Blob(['two']), 'two.mp4')

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(video.getAttribute('src')).toBe('blob:2')

    panel.clear()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:2')
    expect(video.hasAttribute('src')).toBe(false)
    expect(panel.element.style.display).toBe('none')
  })

  it('downloads through saveBlob and confirms success', async () => {
    const panel = createResultPanel()
    const blob = new Blob(['x'])
    panel.show(blob, 'Lesson 1.mp4')

    q<HTMLButtonElement>(panel.element, '[data-result-download]').click()
    await flush()

    expect(saveBlob).toHaveBeenCalledWith(blob, 'Lesson 1.mp4')
    expect(notify).toHaveBeenCalledWith(fa.toast.saved, 'success')
  })

  it('stays silent when the save is cancelled', async () => {
    const panel = createResultPanel()
    panel.show(new Blob(['x']), 'a.mp4')
    vi.mocked(saveBlob).mockResolvedValueOnce(false)

    q<HTMLButtonElement>(panel.element, '[data-result-download]').click()
    await flush()

    expect(notify).not.toHaveBeenCalled()
  })

  it('reports a real save failure', async () => {
    const panel = createResultPanel()
    panel.show(new Blob(['x']), 'a.mp4')
    vi.mocked(saveBlob).mockRejectedValueOnce(new Error('disk full'))

    q<HTMLButtonElement>(panel.element, '[data-result-download]').click()
    await flush()

    expect(notify).toHaveBeenCalledWith(fa.errors.save, 'error')
  })
})
