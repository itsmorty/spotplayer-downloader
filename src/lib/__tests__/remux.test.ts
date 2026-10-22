import { describe, expect, it } from 'vitest'
import { buildMp4, buildMp4Parts, parseMp4s, parseMp4sChunks, RemuxError } from '../remux'
import type { RemuxErrorCode } from '../remux'
import { DEFAULT_AVCC, findBytes, makeMp4s, mp4sIndexOffset, splitAvcc } from './fixtures'

interface Box {
  type: string
  start: number
  size: number
  payload: number
  end: number
}

function view(u8: Uint8Array): DataView {
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
}

function boxes(u8: Uint8Array, start = 0, end = u8.length): Box[] {
  const dv = view(u8)
  const out: Box[] = []
  let offset = start
  while (offset < end) {
    if (offset + 8 > end) throw new Error(`truncated box header at ${offset}`)
    const size = dv.getUint32(offset)
    const type = String.fromCharCode(u8[offset + 4], u8[offset + 5], u8[offset + 6], u8[offset + 7])
    if (size < 8 || offset + size > end) throw new Error(`bad ${type} box at ${offset}`)
    out.push({ type, start: offset, size, payload: offset + 8, end: offset + size })
    offset += size
  }
  if (offset !== end) throw new Error('boxes do not tile the file')
  return out
}

function child(u8: Uint8Array, parent: Box, type: string): Box {
  const found = boxes(u8, parent.payload, parent.end).find((b) => b.type === type)
  if (!found) throw new Error(`missing ${type} in ${parent.type}`)
  return found
}

function traks(u8: Uint8Array, moov: Box): Box[] {
  return boxes(u8, moov.payload, moov.end).filter((b) => b.type === 'trak')
}

function handlerOf(u8: Uint8Array, trak: Box): string {
  const hdlr = child(u8, child(u8, trak, 'mdia'), 'hdlr')
  return String.fromCharCode(u8[hdlr.payload + 8], u8[hdlr.payload + 9], u8[hdlr.payload + 10], u8[hdlr.payload + 11])
}

function stblOf(u8: Uint8Array, trak: Box): Box {
  return child(u8, child(u8, child(u8, trak, 'mdia'), 'minf'), 'stbl')
}

function stszCount(u8: Uint8Array, stbl: Box): number {
  return view(u8).getUint32(child(u8, stbl, 'stsz').payload + 8)
}

function sttsTotal(u8: Uint8Array, stbl: Box): number {
  const stts = child(u8, stbl, 'stts')
  const dv = view(u8)
  const runs = dv.getUint32(stts.payload + 4)
  let total = 0
  for (let i = 0; i < runs; i++) {
    const count = dv.getUint32(stts.payload + 8 + i * 8)
    const delta = dv.getUint32(stts.payload + 12 + i * 8)
    total += count * delta
  }
  return total
}

function stcoOffset(u8: Uint8Array, stbl: Box): number {
  return view(u8).getUint32(child(u8, stbl, 'stco').payload + 8)
}

function errorCode(fn: () => unknown): RemuxErrorCode | 'no-error' {
  try {
    fn()
    return 'no-error'
  } catch (error) {
    if (error instanceof RemuxError) return error.code
    throw error
  }
}

describe('parseMp4s', () => {
  const container = makeMp4s()

  it('reads the header fields', () => {
    const parsed = parseMp4s(container)
    expect(parsed.videoFrameCount).toBe(5)
    expect(parsed.audioFrameCount).toBe(12)
    expect(parsed.durationSec).toBe(0) // 12288 samples / 48 kHz rounds to 0 s
    expect(parsed.width).toBe(832)
    expect(parsed.height).toBe(470)
    expect(parsed.sampleRate).toBe(48000)
    expect(parsed.channels).toBe(1)
    expect(parsed.avcC).toEqual(DEFAULT_AVCC)
    expect(parsed.asc).toEqual(Uint8Array.of(0x11, 0x88))
  })

  it('splits packets by type and strips the flags byte', () => {
    const parsed = parseMp4s(container)
    expect(parsed.video).toHaveLength(5)
    expect(parsed.audio).toHaveLength(12)
    expect(parsed.video[0].length).toBeGreaterThan(0)
    expect(parsed.audio[0]).toHaveLength(40)
    expect(parsed.audio[5].length).toBeGreaterThan(255)
  })

  it('keeps video samples as valid AVCC (4-byte NAL lengths)', () => {
    const parsed = parseMp4s(container)
    expect(splitAvcc(parsed.video[0])).toHaveLength(2) // keyframe: SPS-like + slice
    expect(splitAvcc(parsed.video[1])).toHaveLength(1)
    for (const sample of parsed.video) {
      const nals = splitAvcc(sample)
      const total = nals.reduce((n, nal) => n + 4 + nal.length, 0)
      expect(total).toBe(sample.length)
    }
  })

  it('accepts a non-zero flags byte', () => {
    const parsed = parseMp4s(makeMp4s({ flags: 0xff }))
    expect(parsed.video).toHaveLength(5)
    expect(parsed.audio).toHaveLength(12)
    // The flags byte is stripped, so the sample still starts with a NAL length.
    expect(splitAvcc(parsed.video[0])).toHaveLength(2)
  })

  it('accepts 2-byte sample rates and channels from the ASC', () => {
    const parsed = parseMp4s(makeMp4s({ sampleRate: 44100, channels: 2, width: 1280, height: 720 }))
    expect(parsed.sampleRate).toBe(44100)
    expect(parsed.channels).toBe(2)
    expect(parsed.width).toBe(1280)
    expect(parsed.height).toBe(720)
  })
})

describe('buildMp4', () => {
  const container = makeMp4s()
  const parsed = parseMp4s(container)
  const built = buildMp4(parsed)

  it('emits ftyp, mdat and moov in order', () => {
    const top = boxes(built.mp4)
    expect(top.map((b) => b.type)).toEqual(['ftyp', 'mdat', 'moov'])
    expect(findBytes(built.mp4, Uint8Array.of(0x66, 0x74, 0x79, 0x70))).toEqual([4])
  })

  it('places the samples at the reported offsets', () => {
    const top = boxes(built.mp4)
    const ftyp = top[0]
    const mdat = top[1]
    const videoBytes = parsed.video.reduce((n, s) => n + s.length, 0)
    expect(built.videoOff).toBe(ftyp.end + 8)
    expect(built.audioOff).toBe(built.videoOff + videoBytes)
    expect(mdat.size).toBe(8 + videoBytes + parsed.audio.reduce((n, s) => n + s.length, 0))

    const moov = top[2]
    const tracks = traks(built.mp4, moov)
    expect(tracks.map((t) => handlerOf(built.mp4, t))).toEqual(['vide', 'soun'])
    const videoStbl = stblOf(built.mp4, tracks[0])
    const audioStbl = stblOf(built.mp4, tracks[1])
    expect(stcoOffset(built.mp4, videoStbl)).toBe(built.videoOff)
    expect(stcoOffset(built.mp4, audioStbl)).toBe(built.audioOff)
  })

  it('writes the exact sample counts', () => {
    const top = boxes(built.mp4)
    const tracks = traks(built.mp4, top[2])
    expect(stszCount(built.mp4, stblOf(built.mp4, tracks[0]))).toBe(parsed.videoFrameCount)
    expect(stszCount(built.mp4, stblOf(built.mp4, tracks[1]))).toBe(parsed.audioFrameCount)
  })

  it('matches A/V duration exactly (sum of stts == audioFrameCount * 1024)', () => {
    const audioTotal = parsed.audioFrameCount * 1024
    const top = boxes(built.mp4)
    const tracks = traks(built.mp4, top[2])
    expect(sttsTotal(built.mp4, stblOf(built.mp4, tracks[0]))).toBe(audioTotal)
    expect(sttsTotal(built.mp4, stblOf(built.mp4, tracks[1]))).toBe(audioTotal)
  })

  it('produces a file whose boxes tile it exactly', () => {
    expect(() => boxes(built.mp4)).not.toThrow()
    const top = boxes(built.mp4)
    expect(top[top.length - 1].end).toBe(built.mp4.length)
  })

  it('copies the sample payloads verbatim', () => {
    const top = boxes(built.mp4)
    const video = built.mp4.subarray(built.videoOff, built.audioOff)
    expect(Array.from(video.subarray(0, parsed.video[0].length))).toEqual(Array.from(parsed.video[0]))
    const audioStart = built.audioOff
    expect(Array.from(built.mp4.subarray(audioStart, audioStart + parsed.audio[0].length))).toEqual(
      Array.from(parsed.audio[0]),
    )
    expect(top[1].payload).toBe(built.videoOff)
  })
})

describe('parseMp4s guards', () => {
  it('rejects a non-mp4s container', () => {
    const bad = makeMp4s()
    bad[0] = 0x00
    expect(errorCode(() => parseMp4s(bad))).toBe('not-mp4s')
  })

  it('rejects a truncated header', () => {
    expect(errorCode(() => parseMp4s(makeMp4s().subarray(0, 20)))).toBe('not-mp4s')
  })

  it('rejects an impossible avcC size', () => {
    const bad = makeMp4s()
    new DataView(bad.buffer).setUint32(31, 0x1000)
    expect(errorCode(() => parseMp4s(bad))).toBe('not-mp4s')
  })

  it('rejects an invalid sizeLen in the packet index', () => {
    const bad = makeMp4s()
    bad[mp4sIndexOffset()] = (5 << 4) | 2
    expect(errorCode(() => parseMp4s(bad))).toBe('bad-index')
  })

  it('rejects an unknown packet type', () => {
    const bad = makeMp4s()
    bad[mp4sIndexOffset()] = (1 << 4) | 3
    expect(errorCode(() => parseMp4s(bad))).toBe('bad-index')
  })

  it('rejects a packet without a flags byte', () => {
    const bad = makeMp4s()
    const indexOffset = mp4sIndexOffset()
    expect(bad[indexOffset] >> 4).toBe(1) // first packet size fits one byte
    bad[indexOffset + 1] = 0
    expect(errorCode(() => parseMp4s(bad))).toBe('bad-framing')
  })

  it('rejects a data region that does not tile the file', () => {
    const full = makeMp4s()
    const truncated = full.subarray(0, full.length - 3)
    expect(errorCode(() => parseMp4s(truncated))).toBe('bad-framing')
  })

  it('rejects counts that disagree with the index', () => {
    const bad = makeMp4s()
    new DataView(bad.buffer).setUint32(10, 13) // header says 13 audio frames, index has 12
    expect(errorCode(() => parseMp4s(bad))).toBe('count-mismatch')
  })
})

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

/** Splits `u8` after every offset (out-of-range/duplicate offsets are skipped). */
function splitAt(u8: Uint8Array, offsets: readonly number[]): Uint8Array[] {
  const chunks: Uint8Array[] = []
  let start = 0
  for (const end of offsets) {
    if (end <= start || end >= u8.length) continue
    chunks.push(u8.subarray(start, end))
    start = end
  }
  chunks.push(u8.subarray(start))
  return chunks
}

describe('parseMp4sChunks', () => {
  const container = makeMp4s()
  const reference = parseMp4s(container)
  const dataSize = [...reference.video, ...reference.audio].reduce((n, s) => n + s.length + 1, 0)
  const dataOff = container.length - dataSize

  const splits: Array<[string, Uint8Array[]]> = [
    ['after 1, 3, 17 and 34 bytes', splitAt(container, [1, 3, 17, 34])],
    ['mid-index', splitAt(container, [mp4sIndexOffset() + 3])],
    ['mid-sample', splitAt(container, [container.length - 10])],
    [
      'every 7 bytes',
      splitAt(container, Array.from({ length: Math.floor(container.length / 7) }, (_, i) => (i + 1) * 7)),
    ],
  ]

  for (const [label, chunks] of splits) {
    it(`matches parseMp4s when split ${label}`, () => {
      expect(chunks.length).toBeGreaterThan(1)
      expect(parseMp4sChunks(chunks)).toEqual(reference)
    })
  }

  it('ignores empty chunks and accepts an explicit total length', () => {
    const chunks = splitAt(container, [1, 3, 17, 34, mp4sIndexOffset() + 3])
    chunks.push(new Uint8Array(0))
    chunks.unshift(new Uint8Array(0))
    expect(parseMp4sChunks(chunks)).toEqual(reference)
    expect(parseMp4sChunks(chunks, container.length)).toEqual(reference)
  })

  it('rejects a total length that disagrees with the chunks', () => {
    expect(errorCode(() => parseMp4sChunks([container], container.length + 1))).toBe('bad-framing')
    expect(errorCode(() => parseMp4sChunks([container], container.length - 1))).toBe('bad-framing')
  })

  it('keeps samples inside one chunk as zero-copy views', () => {
    const cut = dataOff + 1 + reference.video[0].length + 1
    const chunks = [container.slice(0, cut), container.slice(cut)]
    const parsed = parseMp4sChunks(chunks)

    expect(parsed).toEqual(reference)
    expect(parsed.video[0].buffer).toBe(chunks[0].buffer)
    expect(parsed.video[1].buffer).toBe(chunks[1].buffer)
    expect(parsed.audio[0].buffer).toBe(chunks[1].buffer)
  })

  it('copies only samples that straddle a chunk boundary', () => {
    // 5 bytes into audio packet 0, so that one sample spans the cut.
    const cut = dataOff + 1 + reference.video[0].length + 1 + 5
    const chunks = [container.slice(0, cut), container.slice(cut)]
    const parsed = parseMp4sChunks(chunks)

    expect(parsed).toEqual(reference)
    expect(parsed.audio[0].buffer).not.toBe(chunks[0].buffer)
    expect(parsed.audio[0].buffer).not.toBe(chunks[1].buffer)
    expect(parsed.video[1].buffer).toBe(chunks[1].buffer)
  })

  it('keeps the same error codes as parseMp4s', () => {
    const truncated = container.subarray(0, container.length - 3)
    expect(errorCode(() => parseMp4sChunks(splitAt(truncated, [17])))).toBe('bad-framing')

    const badIndex = makeMp4s()
    badIndex[mp4sIndexOffset()] = (5 << 4) | 2
    expect(errorCode(() => parseMp4sChunks(splitAt(badIndex, [17])))).toBe('bad-index')

    const badCount = makeMp4s()
    new DataView(badCount.buffer).setUint32(10, 13)
    expect(errorCode(() => parseMp4sChunks(splitAt(badCount, [17])))).toBe('count-mismatch')

    const badMagic = makeMp4s()
    badMagic[0] = 0x00
    expect(errorCode(() => parseMp4sChunks(splitAt(badMagic, [17])))).toBe('not-mp4s')
  })
})

describe('buildMp4Parts', () => {
  const parsed = parseMp4s(makeMp4s())
  const parts = buildMp4Parts(parsed)
  const built = buildMp4(parsed)
  const videoBytes = parsed.video.reduce((n, s) => n + s.length, 0)
  const audioBytes = parsed.audio.reduce((n, s) => n + s.length, 0)

  it('concatenates byte-for-byte to buildMp4', () => {
    expect(parts.size).toBe(built.mp4.length)
    expect(concat(parts.parts)).toEqual(built.mp4)
  })

  it('emits the validated ftyp and an 8-byte mdat header', () => {
    const ftyp = parts.parts[0]
    expect(String.fromCharCode(...ftyp.subarray(4, 8))).toBe('ftyp')
    expect(ftyp).toEqual(built.mp4.subarray(0, ftyp.length))

    const header = parts.parts[1]
    expect(header).toHaveLength(8)
    expect(String.fromCharCode(...header.subarray(4, 8))).toBe('mdat')
    expect(view(header).getUint32(0)).toBe(8 + videoBytes + audioBytes)
  })

  it('orders video samples before audio samples without copying them', () => {
    const videoParts = parts.parts.slice(2, 2 + parsed.video.length)
    const audioParts = parts.parts.slice(2 + parsed.video.length, parts.parts.length - 1)

    expect(videoParts).toEqual(parsed.video)
    expect(audioParts).toEqual(parsed.audio)
    for (let i = 0; i < parsed.video.length; i++) expect(videoParts[i]).toBe(parsed.video[i])
    for (let i = 0; i < parsed.audio.length; i++) expect(audioParts[i]).toBe(parsed.audio[i])

    expect(parts.parts).toHaveLength(2 + parsed.video.length + parsed.audio.length + 1)
    const moov = parts.parts[parts.parts.length - 1]
    expect(String.fromCharCode(...moov.subarray(4, 8))).toBe('moov')
    expect(concat([moov])).toEqual(built.mp4.subarray(built.mp4.length - moov.length))
  })

  it('reports the offsets and size of the concatenated file', () => {
    expect(parts.videoOff).toBe(built.videoOff)
    expect(parts.audioOff).toBe(built.audioOff)
    expect(parts.videoOff).toBe(parts.parts[0].length + 8)
    expect(parts.audioOff).toBe(parts.videoOff + videoBytes)
    expect(parts.size).toBe(parts.parts.reduce((n, p) => n + p.length, 0))
    expect(parts.size).toBe(parts.parts[0].length + 8 + videoBytes + audioBytes + parts.parts[parts.parts.length - 1].length)
  })

  it('rejects an mdat larger than a 32-bit box', () => {
    const huge = {
      ...parsed,
      video: [{ length: 0x1_0000_0000 } as unknown as Uint8Array],
      audio: [],
      videoFrameCount: 1,
      audioFrameCount: 0,
    }
    expect(errorCode(() => buildMp4Parts(huge))).toBe('too-large')
  })
})
