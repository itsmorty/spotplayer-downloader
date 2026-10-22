/**
 * Maps engine failures to Persian, user-facing messages.
 *
 * `ExtractError.code` is the stable contract; `remuxCode` narrows container
 * failures so «ساختار فایل» and «چیدمان بخش‌ها» stay distinguishable. This module
 * is UI-adjacent but pure, so the mapping is easy to unit test.
 */

import { fa } from '../i18n/fa'
import { ExtractError } from '../lib/extract'

/** True for an `AbortError` or the engine's `aborted` code. */
export function isAbortFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { name?: unknown; code?: unknown }
  return candidate.name === 'AbortError' || candidate.code === 'aborted'
}

/** A Persian message for any extraction failure (unknown errors included). */
export function extractErrorMessage(error: unknown): string {
  if (!(error instanceof ExtractError)) return fa.errors.unknown

  switch (error.code) {
    case 'http':
      return error.status === undefined ? fa.errors.unknown : fa.errors.http(error.status)
    case 'network':
      return fa.errors.network
    case 'aborted':
      return fa.errors.aborted
    case 'size-mismatch':
      return fa.errors.sizeMismatch
    case 'empty':
      return fa.errors.emptyVideo
    case 'invalid':
      return fa.errors.invalidVideo
    case 'remux':
      switch (error.remuxCode) {
        case 'not-mp4s':
          return fa.errors.unsupportedContainer
        case 'bad-framing':
        case 'bad-index':
        case 'count-mismatch':
          return fa.errors.unsupportedFraming
        default:
          return fa.errors.remux
      }
  }
}
