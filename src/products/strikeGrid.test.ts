import { describe, expect, it } from 'vitest';
import { alignToGrid, buildStrikeLadder } from './strikeGrid';

describe('alignToGrid', () => {
  it('rounds arbitrary user prices to the nearest executable strike', () => {
    const result = alignToGrid(73188.873666, 50000, 1);
    expect(result.input).toBe(73188.873666);
    expect(result.aligned).toBe(73189);
    expect(result.diff).toBeCloseTo(0.126334);
    expect(result.diffBps).toBeCloseTo(0.01726137);
  });

  it('supports protocol-style integer strike units', () => {
    expect(alignToGrid(73188_873_666_000, 50_000_000_000_000, 1_000_000_000).aligned).toBe(
      73_189_000_000_000,
    );
  });

  it('rejects non-positive tick sizes', () => {
    expect(() => alignToGrid(73_000, 50_000, 0)).toThrow('tickSize must be positive');
  });
});

describe('buildStrikeLadder', () => {
  it('builds floor-inclusive target-exclusive strikes', () => {
    expect(buildStrikeLadder({ floor: 58_000, target: 73_000, step: 2_000 })).toEqual([
      58_000,
      60_000,
      62_000,
      64_000,
      66_000,
      68_000,
      70_000,
      72_000,
    ]);
  });

  it('rejects non-positive steps instead of looping forever', () => {
    expect(() => buildStrikeLadder({ floor: 58_000, target: 73_000, step: 0 })).toThrow('step must be positive');
    expect(() => buildStrikeLadder({ floor: 58_000, target: 73_000, step: -1 })).toThrow('step must be positive');
  });
});
