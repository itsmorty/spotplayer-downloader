import { describe, expect, it } from 'vitest'
import { extractErrorMessage, isAbortFailure } from '../extract-errors'
import { fa } from '../../i18n/fa'
import { ExtractError } from '../../lib/extract'

function error(
  code: ConstructorParameters<typeof ExtractError>[0],
  details: ConstructorParameters<typeof ExtractError>[2] = {},
): ExtractError {
  return new ExtractError(code, 'engine detail', details)
}

describe('extractErrorMessage', () => {
  it('maps HTTP statuses and network failures', () => {
    expect(extractErrorMessage(error('http', { status: 403 }))).toBe(fa.errors.http(403))
    expect(extractErrorMessage(error('network'))).toBe(fa.errors.network)
    expect(extractErrorMessage(error('http'))).toBe(fa.errors.unknown)
  })

  it('maps abort, size and empty failures', () => {
    expect(extractErrorMessage(error('aborted'))).toBe(fa.errors.aborted)
    expect(extractErrorMessage(error('size-mismatch'))).toBe(fa.errors.sizeMismatch)
    expect(extractErrorMessage(error('empty'))).toBe(fa.errors.emptyVideo)
    expect(extractErrorMessage(error('invalid'))).toBe(fa.errors.invalidVideo)
  })

  it('distinguishes a bad container from bad framing', () => {
    expect(extractErrorMessage(error('remux', { remuxCode: 'not-mp4s' }))).toBe(
      fa.errors.unsupportedContainer,
    )
    expect(extractErrorMessage(error('remux', { remuxCode: 'bad-framing' }))).toBe(
      fa.errors.unsupportedFraming,
    )
    expect(extractErrorMessage(error('remux', { remuxCode: 'bad-index' }))).toBe(
      fa.errors.unsupportedFraming,
    )
    expect(extractErrorMessage(error('remux', { remuxCode: 'count-mismatch' }))).toBe(
      fa.errors.unsupportedFraming,
    )
    expect(extractErrorMessage(error('remux'))).toBe(fa.errors.remux)
  })

  it('falls back to a generic message for foreign errors', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe(fa.errors.unknown)
    expect(extractErrorMessage('boom')).toBe(fa.errors.unknown)
  })
})

describe('isAbortFailure', () => {
  it('recognizes DOMException aborts and the engine aborted code', () => {
    expect(isAbortFailure(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortFailure(error('aborted'))).toBe(true)
    expect(isAbortFailure(new Error('boom'))).toBe(false)
    expect(isAbortFailure('aborted')).toBe(false)
    expect(isAbortFailure(null)).toBe(false)
  })
})
