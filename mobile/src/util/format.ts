/**
 * Display formatting.
 *
 * One rule throughout: a value we do not actually have renders as an em dash,
 * never as a zero. "0 ms" claims a measurement; "—" admits there isn't one.
 * This is the first thing that quietly rots, so it is unit-tested.
 */

export const EM_DASH = '—';

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Compact form for captions: "2h 41m". */
export function formatDurationShort(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return EM_DASH;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(bytes);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return index === 0 ? `${Math.round(value)} ${units[index]}` : `${value.toFixed(1)} ${units[index]}`;
}

export function formatRate(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined) return EM_DASH;
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return EM_DASH;
  return `${Math.round(ms)} ms`;
}

export function formatElapsed(sinceEpochMs: number | null | undefined): string {
  if (!sinceEpochMs) return EM_DASH;
  return formatDuration((Date.now() - sinceEpochMs) / 1000);
}
