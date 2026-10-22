/**
 * Share-code decoding.
 *
 * A share code is either raw JSON or `SP1:` followed by the base64 of the
 * gzipped JSON (shape produced by `spikes/003-creds-handoff/bookmarklet.js`):
 *
 *   { l, m, course, name?, videos: [{ id, name, size, cdn, time }] }
 *
 * Decoding is pure and local — nothing is sent anywhere.
 */

import type { ShareCode, Video } from './types'

export type ShareCodeErrorCode = 'invalid-format' | 'gzip-failed' | 'missing-field' | 'invalid-video'

/** Raised when a share code cannot be read or is structurally invalid. */
export class ShareCodeError extends Error {
  readonly code: ShareCodeErrorCode

  constructor(code: ShareCodeErrorCode, message: string) {
    super(message)
    this.name = 'ShareCodeError'
    this.code = code
  }
}

const SP1_PREFIX = /^SP1:/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function gunzipToText(data: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  } catch (error) {
    throw new ShareCodeError('gzip-failed', `could not gunzip the share code: ${describe(error)}`)
  }
}

function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ShareCodeError('missing-field', `share code is missing "${key}"`)
  }
  return value
}

function requireVideoString(video: Record<string, unknown>, field: string, index: number): string {
  const value = video[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ShareCodeError('invalid-video', `video ${index} has an invalid "${field}"`)
  }
  return value
}

function requireVideoNumber(video: Record<string, unknown>, field: string, index: number): number {
  const value = video[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ShareCodeError('invalid-video', `video ${index} has an invalid "${field}"`)
  }
  return value
}

function parseVideo(value: unknown, index: number): Video {
  if (!isRecord(value)) {
    throw new ShareCodeError('invalid-video', `video ${index} is not an object`)
  }
  return {
    id: requireVideoString(value, 'id', index),
    name: requireVideoString(value, 'name', index),
    size: requireVideoNumber(value, 'size', index),
    cdn: requireVideoNumber(value, 'cdn', index),
    time: requireVideoNumber(value, 'time', index),
  }
}

function parseShareCodeJson(json: string): ShareCode {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (error) {
    throw new ShareCodeError('invalid-format', `share code is not valid JSON: ${describe(error)}`)
  }
  if (!isRecord(raw)) {
    throw new ShareCodeError('invalid-format', 'share code JSON must be an object')
  }

  const l = requireString(raw, 'l')
  const m = requireString(raw, 'm')
  const course = requireString(raw, 'course')
  if (!Array.isArray(raw.videos)) {
    throw new ShareCodeError('missing-field', 'share code is missing "videos"')
  }
  const videos = raw.videos.map((entry, index) => parseVideo(entry, index))
  const name = typeof raw.name === 'string' ? raw.name : ''

  return { l, m, course, name, videos }
}

/**
 * Decodes a share code: `SP1:<base64(gzip(json))>` or raw JSON.
 * Whitespace (including newlines inside the base64) is ignored.
 */
export async function decodeShareCode(text: string): Promise<ShareCode> {
  if (typeof text !== 'string') {
    throw new ShareCodeError('invalid-format', 'share code must be a string')
  }
  const trimmed = text.trim()
  if (trimmed === '') {
    throw new ShareCodeError('invalid-format', 'share code is empty')
  }

  if (SP1_PREFIX.test(trimmed)) {
    const payload = trimmed.slice(4).replace(/\s+/g, '')
    if (payload === '') {
      throw new ShareCodeError('invalid-format', 'SP1 share code has no payload')
    }
    let compressed: Uint8Array<ArrayBuffer>
    try {
      compressed = base64ToBytes(payload)
    } catch (error) {
      throw new ShareCodeError('invalid-format', `share code is not valid base64: ${describe(error)}`)
    }
    return parseShareCodeJson(await gunzipToText(compressed))
  }

  return parseShareCodeJson(trimmed)
}
