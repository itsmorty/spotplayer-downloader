import { describe, expect, it } from 'vitest'
import {
  cdnHosts,
  decryptSegment,
  decryptSegmentInPlace,
  FILE_HEADER_SIZE,
  KEY_LENGTH,
  segmentUrl,
  SEGMENT_SIZE,
} from '../spot'

const KEY = Uint8Array.from({ length: KEY_LENGTH }, (_, i) => (i * 2 + 7) & 0xff)

function head(text: string): Uint8Array {
  const out = new Uint8Array(FILE_HEADER_SIZE)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  for (let i = text.length; i < FILE_HEADER_SIZE; i++) out[i] = (i * 11) & 0xff
  return out
}

function payload(length: number, seed = 0): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (i * 29 + seed) & 0xff
  return out
}

function join(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** XOR is symmetric: the same routine encrypts and decrypts. */
const crypt = decryptSegment

describe('cdnHosts', () => {
  it('falls back to host 0 when the mask is empty', () => {
    expect(cdnHosts(0)).toEqual(['dl0.sp.spotcdn.ir', 'dl1.sp.spotcdn.ir'])
  })

  it('rotates through both hosts of a single-bit mask', () => {
    expect(cdnHosts(1)).toEqual(['dl0.sp.spotcdn.ir', 'dl1.sp.spotcdn.ir'])
  })

  it('uses the set bits and the odd/even host of each bit', () => {
    expect(cdnHosts(0b101)).toEqual([
      'dl0.sp.spotcdn.ir',
      'dl4.sp.spotcdn.ir',
      'dl1.sp.spotcdn.ir',
      'dl5.sp.spotcdn.ir',
    ])
    expect(cdnHosts(0b111)).toEqual([
      'dl0.sp.spotcdn.ir',
      'dl2.sp.spotcdn.ir',
      'dl4.sp.spotcdn.ir',
      'dl1.sp.spotcdn.ir',
      'dl3.sp.spotcdn.ir',
      'dl5.sp.spotcdn.ir',
    ])
  })

  it('supports high bits', () => {
    expect(cdnHosts(1 << 10)).toEqual(['dl20.sp.spotcdn.ir', 'dl21.sp.spotcdn.ir'])
  })
})

describe('segmentUrl', () => {
  const base = {
    host: 'dl0.sp.spotcdn.ir',
    l: 'aa11',
    m: 'bb22',
    course: 'cc33',
    videoId: 'vid44',
  }

  it('builds the exact CDN URL for segment 0', () => {
    expect(segmentUrl({ ...base, segIndex: 0 })).toBe(
      'https://dl0.sp.spotcdn.ir/aa11/bb22/cc33/vid44.spot?v=25&f=3&s=0&bytes=0-2097151',
    )
  })

  it('maps segment 2 to the right byte range', () => {
    const url = segmentUrl({ ...base, segIndex: 2 })
    expect(url).toContain('s=2&bytes=4194304-6291455')
    expect(url).toBe(
      'https://dl0.sp.spotcdn.ir/aa11/bb22/cc33/vid44.spot?v=25&f=3&s=2&bytes=4194304-6291455',
    )
  })

  it('rejects a non-integer or negative segment index', () => {
    expect(() => segmentUrl({ ...base, segIndex: -1 })).toThrow(RangeError)
    expect(() => segmentUrl({ ...base, segIndex: 1.5 })).toThrow(RangeError)
  })
})

describe('decryptSegment', () => {
  it('keeps the 184-byte header when the segment starts at file offset 0', () => {
    const seg = join(head('secret-key-here'), payload(300))
    const out = decryptSegment(seg, KEY, 0)
    expect(out).toHaveLength(seg.length)
    expect(Array.from(out.subarray(0, FILE_HEADER_SIZE))).toEqual(Array.from(seg.subarray(0, FILE_HEADER_SIZE)))
    // The first payload byte is XORed with key[0] and 0.
    expect(out[FILE_HEADER_SIZE]).toBe(seg[FILE_HEADER_SIZE] ^ KEY[0])
  })

  it('round-trips an encrypted first segment', () => {
    const plain = join(head('SPOTPLAYER'), payload(2048, 3))
    const encrypted = crypt(plain, KEY, 0)
    expect(Array.from(encrypted.subarray(FILE_HEADER_SIZE))).not.toEqual(
      Array.from(plain.subarray(FILE_HEADER_SIZE)),
    )
    expect(decryptSegment(encrypted, KEY, 0)).toEqual(plain)
  })

  it('round-trips a later segment (multi-block XOR positions)', () => {
    const data = payload(4096, 9)
    const encrypted = crypt(data, KEY, SEGMENT_SIZE)
    expect(decryptSegment(encrypted, KEY, SEGMENT_SIZE)).toEqual(data)
  })

  it('uses the absolute file offset inside the key cycle', () => {
    const seg = payload(600)
    const fileOffset = SEGMENT_SIZE - 100 // still starts inside the payload region
    const decrypted = decryptSegment(seg, KEY, fileOffset)
    for (const i of [0, 1, 99, 100, 251, 252, 500, 599]) {
      const pos = fileOffset + i - FILE_HEADER_SIZE
      expect(decrypted[i]).toBe(seg[i] ^ KEY[pos % KEY_LENGTH] ^ (pos % 251))
    }
  })

  it('passes header bytes through on a segment that overlaps the header', () => {
    const seg = join(head('overlap'), payload(100))
    const out = decryptSegment(seg, KEY, 100) // only bytes 0..83 are header
    const headerEnd = FILE_HEADER_SIZE - 100
    expect(Array.from(out.subarray(0, headerEnd))).toEqual(Array.from(seg.subarray(0, headerEnd)))
    for (let i = headerEnd; i < seg.length; i++) {
      const pos = 100 + i - FILE_HEADER_SIZE
      expect(out[i]).toBe(seg[i] ^ KEY[pos % KEY_LENGTH] ^ (pos % 251))
    }
  })

  it('rejects a key that is not 127 bytes', () => {
    expect(() => decryptSegment(payload(10), new Uint8Array(126), 0)).toThrow(RangeError)
    expect(() => decryptSegment(payload(10), new Uint8Array(128), 0)).toThrow(RangeError)
  })
})

describe('decryptSegmentInPlace', () => {
  it('matches decryptSegment while mutating the input', () => {
    const plain = join(head('SPOTPLAYER'), payload(2048, 3))
    const encrypted = crypt(plain, KEY, 0)
    const expected = decryptSegment(encrypted, KEY, 0)

    const target = encrypted.slice()
    const returned = decryptSegmentInPlace(target, KEY, 0)

    expect(returned).toBe(target)
    expect(returned).toEqual(expected)
    expect(target).toEqual(plain)
  })

  it('round-trips a later segment and keeps header bytes clear', () => {
    const data = payload(4096, 9)
    const encrypted = crypt(data, KEY, SEGMENT_SIZE)
    expect(decryptSegmentInPlace(encrypted, KEY, SEGMENT_SIZE)).toEqual(data)
    expect(encrypted).toEqual(data) // same buffer, mutated

    const overlap = join(head('overlap'), payload(100))
    const encryptedOverlap = crypt(overlap, KEY, 100)
    const out = decryptSegmentInPlace(encryptedOverlap, KEY, 100)
    expect(out).toEqual(overlap)
    const headerEnd = FILE_HEADER_SIZE - 100
    expect(Array.from(out.subarray(0, headerEnd))).toEqual(
      Array.from(overlap.subarray(0, headerEnd)),
    )
  })

  it('rejects a bad key or offset without touching the segment', () => {
    const seg = payload(10)
    const before = seg.slice()
    expect(() => decryptSegmentInPlace(seg, new Uint8Array(126), 0)).toThrow(RangeError)
    expect(() => decryptSegmentInPlace(seg, KEY, -1)).toThrow(RangeError)
    expect(() => decryptSegmentInPlace(seg, KEY, 1.5)).toThrow(RangeError)
    expect(seg).toEqual(before)
  })
})
