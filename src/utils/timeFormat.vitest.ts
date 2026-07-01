import { describe, it, expect } from 'vitest';
import { formatDuration } from './timeFormat';

// formatDuration is the on-screen formatter for the end-of-game stats panel
// (avg turn time, total game time, fastest/slowest turn). calculateStats produces
// the raw millisecond numbers (covered by statsCalculator.vitest.ts) but nothing
// guarded how those numbers RENDER — a regression here (e.g. "90s" instead of
// "1m 30s", or dropping the sub-second tier) would be user-visible and silent.
describe('formatDuration', () => {
  describe('sub-second tier (< 1000ms shows raw ms)', () => {
    it('formats zero as 0ms', () => {
      expect(formatDuration(0)).toBe('0ms');
    });

    it('formats a mid-range sub-second duration in ms', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('keeps 999ms in the ms tier (boundary just below 1s)', () => {
      expect(formatDuration(999)).toBe('999ms');
    });
  });

  describe('seconds tier (1s..59s, Math.round half-up)', () => {
    it('crosses to the seconds tier at exactly 1000ms', () => {
      expect(formatDuration(1000)).toBe('1s');
    });

    it('rounds 1499ms DOWN to 1s', () => {
      expect(formatDuration(1499)).toBe('1s');
    });

    it('rounds 1500ms UP to 2s (round-half-up)', () => {
      expect(formatDuration(1500)).toBe('2s');
    });

    it('formats a fractional-ms avg (as produced by calculateStats mean) by rounding', () => {
      // e.g. mean of 1500 and 1834 -> 1667ms -> round(1.667) = 2s
      expect(formatDuration(1667)).toBe('2s');
    });

    it('keeps 59s in the seconds tier', () => {
      expect(formatDuration(59000)).toBe('59s');
    });
  });

  describe('minutes tier (>= 60s), no hour rollover', () => {
    it('formats exactly 60s as "1m 0s"', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
    });

    it('rounds 59500ms up across the minute boundary to "1m 0s"', () => {
      // round(59.5) = 60 seconds, which trips the >= 60 branch — a subtle edge
      // where rounding, not the raw value, crosses the minute boundary.
      expect(formatDuration(59500)).toBe('1m 0s');
    });

    it('composes minutes and remaining seconds', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
    });

    it('formats an exact multiple of a minute with 0 remaining seconds', () => {
      expect(formatDuration(120000)).toBe('2m 0s');
    });

    it('does NOT roll over into hours past 60 minutes', () => {
      // 3661s -> 61m 1s (stays in minutes, never "1h ...")
      expect(formatDuration(3661000)).toBe('61m 1s');
    });
  });
});
