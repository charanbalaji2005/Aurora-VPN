import {
  EM_DASH,
  formatBytes,
  formatDuration,
  formatDurationShort,
  formatLatency,
  formatRate,
} from '../src/util/format';

describe('duration formatting', () => {
  it('shows hours only when there are hours', () => {
    expect(formatDuration(10_800)).toBe('3:00:00');
    expect(formatDuration(2_467)).toBe('41:07');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('clamps negatives rather than rendering nonsense', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('has a compact form for captions', () => {
    expect(formatDurationShort(9_000)).toBe('2h 30m');
    expect(formatDurationShort(7_200)).toBe('2h');
    expect(formatDurationShort(90)).toBe('1m');
  });
});

/**
 * The rule that keeps the whole UI honest: a value we do not have is an em
 * dash, never a zero. "0 ms" claims a measurement.
 */
describe('absent values', () => {
  it('renders missing measurements as an em dash', () => {
    expect(formatLatency(null)).toBe(EM_DASH);
    expect(formatRate(null)).toBe(EM_DASH);
    expect(formatBytes(null)).toBe(EM_DASH);
    expect(formatBytes(undefined)).toBe(EM_DASH);
  });

  it('still renders a real zero as zero', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatLatency(0)).toBe('0 ms');
  });
});

describe('byte formatting', () => {
  it('steps through units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatRate(2048)).toBe('2.0 KB/s');
  });
});
