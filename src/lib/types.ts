/** A single video entry of a SpotPlayer share code. */
export interface Video {
  id: string
  name: string
  /** Encrypted file size in bytes; the downloadable file adds the 184-byte header. */
  size: number
  /** CDN host bitmask (`cdnHosts`). */
  cdn: number
  /** Duration in seconds, converted from the share code's milliseconds. */
  time: number
}

/** The decoded content of a share code (`SP1:` or raw JSON). */
export interface ShareCode {
  l: string
  m: string
  course: string
  name: string
  videos: Video[]
}

/** The decrypted `mp4s` container, split into remuxable samples. */
export interface ParsedMp4s {
  durationSec: number
  audioFrameCount: number
  videoFrameCount: number
  /** AVCDecoderConfigurationRecord. */
  avcC: Uint8Array
  /** AAC AudioSpecificConfig (2 bytes). */
  asc: Uint8Array
  sampleRate: number
  channels: number
  width: number
  height: number
  /** AVCC samples (4-byte big-endian NAL lengths), without the flags byte. */
  video: Uint8Array[]
  /** Raw AAC frames, without the flags byte. */
  audio: Uint8Array[]
}
