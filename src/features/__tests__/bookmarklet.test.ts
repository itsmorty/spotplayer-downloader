// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fa } from '../../i18n/fa'
import { notify } from '../../ui/toast'

vi.mock('../../ui/toast', () => ({ notify: vi.fn() }))

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

const BOOKMARKLET = 'javascript:alert(1)'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  vi.mocked(notify).mockClear()
  document.body.replaceChildren()
  fetchMock = vi.fn(async () => new Response(`${BOOKMARKLET}\n`, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('loadBookmarkletText', () => {
  it('resolves the file against the Vite base and caches it', async () => {
    const { loadBookmarkletText, bookmarkletUrl } = await import('../bookmarklet')

    expect(bookmarkletUrl()).toBe('http://localhost:3000/bookmarklet.txt')
    await expect(loadBookmarkletText()).resolves.toBe(BOOKMARKLET)
    await expect(loadBookmarkletText()).resolves.toBe(BOOKMARKLET)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a response that is not a single-line javascript: URL', async () => {
    fetchMock.mockResolvedValue(new Response('not a bookmarklet\n', { status: 200 }))
    const { loadBookmarkletText } = await import('../bookmarklet')

    await expect(loadBookmarkletText()).rejects.toThrow('invalid bookmarklet')
  })

  it('does not cache failures, so a later call retries', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    const { loadBookmarkletText } = await import('../bookmarklet')

    await expect(loadBookmarkletText()).rejects.toThrow('HTTP 503')
    await expect(loadBookmarkletText()).resolves.toBe(BOOKMARKLET)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('copyText', () => {
  it('prefers the async clipboard API', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { copyText } = await import('../bookmarklet')

    await expect(copyText(BOOKMARKLET)).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith(BOOKMARKLET)
  })

  it('falls back to a hidden textarea when the clipboard API fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    })
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    const { copyText } = await import('../bookmarklet')

    await expect(copyText(BOOKMARKLET)).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })
})

describe('createBookmarkletSection', () => {
  it('disables the button until the file loads, then copies it', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { createBookmarkletSection } = await import('../bookmarklet')

    const section = createBookmarkletSection()
    const button = section.querySelector('button')
    if (!button) throw new Error('missing copy button')

    expect(button.disabled).toBe(true)
    await vi.waitFor(() => expect(button.disabled).toBe(false))

    button.click()
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(fa.help.copiedBookmarklet, 'success'))
    expect(writeText).toHaveBeenCalledWith(BOOKMARKLET)
    expect(button.disabled).toBe(false)
  })

  it('shows a Persian error and keeps the button disabled when loading fails', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    const { createBookmarkletSection } = await import('../bookmarklet')

    const section = createBookmarkletSection()
    await flush()

    expect(section.textContent).toContain(fa.help.bookmarkletLoadFailed)
    const button = section.querySelector('button')
    expect(button?.disabled).toBe(true)
  })

  it('reports a copy failure with an error toast', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })
    const { createBookmarkletSection } = await import('../bookmarklet')

    const section = createBookmarkletSection()
    const button = section.querySelector('button')
    if (!button) throw new Error('missing copy button')
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    button.click()
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(fa.toast.copyFailed, 'error'))
  })
})
