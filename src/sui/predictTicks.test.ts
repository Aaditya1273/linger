import { describe, expect, it } from 'vitest';
import {
  POS_INF_TICK,
  alignPriceToAdmissionGrid,
  binaryUpRangeTicks,
  priceToTickIndex,
} from './predictTicks';

describe('predictTicks', () => {
  it('maps USD prices to absolute tick indices on the $0.01 grid', () => {
    expect(priceToTickIndex(61_000, 0.01)).toBe(6_100_000n);
    expect(priceToTickIndex(66_000.5, 0.01)).toBe(6_600_050n);
  });

  it('rejects non-positive tick sizes and non-finite prices', () => {
    expect(() => priceToTickIndex(61_000, 0)).toThrow('tickSize must be positive');
    expect(() => priceToTickIndex(Number.NaN, 0.01)).toThrow('price must be a non-negative finite number');
  });

  it('aligns target prices to the admission grid ($1)', () => {
    expect(alignPriceToAdmissionGrid(66_000.4, 1)).toBe(66_000);
    expect(alignPriceToAdmissionGrid(66_000.6, 1)).toBe(66_001);
  });

  it('maps binary-up(K) to [K, +∞) with the positive-infinity sentinel tick', () => {
    expect(POS_INF_TICK).toBe((1n << 30n) - 1n);
    expect(binaryUpRangeTicks(61_000, 0.01)).toEqual({
      lowerTick: 6_100_000n,
      higherTick: POS_INF_TICK,
    });
  });
});
