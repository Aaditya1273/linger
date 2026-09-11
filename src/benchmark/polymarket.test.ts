import { describe, expect, it } from 'vitest';
import {
  nearestPolymarketThreshold,
  probabilityEdgePoints,
  type PolymarketBtcThreshold,
} from './polymarket';

const t = (strikeUsd: number, yesProbability: number): PolymarketBtcThreshold => ({
  strikeUsd,
  yesProbability,
  endDateMs: 1_789_070_400_000,
  question: `Will the price of Bitcoin be above $${strikeUsd} on September 11?`,
  liquidityUsd: 40_000,
});

describe('Polymarket benchmark', () => {
  const ladder = [t(70_000, 0.9985), t(74_000, 0.967), t(80_000, 0.034), t(84_000, 0.0015)];

  it('matches the nearest strike and discloses the offset', () => {
    const hit = nearestPolymarketThreshold(ladder, 77_135);
    expect(hit?.match.strikeUsd).toBe(80_000);
    expect(hit?.strikeOffsetUsd).toBe(2_865);
  });

  it('returns null rather than a misleading match beyond the bound', () => {
    expect(nearestPolymarketThreshold(ladder, 200_000)).toBeNull();
  });

  it('prefers an exact strike over a near one', () => {
    expect(nearestPolymarketThreshold(ladder, 74_000)?.strikeOffsetUsd).toBe(0);
  });

  it('edge is positive when the DreamDEX leg is the cheaper side', () => {
    // DreamDEX YES 0.90 vs Polymarket 0.967 -> Anker buys the same exposure
    // 6.7 points cheaper, so its coupon is bigger.
    expect(probabilityEdgePoints(0.9, 0.967)).toBeCloseTo(6.7, 5);
    expect(probabilityEdgePoints(0.98, 0.967)).toBeCloseTo(-1.3, 5);
  });
});
