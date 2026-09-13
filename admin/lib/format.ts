/**
 * One rule: a value we do not have renders as an em dash, never as a zero.
 * "0 ms" claims a measurement. A real zero still renders as zero.
 */
export const EM_DASH = '—'

export const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined ? EM_DASH : value.toLocaleString('en-US')

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return EM_DASH
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = Math.abs(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return EM_DASH
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export const formatLatency = (ms: number | null | undefined): string =>
  ms === null || ms === undefined ? EM_DASH : `${Math.round(ms)} ms`

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? EM_DASH : `${Math.round(value)}%`

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return EM_DASH
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? EM_DASH : date.toISOString().replace('T', ' ').slice(0, 19)
}

/** Percentage change, or null when there is no baseline to compare against. */
export function trend(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}
