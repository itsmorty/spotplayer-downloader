// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sanitizeFilename, saveBlob } from '../download'

/** jsdom's Blob has no `stream()`, so make one that streams its bytes. */
function blobWithStream(bytes: Uint8Array): Blob {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
  Object.defineProperty(blob, 'stream', {
    value: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      }),
  })
  return blob
}

function stubObjectUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(() => 'blob:fake-url')
  const revoke = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  return { create, revoke }
}

function captureClicks(): { download: string; href: string }[] {
  const clicked: { download: string; href: string }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href })
  })
  return clicked
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('sanitizeFilename', () => {
  it('strips reserved characters and collapses whitespace', () => {
    expect(sanitizeFilename('lesson: 01 / "intro"?.mp4')).toBe('lesson 01 intro.mp4')
    expect(sanitizeFilename('a\u0000b\u001fc.mp4')).toBe('abc.mp4')
    expect(sanitizeFilename('  a   b  ')).toBe('a b')
  })

  it('keeps a caller-provided .mp4 extension', () => {
    expect(sanitizeFilename('Lesson 1.mp4')).toBe('Lesson 1.mp4')
  })

  it('trims leading dots and trailing dots/spaces', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden')
    expect(sanitizeFilename('name. ')).toBe('name')
  })

  it('falls back to video.mp4 when nothing is left', () => {
    expect(sanitizeFilename('')).toBe('video.mp4')
    expect(sanitizeFilename('   ')).toBe('video.mp4')
    expect(sanitizeFilename('<>:"/\\|?*')).toBe('video.mp4')
  })
})

describe('saveBlob fallback', () => {
  it('clicks a hidden anchor with the sanitized name and revokes the URL', async () => {
    vi.useFakeTimers()
    const { create, revoke } = stubObjectUrls()
    const clicked = captureClicks()
    const blob = new Blob(['mp4 bytes'], { type: 'video/mp4' })

    await saveBlob(blob, 'lesson: 01.mp4')

    expect(create).toHaveBeenCalledTimes(1)
    const calls = create.mock.calls as unknown as [Blob][]
    expect(calls[0][0]).toBe(blob)
    expect(clicked).toEqual([{ download: 'lesson 01.mp4', href: 'blob:fake-url' }])
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:fake-url')
  })

  it('does not use the picker when it is unavailable', async () => {
    stubObjectUrls()
    captureClicks()
    const blob = new Blob(['x'])

    await saveBlob(blob, 'a.mp4')

    expect(
      (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker,
    ).toBeUndefined()
  })
})

describe('saveBlob with File System Access', () => {
  function stubPicker(writable: WritableStream<Uint8Array>): {
    picker: ReturnType<typeof vi.fn>
    createWritable: ReturnType<typeof vi.fn>
  } {
    const createWritable = vi.fn(async () => writable)
    const picker = vi.fn(async () => ({ createWritable }))
    vi.stubGlobal('showSaveFilePicker', picker)
    return { picker, createWritable }
  }

  it('streams the blob into the writable and closes it', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4])
    const blob = blobWithStream(bytes)
    const chunks: Uint8Array[] = []
    let closed = false
    const sink = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk)
      },
      close() {
        closed = true
      },
    })
    const { picker, createWritable } = stubPicker(sink)
    const { create } = stubObjectUrls()
    const clicked = captureClicks()

    await expect(saveBlob(blob, 'lesson.mp4')).resolves.toBe(true)

    expect(picker).toHaveBeenCalledTimes(1)
    const options = picker.mock.calls[0][0] as {
      suggestedName?: string
      types?: { accept?: Record<string, string[]> }[]
    }
    expect(options.suggestedName).toBe('lesson.mp4')
    expect(options.types?.[0].accept?.['video/mp4']).toEqual(['.mp4'])
    expect(createWritable).toHaveBeenCalledTimes(1)
    expect(chunks).toHaveLength(1)
    expect(Array.from(chunks[0])).toEqual([1, 2, 3, 4])
    expect(closed).toBe(true)
    // No anchor fallback when the picker path succeeds.
    expect(create).not.toHaveBeenCalled()
    expect(clicked).toEqual([])
  })

  it('swallows a user cancel', async () => {
    const picker = vi.fn(async () => {
      throw new DOMException('the user aborted a request', 'AbortError')
    })
    vi.stubGlobal('showSaveFilePicker', picker)
    const { create } = stubObjectUrls()
    const clicked = captureClicks()

    await expect(saveBlob(new Blob(['x']), 'a.mp4')).resolves.toBe(false)

    expect(create).not.toHaveBeenCalled()
    expect(clicked).toEqual([])
  })

  it('rethrows other picker errors', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => {
        throw new Error('disk full')
      }),
    )
    stubObjectUrls()

    await expect(saveBlob(new Blob(['x']), 'a.mp4')).rejects.toThrow('disk full')
  })

  it('aborts the writable when streaming fails', async () => {
    const blob = blobWithStream(Uint8Array.from([1, 2, 3]))
    const sink = new WritableStream<Uint8Array>({
      write() {
        throw new Error('write failed')
      },
    })
    const abort = vi.spyOn(sink, 'abort')
    stubPicker(sink)
    stubObjectUrls()

    await expect(saveBlob(blob, 'a.mp4')).rejects.toThrow('write failed')
    expect(abort).toHaveBeenCalled()
  })
})
