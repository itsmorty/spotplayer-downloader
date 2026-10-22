/**
 * Pure-JS remux of the SpotPlayer `mp4s` container into a standard MP4.
 *
 * Port of `spikes/001-remux-mp4s/remux.js` (validated against ffmpeg and a real
 * browser `<video>`): no ffmpeg, no WASM. The container's compressed H.264 (AVCC)
 * and raw-AAC samples are copied verbatim into `mdat`; a minimal `moov` is written
 * after it. Video frame durations are distributed so the video track's duration
 * equals the audio track's duration exactly (`audioFrameCount * 1024` samples).
 *
 * Container layout (see the spike README):
 *
 *   header:  "mp4s"(4) | u16 durationSec@8 | u32 audioFrames@10 | asc(2)@18 |
 *            u16 sampleRate@25 | u32 videoFrames@27 | u32 avcCSize@31 | avcC@35 |
 *            u16 width | u16 height
 *   index:   repeated [ u8: (sizeLen << 4) | type ][ sizeLen-byte big-endian size ]
 *            type 0 = audio, type 1/2 = video.  (sizeLen 1..4)
 *   data:    packet payloads in index order; each starts with a 1-byte flags field
 *            (observed 0x00, but not required) followed by the sample.
 */

import type { ParsedMp4s } from './types'

export type RemuxErrorCode = 'not-mp4s' | 'bad-index' | 'bad-framing' | 'count-mismatch'

/** Raised when a decrypted payload is not a well-formed `mp4s` container. */
export class RemuxError extends Error {
  readonly code: RemuxErrorCode

  constructor(code: RemuxErrorCode, message: string) {
    super(message)
    this.name = 'RemuxError'
    this.code = code
  }
}

export interface BuiltMp4 {
  mp4: Uint8Array
  /** Byte offset of the first video sample inside `mp4` (the mdat payload). */
  videoOff: number
  /** Byte offset of the first audio sample inside `mp4`. */
  audioOff: number
}

const MAGIC = 'mp4s'
const HEADER_MIN = 39 // 35-byte prologue + at least 1 avcC byte + width/height

const u16 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value)
  return bytes
}

const u32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value)
  return bytes
}

const ascii = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
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

const box = (type: string, payload: Uint8Array): Uint8Array =>
  concat([u32(8 + payload.length), ascii(type), payload])

const full = (type: string, version: number, flags: number, payload: Uint8Array): Uint8Array =>
  box(type, concat([new Uint8Array([version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]), payload]))

interface IndexEntry {
  type: number
  size: number
}

/**
 * Parses a decrypted `mp4s` container into header metadata and per-track samples
 * (the flags byte is stripped). Throws a {@link RemuxError} on malformed input.
 */
export function parseMp4s(u8: Uint8Array): ParsedMp4s {
  if (u8.length < HEADER_MIN) {
    throw new RemuxError('not-mp4s', `container is ${u8.length} bytes; need at least ${HEADER_MIN}`)
  }
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== MAGIC) {
    throw new RemuxError('not-mp4s', 'missing "mp4s" magic at offset 0')
  }

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const durationSec = dv.getUint16(8)
  const audioFrameCount = dv.getUint32(10)
  const ascVal = dv.getUint16(18)
  const asc = u8.slice(18, 20)
  const sampleRate = dv.getUint16(25)
  const videoFrameCount = dv.getUint32(27)
  const avcCSize = dv.getUint32(31)

  const whOff = 35 + avcCSize
  if (avcCSize < 1 || whOff + 4 > u8.length) {
    throw new RemuxError('not-mp4s', `avcC size ${avcCSize} does not fit in ${u8.length} bytes`)
  }
  const avcC = u8.slice(35, whOff)
  const width = dv.getUint16(whOff)
  const height = dv.getUint16(whOff + 2)
  if (width === 0 || height === 0 || sampleRate === 0) {
    throw new RemuxError(
      'not-mp4s',
      `implausible header: ${width}x${height} @ ${sampleRate} Hz`,
    )
  }

  // AAC channelConfiguration lives in bits 3..6 of the AudioSpecificConfig.
  const channels = ((ascVal >> 3) & 0x0f) || 2

  const expectedPackets = audioFrameCount + videoFrameCount
  const index: IndexEntry[] = []
  let offset = whOff + 4
  let dataSize = 0

  while (offset < u8.length) {
    const remaining = u8.length - offset
    if (remaining === dataSize) break // the index ends where the data region starts
    if (remaining < dataSize) {
      throw new RemuxError('bad-framing', `packet index overruns the file at offset ${offset}`)
    }
    if (index.length >= expectedPackets) {
      throw new RemuxError(
        'count-mismatch',
        `index has more than ${expectedPackets} packets (header counts audio=${audioFrameCount}, video=${videoFrameCount})`,
      )
    }

    const entry = u8[offset]
    const sizeLen = entry >> 4
    const type = entry & 0x0f
    if (sizeLen < 1 || sizeLen > 4) {
      throw new RemuxError('bad-index', `invalid sizeLen ${sizeLen} at offset ${offset}`)
    }
    if (type > 2) {
      throw new RemuxError('bad-index', `unknown packet type ${type} at offset ${offset}`)
    }
    if (offset + 1 + sizeLen > u8.length) {
      throw new RemuxError('bad-index', `truncated index entry at offset ${offset}`)
    }

    let size = 0
    for (let k = 0; k < sizeLen; k++) size = size * 256 + u8[offset + 1 + k]
    if (size < 1) {
      throw new RemuxError('bad-framing', `packet ${index.length} has no flags byte (size 0)`)
    }

    index.push({ type, size })
    dataSize += size
    offset += 1 + sizeLen
  }

  const dataOff = offset
  if (u8.length - dataOff !== dataSize) {
    throw new RemuxError(
      'bad-framing',
      `packet index tiles ${dataSize} bytes but the data region is ${u8.length - dataOff}`,
    )
  }

  let audioCount = 0
  let videoCount = 0
  for (const entry of index) {
    if (entry.type === 0) audioCount++
    else videoCount++
  }
  if (audioCount !== audioFrameCount || videoCount !== videoFrameCount) {
    throw new RemuxError(
      'count-mismatch',
      `header says audio=${audioFrameCount}, video=${videoFrameCount}; index has audio=${audioCount}, video=${videoCount}`,
    )
  }

  const video: Uint8Array[] = []
  const audio: Uint8Array[] = []
  let pos = dataOff
  for (const entry of index) {
    if (pos + entry.size > u8.length) {
      throw new RemuxError('bad-framing', `packet ${video.length + audio.length} is truncated`)
    }
    // Strip the 1-byte flags field.
    const sample = u8.subarray(pos + 1, pos + entry.size)
    if (entry.type === 0) audio.push(sample)
    else video.push(sample)
    pos += entry.size
  }
  if (pos !== u8.length) {
    throw new RemuxError('bad-framing', `packets end at ${pos}, file ends at ${u8.length}`)
  }

  return {
    durationSec,
    audioFrameCount,
    videoFrameCount,
    avcC,
    asc,
    sampleRate,
    channels,
    width,
    height,
    video,
    audio,
  }
}

/**
 * Writes a standard MP4 (`ftyp` + `mdat` + `moov`) from the parsed container.
 * The layout and timing scheme are byte-for-byte the validated spike output.
 */
export function buildMp4(parsed: ParsedMp4s): BuiltMp4 {
  const timescale = parsed.sampleRate
  const audioTotal = parsed.audioFrameCount * 1024
  const videoFrameCount = parsed.videoFrameCount

  // Exact per-frame durations so the video total equals the audio total.
  const videoDurations = new Uint32Array(videoFrameCount)
  let previous = 0
  for (let i = 1; i <= videoFrameCount; i++) {
    const current = Math.round((i * audioTotal) / videoFrameCount)
    videoDurations[i - 1] = current - previous
    previous = current
  }

  const videoData = concat(parsed.video)
  const audioData = concat(parsed.audio)
  const ftyp = box('ftyp', concat([ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41')]))
  const mdat = box('mdat', concat([videoData, audioData]))
  const videoOff = ftyp.length + 8
  const audioOff = videoOff + videoData.length

  const moov = buildMoov(parsed, videoDurations, videoOff, audioOff, timescale, audioTotal)
  const mp4 = concat([ftyp, mdat, moov])
  return { mp4, videoOff, audioOff }
}

function buildMoov(
  parsed: ParsedMp4s,
  videoDurations: Uint32Array,
  videoOff: number,
  audioOff: number,
  timescale: number,
  audioTotal: number,
): Uint8Array {
  const mkStsz = (samples: readonly Uint8Array[]): Uint8Array => {
    const parts: Uint8Array[] = [u32(0), u32(samples.length)]
    for (const sample of samples) parts.push(u32(sample.length))
    return full('stsz', 0, 0, concat(parts))
  }

  const mkStts = (durations: ArrayLike<number>): Uint8Array => {
    const runs: [number, number][] = []
    for (let i = 0; i < durations.length; i++) {
      const last = runs[runs.length - 1]
      if (last && last[1] === durations[i]) last[0]++
      else runs.push([1, durations[i]])
    }
    const parts: Uint8Array[] = [u32(runs.length)]
    for (const [count, duration] of runs) parts.push(u32(count), u32(duration))
    return full('stts', 0, 0, concat(parts))
  }

  const mkStsc = (sampleCount: number): Uint8Array =>
    full('stsc', 0, 0, concat([u32(1), u32(1), u32(sampleCount), u32(1)]))

  const mkStco = (offset: number): Uint8Array =>
    full('stco', 0, 0, concat([u32(1), u32(offset)]))

  const stbl = (stsd: Uint8Array, stts: Uint8Array, stsc: Uint8Array, stsz: Uint8Array, stco: Uint8Array): Uint8Array =>
    box('stbl', concat([stsd, stts, stsc, stsz, stco]))

  const dref = full('dref', 0, 0, concat([u32(1), full('url ', 0, 1, new Uint8Array(0))]))

  // Video track.
  const avc1 = concat([
    new Uint8Array(6), u16(1), new Uint8Array(16), u16(parsed.width), u16(parsed.height),
    u32(0x480000), u32(0x480000), u32(0), u16(1), new Uint8Array(32), u16(0x18), u16(0xffff),
    box('avcC', parsed.avcC),
  ])
  const videoStbl = stbl(
    full('stsd', 0, 0, concat([u32(1), box('avc1', avc1)])),
    mkStts(videoDurations),
    mkStsc(parsed.video.length),
    mkStsz(parsed.video),
    mkStco(videoOff),
  )
  const videoMinf = box(
    'minf',
    concat([full('vmhd', 0, 1, concat([u16(0), u16(0), u16(0), u16(0)])), box('dinf', dref), videoStbl]),
  )
  const videoMdia = box(
    'mdia',
    concat([
      full('mdhd', 0, 0, concat([u32(0), u32(0), u32(timescale), u32(audioTotal), u16(0x55c4), u16(0)])),
      full('hdlr', 0, 0, concat([u32(0), ascii('vide'), new Uint8Array(12), ascii('VideoHandler\0')])),
      videoMinf,
    ]),
  )
  const videoTkhd = full(
    'tkhd',
    0,
    3,
    concat([
      new Uint8Array(8), u16(0), u16(0), u32(0), u32(Math.round((audioTotal / timescale) * 1000)),
      new Uint8Array(8), u16(0), u16(0), u16(0), u16(0),
      u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000),
      u32(parsed.width << 16), u32(parsed.height << 16),
    ]),
  )
  const videoTrak = box('trak', concat([videoTkhd, videoMdia]))

  // Audio track.
  const esds = full(
    'esds',
    0,
    0,
    concat([
      new Uint8Array([
        0x03, 0x19, 0x00, 0x01, 0x00, 0x04, 0x11, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 0x02,
      ]),
      parsed.asc,
      new Uint8Array([0x06, 0x01, 0x02]),
    ]),
  )
  const mp4a = concat([
    new Uint8Array(6), u16(1), new Uint8Array(8), u16(parsed.channels), u16(16), u16(0), u16(0),
    u32(parsed.sampleRate << 16), esds,
  ])
  const audioDurations = new Uint32Array(parsed.audio.length)
  audioDurations.fill(1024)
  const audioStbl = stbl(
    full('stsd', 0, 0, concat([u32(1), box('mp4a', mp4a)])),
    mkStts(audioDurations),
    mkStsc(parsed.audio.length),
    mkStsz(parsed.audio),
    mkStco(audioOff),
  )
  const audioMinf = box(
    'minf',
    concat([full('smhd', 0, 0, concat([u16(0), u16(0)])), box('dinf', dref), audioStbl]),
  )
  const audioMdia = box(
    'mdia',
    concat([
      full('mdhd', 0, 0, concat([u32(0), u32(0), u32(timescale), u32(audioTotal), u16(0x55c4), u16(0)])),
      full('hdlr', 0, 0, concat([u32(0), ascii('soun'), new Uint8Array(12), ascii('SoundHandler\0')])),
      audioMinf,
    ]),
  )
  const audioTkhd = full(
    'tkhd',
    0,
    2,
    concat([
      new Uint8Array(8), u16(0), u16(0x0001), u32(0), u32(Math.round((audioTotal / timescale) * 1000)),
      new Uint8Array(8), u16(0), u16(0), u16(0x0100), u16(0),
      u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000),
      u32(0), u32(0),
    ]),
  )
  const audioTrak = box('trak', concat([audioTkhd, audioMdia]))

  const mvhd = full(
    'mvhd',
    0,
    0,
    concat([
      u32(0), u32(0), u32(1000), u32(Math.round((audioTotal / timescale) * 1000)), u32(0x00010000),
      u16(0x0100), u16(0), new Uint8Array(8),
      u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000),
      u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(2),
    ]),
  )
  return box('moov', concat([mvhd, videoTrak, audioTrak]))
}
