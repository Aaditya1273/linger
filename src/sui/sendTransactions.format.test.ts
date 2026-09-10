import { describe, expect, it } from 'vitest';
import { formatDusdcAmount, parseDusdcAmount } from './sendTransactions';

describe('formatDusdcAmount', () => {
  it('formats whole and fractional base units without trailing zeros', () => {
    expect(formatDusdcAmount(0n)).toBe('0');
    expect(formatDusdcAmount(1_000_000n)).toBe('1');
    expect(formatDusdcAmount(1_500_000n)).toBe('1.5');
    expect(formatDusdcAmount(1n)).toBe('0.000001');
    expect(formatDusdcAmount(10_102_000_000n)).toBe('10102');
  });

  it('stays exact above Number safe-integer range', () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1 — Number would round this
    expect(formatDusdcAmount(huge)).toBe('9007199254.740993');
  });

  it('round-trips through parseDusdcAmount', () => {
    for (const baseUnits of [1n, 999_999n, 1_000_000n, 123_456_789n, 9_007_199_254_740_993n]) {
      expect(parseDusdcAmount(formatDusdcAmount(baseUnits))).toBe(baseUnits);
    }
  });
});
