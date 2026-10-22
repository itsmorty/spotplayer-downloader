import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMp4, parseMp4s } from '../remux'
import {
  decryptSegment,
  FILE_HEADER_SIZE,
  KEY_LENGTH,
  KEY_OFFSET,
  SEGMENT_SIZE,
} from '../spot'
import { extractVideo, ExtractError } from '../extract'
import type { Progress } from '../extract'
import type { ShareCode, Video } from '../types'
import { makeMp4s } from './fixtures'

const CODE: ShareCode = {
  l: 'lic',
  m: 'mac',
  course: 'course-1',
  name: 'Course One',
  videos: [],
}

function video(size: number, cdn = 1): Video {
  return { id: 'video-1', name: 'Lesson 1', size, cdn, time: 10 }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function makeKey(seed = 0): Uint8Array {
  return Uint8Array.from({ length: KEY_LENGTH }, (_, i) => (i * 37 + seed * 11 + 5) & 0xff)
}

/** The 184-byte `.spot` header; the XOR key sits at bytes 25..152 in the clear. */
function makeHeader(key: Uint8Array): Uint8Array {
  const header = new Uint8Array(FILE_HEADER_SIZE)
  for (let i = 0; i < header.length; i++) header[i] = (i * 13 + 29) & 0xff
  header.set(key, KEY_OFFSET)
  return header
}

/**
 * A complete plaintext `.spot` file: header + `mp4s` body. Splitting and
 * encrypting it produces the bytes the CDN would serve (XOR is symmetric).
 */
function makeSpotFile(body: Uint8Array, key = makeKey()): Uint8Array {
  return concat([makeHeader(key), body])
}

/** Splits the file at segment boundaries and encrypts each segment. */
function serveSegments(file: Uint8Array, key = makeKey()): Uint8Array[] {
  const segments: Uint8Array[] = []
  for (let start = 0; start < file.length; start += SEGMENT_SIZE) {
    const chunk = file.slice(start, Math.min(start + SEGMENT_SIZE, file.length))
    segments.push(decryptSegment(chunk, key, start))
  }
  return segments
}

interface RequestLog {
  url: string
  host: string
  segIndex: number
  start: number
  end: number
}

interface CdnOptions {
  /** Segment index that answers with a non-2xx response. */
  failAt?: number
  status?: number
  /** Called once per request, before answering; may abort the controller. */
  onRequest?: (segIndex: number) => void
}

function stubCdn(segments: readonly Uint8Array[], opts: CdnOptions = {}): { requests: RequestLog[] } {
  const requests: RequestLog[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const parsed = new URL(url)
    const segIndex = Number(parsed.searchParams.get('s'))
    const range = parsed.searchParams.get('bytes') ?? ''
    const [start, end] = range.split('-').map(Number)
    requests.push({ url, host: parsed.host, segIndex, start, end })

    opts.onRequest?.(segIndex)
    if (opts.failAt === segIndex) {
      return new Response(null, { status: opts.status ?? 503 })
    }
    const body = segments[segIndex] ?? new Uint8Array(0)
    return new Response(body as Uint8Array<ArrayBuffer>, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { requests }
}

function firstDifference(a: Uint8Array, b: Uint8Array): number | null {
  if (a.length !== b.length) return Math.min(a.length, b.length)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return i
  }
  return null
}

function expectSameBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length)
  expect(firstDifference(actual, expected)).toBeNull()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractVideo', () => {
  it('downloads, decrypts and remuxes a single-segment video', async () => {
    const body = makeMp4s({ videoFrames: 4, audioFrames: 8 })
    const file = makeSpotFile(body)
    const segments = serveSegments(file)
    expect(segments).toHaveLength(1)

    const { requests } = stubCdn(segments)
    const events: Progress[] = []
    const blob = await extractVideo(CODE, video(body.length), {
      jobs: 1,
      onProgress: (p) => events.push(p),
    })

    expect(blob.type).toBe('video/mp4')
    const expected = buildMp4(parseMp4s(body)).mp4
    expectSameBytes(new Uint8Array(await blob.arrayBuffer()), expected)

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      host: 'dl0.sp.spotcdn.ir',
      segIndex: 0,
      start: 0,
      end: SEGMENT_SIZE - 1,
    })
    expect(requests[0].url).toContain('/lic/mac/course-1/video-1.spot?')
    expect(requests[0].url).toContain('s=0&bytes=0-2097151')

    expect(events.map((e) => e.phase)).toEqual(['download', 'decrypt', 'remux'])
    expect(events[0]).toEqual({ phase: 'download', done: 1, total: 1 })
    expect(events[1]).toEqual({ phase: 'decrypt', done: 1, total: 1 })
    expect(events[2]).toEqual({ phase: 'remux', done: 1, total: 1 })
  })

  it('handles a multi-segment container and rotates CDN hosts', async () => {
    const body = makeMp4s({ videoFrames: 6, audioFrames: 12, videoSampleSize: 750_000 })
    expect(body.length).toBeGreaterThan(2 * SEGMENT_SIZE)
    const file = makeSpotFile(body)
    const segments = serveSegments(file)
    expect(segments.length).toBe(3)

    const { requests } = stubCdn(segments)
    const events: Progress[] = []
    const blob = await extractVideo(CODE, video(body.length, 0b101), {
      jobs: 2,
      onProgress: (p) => events.push(p),
    })

    expectSameBytes(new Uint8Array(await blob.arrayBuffer()), buildMp4(parseMp4s(body)).mp4)

    expect(requests.map((r) => r.segIndex).sort((a, b) => a - b)).toEqual([0, 1, 2])
    const hosts = new Map(requests.map((r) => [r.segIndex, r.host]))
    // cdnHosts(0b101) === [dl0, dl4, dl1, dl5, ...]
    expect(hosts.get(0)).toBe('dl0.sp.spotcdn.ir')
    expect(hosts.get(1)).toBe('dl4.sp.spotcdn.ir')
    expect(hosts.get(2)).toBe('dl1.sp.spotcdn.ir')

    const phases = events.map((e) => e.phase)
    expect(phases).toEqual([
      'download', 'download', 'download',
      'decrypt', 'decrypt', 'decrypt',
      'remux',
    ])
    const download = events.filter((e) => e.phase === 'download').map((e) => e.done)
    expect(download).toEqual([1, 2, 3])
    expect(events.filter((e) => e.phase === 'download').every((e) => e.total === 3)).toBe(true)
    expect(events.filter((e) => e.phase === 'decrypt').map((e) => e.done)).toEqual([1, 2, 3])
  })

  it('surfaces CDN failures as an http ExtractError with segment details', async () => {
    const body = makeMp4s()
    const file = makeSpotFile(body)
    const segments = serveSegments(file)
    stubCdn(segments, { failAt: 0, status: 403 })

    const error = await extractVideo(CODE, video(body.length)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ExtractError)
    expect(error).toMatchObject({ name: 'ExtractError', code: 'http', segment: 0, status: 403 })
    expect((error as ExtractError).message).toContain('403')
  })

  it('rejects with an aborted ExtractError when the signal is already aborted', async () => {
    const body = makeMp4s()
    const controller = new AbortController()
    controller.abort()
    const { requests } = stubCdn(serveSegments(makeSpotFile(body)))

    await expect(
      extractVideo(CODE, video(body.length), { signal: controller.signal, jobs: 1 }),
    ).rejects.toMatchObject({ name: 'ExtractError', code: 'aborted' })
    expect(requests).toHaveLength(0)
  })

  it('stops the download when the signal aborts mid-flight', async () => {
    const body = makeMp4s({ videoFrames: 4, audioFrames: 8, videoSampleSize: 1_500_000 })
    const file = makeSpotFile(body)
    const segments = serveSegments(file)
    expect(segments.length).toBeGreaterThan(1)
    const controller = new AbortController()

    const { requests } = stubCdn(segments, {
      onRequest: (segIndex) => {
        if (segIndex === 0) controller.abort()
      },
    })

    await expect(
      extractVideo(CODE, video(body.length), { signal: controller.signal, jobs: 1 }),
    ).rejects.toMatchObject({ name: 'ExtractError', code: 'aborted' })
    expect(requests).toHaveLength(1)
  })

  it('rejects an empty video', async () => {
    stubCdn([])
    await expect(extractVideo(CODE, video(0))).rejects.toMatchObject({
      name: 'ExtractError',
      code: 'empty',
    })
  })

  it('rejects a payload that does not match the declared size', async () => {
    const body = makeMp4s()
    const file = makeSpotFile(body)
    stubCdn(serveSegments(file))

    await expect(extractVideo(CODE, video(body.length + 5000), { jobs: 1 })).rejects.toMatchObject({
      name: 'ExtractError',
      code: 'size-mismatch',
    })
  })

  it('rejects a segment 0 that is too short for the header', async () => {
    stubCdn([new Uint8Array(100)])
    await expect(extractVideo(CODE, video(10_000), { jobs: 1 })).rejects.toMatchObject({
      name: 'ExtractError',
      code: 'empty',
    })
  })

  it('wraps remux failures in an ExtractError', async () => {
    const body = makeMp4s()
    body[0] = 0x00 // corrupt the "mp4s" magic
    const file = makeSpotFile(body)
    stubCdn(serveSegments(file))

    const error = await extractVideo(CODE, video(body.length), { jobs: 1 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ExtractError)
    expect(error).toMatchObject({
      name: 'ExtractError',
      code: 'remux',
      remuxCode: 'not-mp4s',
    })
    expect((error as ExtractError).cause).toBeInstanceOf(Error)
  })
})
