/**
 * SpotPlayer CDN + segment helpers.
 *
 * A video is stored as one logical file: a 184-byte header (the XOR key lives at
 * bytes 25..152) followed by the `mp4s` payload. The CDN serves it in
 * `SEGMENT_SIZE` slices via `?s=<index>&bytes=<start>-<end>`; each slice is XORed
 * with the 127-byte key cyclically, plus the running byte position modulo 251.
 */

export const SEGMENT_SIZE = 2_097_152
export const FILE_HEADER_SIZE = 184
export const KEY_OFFSET = 25
export const KEY_LENGTH = 127

/**
 * Expands a video's `cdn` bitmask into the ordered hosts to try:
 * for every set bit the even host, then the odd host (`dl<2b>.sp.spotcdn.ir`,
 * `dl<2b+1>.sp.spotcdn.ir`). An empty mask behaves like bit 0.
 */
export function cdnHosts(mask: number): string[] {
  const bits: number[] = []
  for (let i = 0; i < 31; i++) {
    if (mask & (1 << i)) bits.push(i)
  }
  if (bits.length === 0) bits.push(0)

  const hosts: string[] = []
  for (let turn = 0; turn < bits.length * 2; turn++) {
    const bit = bits[turn % bits.length]
    hosts.push(`dl${bit * 2 + (Math.floor(turn / bits.length) % 2)}.sp.spotcdn.ir`)
  }
  return hosts
}

export interface SegmentUrlOptions {
  /** One of {@link cdnHosts}. */
  host: string
  l: string
  m: string
  course: string
  videoId: string
  /** Zero-based segment index. */
  segIndex: number
}

/** The CDN URL for one 2 MiB range of a `.spot` file. */
export function segmentUrl(opts: SegmentUrlOptions): string {
  if (!Number.isInteger(opts.segIndex) || opts.segIndex < 0) {
    throw new RangeError(`invalid segment index: ${opts.segIndex}`)
  }
  const start = opts.segIndex * SEGMENT_SIZE
  const end = start + SEGMENT_SIZE - 1
  return `https://${opts.host}/${opts.l}/${opts.m}/${opts.course}/${opts.videoId}.spot?v=25&f=3&s=${opts.segIndex}&bytes=${start}-${end}`
}

/**
 * Decrypts one downloaded segment in place-of-copy.
 *
 * `fileOffset` is the segment's absolute position in the `.spot` file; the first
 * {@link FILE_HEADER_SIZE} bytes of the file are not encrypted, and the XOR
 * position is relative to the end of that header. XOR is symmetric, so passing an
 * encrypted segment returns the plaintext and vice versa.
 */
export function decryptSegment(seg: Uint8Array, key127: Uint8Array, fileOffset: number): Uint8Array {
  if (key127.length !== KEY_LENGTH) {
    throw new RangeError(`XOR key must be ${KEY_LENGTH} bytes, got ${key127.length}`)
  }
  if (!Number.isInteger(fileOffset) || fileOffset < 0) {
    throw new RangeError(`invalid file offset: ${fileOffset}`)
  }

  const out = new Uint8Array(seg.length)
  const payloadStart = Math.max(0, FILE_HEADER_SIZE - fileOffset)
  out.set(seg.subarray(0, payloadStart), 0)
  for (let i = payloadStart; i < seg.length; i++) {
    const pos = fileOffset + i - FILE_HEADER_SIZE
    out[i] = seg[i] ^ key127[pos % KEY_LENGTH] ^ (pos % 251)
  }
  return out
}
