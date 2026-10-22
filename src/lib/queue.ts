/**
 * Sequential playlist queue.
 *
 * The whole course can be tens of gigabytes, so items run strictly one at a
 * time: no two extractions are ever in flight and only one MP4 is held at a
 * time. Failures are recorded per item and the queue continues; an abort stops
 * the queue and leaves the remaining items untouched (`pending`).
 */

import type { Video } from './types'

export interface QueueItem {
  video: Video
  status: 'pending' | 'running' | 'done' | 'error'
  error?: string
}

export interface QueueCallbacks {
  /** Called after every status transition (`running`, `done`, `error`). */
  onItemUpdate: (i: QueueItem) => void
  /** Called only after a successful extraction. */
  onItemDone: (i: QueueItem, blob: Blob) => void
}

function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { name?: unknown; code?: unknown }
  return candidate.name === 'AbortError' || candidate.code === 'aborted'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim() === '' ? error.name : error.message
  }
  return String(error)
}

/**
 * Runs `run` for every item sequentially.
 *
 * Mutates each item's `status` (and `error`) in place. `onItemDone` receives the
 * produced blob; callers own it and should save/revoke it before the next item
 * finishes.
 */
export async function runQueue(
  items: QueueItem[],
  run: (i: QueueItem) => Promise<Blob>,
  cb: QueueCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  for (const item of items) {
    if (signal?.aborted) return

    item.status = 'running'
    delete item.error
    cb.onItemUpdate(item)

    try {
      const blob = await run(item)

      if (signal?.aborted) {
        item.status = 'error'
        item.error = 'aborted'
        cb.onItemUpdate(item)
        return
      }

      item.status = 'done'
      cb.onItemUpdate(item)
      cb.onItemDone(item, blob)
    } catch (error) {
      item.status = 'error'
      item.error = signal?.aborted || isAbort(error) ? 'aborted' : errorMessage(error)
      cb.onItemUpdate(item)
      if (signal?.aborted || isAbort(error)) return
    }
  }
}
