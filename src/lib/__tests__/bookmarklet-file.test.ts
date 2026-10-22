import { describe, expect, it } from 'vitest'
import text from '../../../public/bookmarklet.txt?raw'

describe('public/bookmarklet.txt', () => {
  it('is a single-line javascript: URL with one trailing newline', () => {
    expect(text.startsWith('javascript:')).toBe(true)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.split('\n')).toHaveLength(2)
    expect(text).not.toContain('\r')
    expect(text.length).toBeGreaterThan(1000)
  })

  it('cannot break out of a <script> tag and compiles as JavaScript', () => {
    expect(text.toLowerCase()).not.toContain('</script')
    expect(() => new Function(text.slice('javascript:'.length))).not.toThrow()
  })

  it('keeps the spike data logic (sp4 IndexedDB → gzip + base64 share code)', () => {
    for (const marker of [
      'sp4',
      'licenses',
      'contents',
      'courses',
      'CompressionStream',
      'SP1:',
      'clipboard.writeText',
    ]) {
      expect(text).toContain(marker)
    }
  })
})
