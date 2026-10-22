/**
 * Saving a finished MP4.
 *
 * Prefers the File System Access API (`showSaveFilePicker` + a writable stream)
 * so large files stream straight to disk. Falls back to an object URL and a
 * hidden `<a download>` anchor, which is all a static GitHub Pages app can do in
 * browsers without the picker. Browser-only: no SSR path is required.
 */

interface SaveFilePickerType {
  description?: string
  accept: Record<string, string[]>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: SaveFilePickerType[]
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<WritableStream<Uint8Array>>
}

type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>

const MP4_TYPE: SaveFilePickerType = {
  description: 'MP4 video',
  accept: { 'video/mp4': ['.mp4'] },
}

/** Characters Windows/macOS reject, plus ASCII control characters. */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g

const FALLBACK_FILENAME = 'video.mp4'

/**
 * Makes a user/API-supplied name safe for the picker and `<a download>`.
 * Keeps the extension (callers pass `.mp4`), drops path separators and control
 * characters, collapses whitespace and falls back to `video.mp4`.
 */
export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()

  return cleaned === '' ? FALLBACK_FILENAME : cleaned
}

function getSaveFilePicker(): ShowSaveFilePicker | null {
  if (typeof window === 'undefined') return null
  const candidate = (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  if (typeof candidate !== 'function') return null
  return (candidate as ShowSaveFilePicker).bind(window)
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

async function saveWithPicker(
  picker: ShowSaveFilePicker,
  blob: Blob,
  name: string,
): Promise<void> {
  let writable: WritableStream<Uint8Array> | null = null
  try {
    const handle = await picker({ suggestedName: name, types: [MP4_TYPE] })
    writable = await handle.createWritable()
    // `pipeTo` closes the destination stream, which commits the file.
    await blob.stream().pipeTo(writable)
  } catch (error) {
    if (writable) {
      try {
        await writable.abort()
      } catch {
        // Already errored/closed by `pipeTo`; nothing left to release.
      }
    }
    throw error
  }
}

function saveWithAnchor(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
  }
  // Give the download a tick to start before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Saves `blob` as `filename`, preferring the File System Access API.
 * A user cancel is silent; other failures are rethrown.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const name = sanitizeFilename(filename)
  const picker = getSaveFilePicker()

  if (picker) {
    try {
      await saveWithPicker(picker, blob, name)
      return
    } catch (error) {
      if (isAbortError(error)) return
      throw error
    }
  }

  saveWithAnchor(blob, name)
}
