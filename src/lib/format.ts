/**
 * Number formatting for the UI.
 *
 * Technical values keep Latin digits (per the plan) and a fixed unit order so
 * numbers line up in tables and progress labels. Pure and testable.
 */

import { fa } from '../i18n/fa'

const BYTES_PER_KB = 1024
const BYTES_PER_MB = 1024 * 1024
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/** `1536` → «1,536»; used for counts that read better grouped. */
export function formatNumber(value: number): string {
  return numberFormat.format(Math.trunc(finiteOrZero(value)))
}

/** Encrypted byte count → «832.4 مگابایت» (one decimal, Latin digits). */
export function formatBytes(bytes: number): string {
  const safe = Math.max(0, finiteOrZero(bytes))
  if (safe === 0) return `0 ${fa.units.megabyte}`
  if (safe < BYTES_PER_MB) return `${(safe / BYTES_PER_KB).toFixed(1)} ${fa.units.kilobyte}`
  const mb = safe / BYTES_PER_MB
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ${fa.units.gigabyte}`
  return `${mb.toFixed(1)} ${fa.units.megabyte}`
}

/**
 * Seconds → `mm:ss`, or `h:mm:ss` from one hour up. Rounds to the nearest
 * second; negative/non-finite input becomes `00:00`.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(finiteOrZero(seconds)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** A 0–100 percentage → «42%» (clamped, rounded, Latin digits). */
export function formatPercent(value: number): string {
  const clamped = Math.min(100, Math.max(0, finiteOrZero(value)))
  return `${Math.round(clamped)}%`
}
