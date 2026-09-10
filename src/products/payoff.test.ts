import { describe, expect, it } from 'vitest';
import { simulatePayoff } from './payoff';
import type { StructuredProductQuote } from './types';
import { lastKnownMarketSnapshot } from '../test/marketSnapshotFixture';

function baseQuote(): StructuredProductQuote {
  return {
    id: 'dual',
    productType: 'dual-investment',
    title: 'Target Buy BTC',
    principal: 1_000,
    oracle: lastKnownMarketSnapshot,
    reserve: 794.5205479452,
    totalLegCost: 24,
    coupon: 181.4794520548,
    apr: 0.5,
    executable: true,
    legs: [
      {
        id: 'up-58000',
        instrumentType: 'binary-up',
        oracleId: 'o',
        expiryMs: 1,
        strike: 58_000,
        isUp: true,
        quantity: 27.397260274,
        description: 'UP 58000',
        askPrice: 0.2,
        askCost: 3,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
      {
        id: 'up-60000',
        instrumentType: 'binary-up',
        oracleId: 'o',
        expiryMs: 1,
        strike: 60_000,
        isUp: true,
        quantity: 27.397260274,
        description: 'UP 60000',
        askPrice: 0.2,
        askCost: 3,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
    ],
    scenarios: [],
  };
}

describe('simulatePayoff', () => {
  it('marks binary UP legs as realized above their strike', () => {
    const scenarios = simulatePayoff(baseQuote(), [57_000, 59_000, 61_000]);
    expect(scenarios[0].realizedLegIds).toEqual([]);
    expect(scenarios[1].realizedLegIds).toEqual(['up-58000']);
    expect(scenarios[2].realizedLegIds).toEqual(['up-58000', 'up-60000']);
  });

  it('includes strike discontinuities in default payoff scenarios', () => {
    const settlementPrices = simulatePayoff(baseQuote()).map((scenario) => scenario.settlementPrice);

    expect(settlementPrices).toEqual(expect.arrayContaining([57_999, 58_000, 58_001]));
    expect(settlementPrices).toEqual(expect.arrayContaining([59_999, 60_000, 60_001]));
  });
});
