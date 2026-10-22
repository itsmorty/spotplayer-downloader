/**
 * Extraction orchestrator: share code + video → MP4 `Blob`.
 *
 * Pipeline (validated in `spikes/001-remux-mp4s/`):
 *
 *   1. download — split the logical `.spot` file (`video.size + 184` bytes) into
 *      2 MiB CDN ranges and fetch them through a small worker pool;
 *   2. decrypt — the XOR key is the plaintext 127 bytes at header offset 25 of
 *      segment 0; decrypt every segment, drop segment 0's 184-byte header and
 *      concatenate into a payload of exactly `video.size` bytes;
 *   3. remux — parse the `mp4s` container and rebuild a standard MP4.
 *
 * Nothing here touches the UI, the network beyond the CDN, or global state. The
 * public `extractVideo` signature is intentionally stable so the large-file path
 * (Task 22) can change the internals without touching callers.
 */

import { buildMp4, parseMp4s, RemuxError, type RemuxErrorCode } from './remux'
import {
  cdnHosts,
  decryptSegment,
  FILE_HEADER_SIZE,
  KEY_LENGTH,
  KEY_OFFSET,
  segmentUrl,
  SEGMENT_SIZE,
} from './spot'
import type { ShareCode, Video } from './types'

export interface Progress {
  phase: 'download' | 'decrypt' | 'remux'
  done: number
  total: number
}

export interface ExtractOptions {
  onProgress?: (p: Progress) => void
  signal?: AbortSignal
  /** Concurrent segment downloads; clamped to 1..16. Defaults to 4. */
  jobs?: number
}

export type ExtractErrorCode =
  | 'http'
  | 'network'
  | 'aborted'
  | 'empty'
  | 'invalid'
  | 'size-mismatch'
  | 'remux'

/** Raised for every recoverable extraction failure; `code` is stable for i18n. */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode
  /** Segment index for download/decryption failures. */
  readonly segment?: number
  /** HTTP status for `http` failures. */
  readonly status?: number
  /** Set for `remux` failures so the UI can distinguish container vs framing. */
  readonly remuxCode?: RemuxErrorCode

  constructor(
    code: ExtractErrorCode,
    message: string,
    details: {
      segment?: number
      status?: number
      remuxCode?: RemuxErrorCode
      cause?: unknown
    } = {},
  ) {
    super(message)
    this.name = 'ExtractError'
    this.code = code
    this.segment = details.segment
    this.status = details.status
    this.remuxCode = details.remuxCode
    if (details.cause !== undefined) this.cause = details.cause
  }
}

const DEFAULT_JOBS = 4
const MAX_JOBS = 16

function resolveJobs(jobs: number | undefined): number {
  if (jobs === undefined || !Number.isFinite(jobs)) return DEFAULT_JOBS
  return Math.min(MAX_JOBS, Math.max(1, Math.floor(jobs)))
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function abortedMessage(): string {
  return 'extraction aborted'
}

function normalizeFailure(error: unknown, signal: AbortSignal | undefined): ExtractError {
  if (error instanceof ExtractError) return error
  if (signal?.aborted || isAbortError(error)) {
    return new ExtractError('aborted', abortedMessage())
  }
  return new ExtractError('network', `segment download failed: ${describe(error)}`)
}

function segmentHost(hosts: readonly string[], segIndex: number): string {
  return hosts[segIndex % hosts.length]
}

/**
 * Downloads, decrypts and remuxes one video.
 *
 * @throws {ExtractError} on HTTP/network failure, abort, malformed payload or
 *   size mismatch.
 */
export async function extractVideo(
  code: ShareCode,
  video: Video,
  opts: ExtractOptions = {},
): Promise<Blob> {
  const { onProgress, signal } = opts
  const emit = (phase: Progress['phase'], done: number, total: number): void => {
    onProgress?.({ phase, done, total })
  }

  if (!Number.isFinite(video.size) || video.size <= 0) {
    throw new ExtractError('empty', `video "${video.id}" has no data (size=${video.size})`)
  }

  if (signal?.aborted) throw new ExtractError('aborted', abortedMessage())

  const total = video.size + FILE_HEADER_SIZE
  const segCount = Math.ceil(total / SEGMENT_SIZE)
  const hosts = cdnHosts(video.cdn)
  if (hosts.length === 0) {
    throw new ExtractError('invalid', `video "${video.id}" has no CDN hosts (cdn=${video.cdn})`)
  }

  // Download with a worker pool. Results stay indexed so decryption preserves
  // the file order. A shared failure stops workers from taking new segments.
  const segments: (Uint8Array | undefined)[] = new Array(segCount)
  let nextSegment = 0
  let downloaded = 0
  let failure: ExtractError | null = null

  const worker = async (): Promise<void> => {
    for (;;) {
      if (failure) return
      if (signal?.aborted) {
        failure ??= new ExtractError('aborted', abortedMessage())
        return
      }
      const index = nextSegment++
      if (index >= segCount) return

      const host = segmentHost(hosts, index)
      const url = segmentUrl({
        host,
        l: code.l,
        m: code.m,
        course: code.course,
        videoId: video.id,
        segIndex: index,
      })

      try {
        const response = await fetch(url, signal ? { signal } : undefined)
        if (!response.ok) {
          failure ??= new ExtractError('http', `segment ${index}: HTTP ${response.status}`, {
            segment: index,
            status: response.status,
          })
          return
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length === 0) {
          failure ??= new ExtractError('empty', `segment ${index} is empty`, { segment: index })
          return
        }
        segments[index] = bytes
      } catch (error) {
        failure ??= normalizeFailure(error, signal)
        return
      }

      downloaded++
      emit('download', downloaded, segCount)
    }
  }

  await Promise.all(Array.from({ length: Math.min(resolveJobs(opts.jobs), segCount) }, () => worker()))
  if (failure) throw failure
  if (signal?.aborted) throw new ExtractError('aborted', abortedMessage())

  const first = segments[0]
  if (!first) {
    throw new ExtractError('empty', 'segment 0 was not downloaded', { segment: 0 })
  }
  if (first.length < FILE_HEADER_SIZE) {
    throw new ExtractError(
      'empty',
      `segment 0 is ${first.length} bytes; the .spot header needs ${FILE_HEADER_SIZE}`,
      { segment: 0 },
    )
  }

  // Copy the key before the segment is released; segment 0 is still encrypted,
  // but the header (including the key) is stored in the clear.
  const key127 = first.slice(KEY_OFFSET, KEY_OFFSET + KEY_LENGTH)
  if (key127.length !== KEY_LENGTH) {
    throw new ExtractError('invalid', `XOR key is ${key127.length} bytes, expected ${KEY_LENGTH}`)
  }

  const payload = new Uint8Array(video.size)
  let written = 0
  for (let index = 0; index < segCount; index++) {
    if (signal?.aborted) {
      segments.length = 0
      throw new ExtractError('aborted', abortedMessage())
    }

    const encrypted = segments[index]
    segments[index] = undefined // release as we go
    if (!encrypted) {
      throw new ExtractError('empty', `segment ${index} is missing`, { segment: index })
    }

    const decrypted = decryptSegment(encrypted, key127, index * SEGMENT_SIZE)
    const skip = index === 0 ? FILE_HEADER_SIZE : 0
    const available = decrypted.length - skip
    const take = Math.min(available, video.size - written)
    if (take > 0) {
      payload.set(decrypted.subarray(skip, skip + take), written)
      written += take
    }

    emit('decrypt', index + 1, segCount)
  }

  if (written !== video.size) {
    throw new ExtractError(
      'size-mismatch',
      `decrypted payload is ${written} bytes, expected ${video.size}`,
    )
  }

  let mp4: Uint8Array
  try {
    mp4 = buildMp4(parseMp4s(payload)).mp4
  } catch (error) {
    throw new ExtractError('remux', `could not remux "${video.id}": ${describe(error)}`, {
      remuxCode: error instanceof RemuxError ? error.code : undefined,
      cause: error,
    })
  }

  emit('remux', 1, 1)
  return new Blob([mp4 as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
}
