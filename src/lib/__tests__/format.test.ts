import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatNumber, formatPercent } from '../format'

describe('formatBytes', () => {
  it('renders megabytes with one decimal and the Persian unit', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 مگابایت')
    expect(formatBytes(42.4 * 1024 * 1024)).toBe('42.4 مگابایت')
    expect(formatBytes(872_654_438)).toBe('832.2 مگابایت')
  })

  it('switches to gigabytes from 1024 MB and keeps one decimal', () => {
    expect(formatBytes(1023 * 1024 * 1024)).toBe('1023.0 مگابایت')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 گیگابایت')
    expect(formatBytes(2885.4 * 1024 * 1024)).toBe('2.8 گیگابایت')
  })

  it('clamps invalid values to zero without a decimal', () => {
    expect(formatBytes(0)).toBe('0 مگابایت')
    expect(formatBytes(-5)).toBe('0 مگابایت')
    expect(formatBytes(Number.NaN)).toBe('0 مگابایت')
  })
})

describe('formatDuration', () => {
  it('uses mm:ss below one hour', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(429.418667)).toBe('07:09')
  })

  it('uses h:mm:ss from one hour up', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(16_789)).toBe('4:39:49')
  })
})

describe('formatPercent', () => {
  it('rounds and clamps to 0–100', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(42.6)).toBe('43%')
    expect(formatPercent(140)).toBe('100%')
    expect(formatPercent(-1)).toBe('0%')
  })
})

describe('formatNumber', () => {
  it('groups thousands and truncates', () => {
    expect(formatNumber(1234)).toBe('1,234')
    expect(formatNumber(12.9)).toBe('12')
  })
})
