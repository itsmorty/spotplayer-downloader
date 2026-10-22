import { describe, expect, it } from 'vitest'
import { decodeShareCode, ShareCodeError } from '../share'
import type { ShareCodeErrorCode } from '../share'

const CODE = {
  l: 'aa11',
  m: 'bb22',
  course: 'cc33',
  name: 'دوره آزمایشی',
  videos: [
    { id: 'v1', name: 'ویدیو ۱', size: 123456, cdn: 7, time: 429.418667 },
    { id: 'v2', name: 'ویدیو ۲', size: 987654, cdn: 0, time: 10 },
  ],
}

async function gzip(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function sp1(value: unknown): Promise<string> {
  return `SP1:${toBase64(await gzip(JSON.stringify(value)))}`
}

async function codeOf(promise: Promise<unknown>): Promise<ShareCodeErrorCode | 'no-error'> {
  try {
    await promise
    return 'no-error'
  } catch (error) {
    if (error instanceof ShareCodeError) return error.code
    throw error
  }
}

describe('decodeShareCode', () => {
  it('round-trips a gzipped SP1 code', async () => {
    const decoded = await decodeShareCode(await sp1(CODE))
    expect(decoded).toEqual(CODE)
  })

  it('trims surrounding whitespace and newlines around an SP1 code', async () => {
    const code = await sp1(CODE)
    const wrapped = `\n\n  ${code}  \n`
    expect(await decodeShareCode(wrapped)).toEqual(CODE)
  })

  it('tolerates line breaks inside the base64 payload', async () => {
    const code = await sp1(CODE)
    const payload = code.slice('SP1:'.length)
    const broken = `SP1:${payload.slice(0, 20)}\n${payload.slice(20, 60)}\r\n${payload.slice(60)}`
    expect(await decodeShareCode(broken)).toEqual(CODE)
  })

  it('accepts raw JSON', async () => {
    expect(await decodeShareCode(JSON.stringify(CODE))).toEqual(CODE)
    expect(await decodeShareCode(`\n ${JSON.stringify(CODE)} \n`)).toEqual(CODE)
  })

  it('keeps only the known fields', async () => {
    const decoded = await decodeShareCode(
      JSON.stringify({ ...CODE, extra: 1, videos: [{ ...CODE.videos[0], junk: 'x' }] }),
    )
    expect(decoded).not.toHaveProperty('extra')
    expect(decoded.videos[0]).not.toHaveProperty('junk')
    expect(decoded.videos[0]).toMatchObject(CODE.videos[0])
  })

  it('defaults a missing course name to an empty string', async () => {
    const { name: _name, ...withoutName } = CODE
    const decoded = await decodeShareCode(JSON.stringify(withoutName))
    expect(decoded.name).toBe('')
  })

  it('rejects empty input', async () => {
    expect(await codeOf(decodeShareCode(''))).toBe('invalid-format')
    expect(await codeOf(decodeShareCode('   \n\t'))).toBe('invalid-format')
  })

  it('rejects malformed raw JSON', async () => {
    expect(await codeOf(decodeShareCode('{not json'))).toBe('invalid-format')
    expect(await codeOf(decodeShareCode('[]'))).toBe('invalid-format')
  })

  it('rejects invalid base64', async () => {
    expect(await codeOf(decodeShareCode('SP1:@@@not-base64@@@'))).toBe('invalid-format')
    expect(await codeOf(decodeShareCode('SP1:'))).toBe('invalid-format')
  })

  it('rejects base64 that is not gzip data', async () => {
    const notGzip = toBase64(new TextEncoder().encode('just some text'))
    expect(await codeOf(decodeShareCode(`SP1:${notGzip}`))).toBe('gzip-failed')
  })

  it('rejects gzipped data that is not JSON', async () => {
    const notJson = toBase64(await gzip('not json at all'))
    expect(await codeOf(decodeShareCode(`SP1:${notJson}`))).toBe('invalid-format')
  })

  it('rejects a code missing required fields', async () => {
    const { l: _l, ...noL } = CODE
    expect(await codeOf(decodeShareCode(JSON.stringify(noL)))).toBe('missing-field')
    const { m: _m, ...noM } = CODE
    expect(await codeOf(decodeShareCode(JSON.stringify(noM)))).toBe('missing-field')
    const { course: _course, ...noCourse } = CODE
    expect(await codeOf(decodeShareCode(JSON.stringify(noCourse)))).toBe('missing-field')
    const { videos: _videos, ...noVideos } = CODE
    expect(await codeOf(decodeShareCode(JSON.stringify(noVideos)))).toBe('missing-field')
    expect(await codeOf(decodeShareCode(JSON.stringify({ ...CODE, videos: {} })))).toBe('missing-field')
    expect(await codeOf(decodeShareCode(JSON.stringify({ ...CODE, l: 42 })))).toBe('missing-field')
    expect(await codeOf(decodeShareCode(JSON.stringify({ ...CODE, course: '  ' })))).toBe('missing-field')
  })

  it('rejects malformed video entries', async () => {
    const variants: unknown[] = [
      'not an object',
      { name: 'n', size: 1, cdn: 1, time: 1 }, // no id
      { id: 'v', size: 1, cdn: 1, time: 1 }, // no name
      { id: 'v', name: '', size: 1, cdn: 1, time: 1 }, // empty name
      { id: 'v', name: 'n', cdn: 1, time: 1 }, // no size
      { id: 'v', name: 'n', size: '1', cdn: 1, time: 1 }, // size is a string
      { id: 'v', name: 'n', size: -1, cdn: 1, time: 1 }, // negative size
      { id: 'v', name: 'n', size: 1, cdn: 1 }, // no time
      { id: 'v', name: 'n', size: 1, cdn: 1, time: Number.NaN },
      { id: 7, name: 'n', size: 1, cdn: 1, time: 1 },
    ]
    for (const video of variants) {
      const code = JSON.stringify({ ...CODE, videos: [CODE.videos[0], video] })
      expect(await codeOf(decodeShareCode(code))).toBe('invalid-video')
    }
  })

  it('names the offending video in the error message', async () => {
    const code = JSON.stringify({ ...CODE, videos: [CODE.videos[0], { id: 'v' }] })
    await expect(decodeShareCode(code)).rejects.toThrow(/video 1/)
  })
})
