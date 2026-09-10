import { describe, expect, it } from 'vitest';
import { riskMetricsForDualInvestmentQuote } from './riskMetrics';
import type { StructuredProductQuote } from './types';

function quoteFixture(overrides: Partial<StructuredProductQuote> = {}): StructuredProductQuote {
  return {
    id: 'dual-demo',
    productType: 'dual-investment',
    title: 'Target Buy BTC at 66,000',
    principal: 5,
    oracle: {
      predictId: '0x1',
      oracleId: '0x2',
      underlyingAsset: 'BTC',
      expiryMs: 1_781_683_200_000,
      minStrike: 50_000,
      tickSize: 1,
      status: 'active',
      spot: 66_172,
      forward: 66_167,
      spotTimestampMs: 1,
      sviTimestampMs: 1,
      serverLagSeconds: 1,
    },
    legs: [{ id: 'up-64667', instrumentType: 'binary-up', oracleId: '0x2', expiryMs: 1, strike: 64_667, isUp: true, quantity: 0.063588, description: 'UP 64,667', askPrice: 0.88, askCost: 0.056135, redeemPreview: 0, quoteTimestampMs: 1, executable: true }],
    totalLegCost: 0.056135,
    reserve: 4.936412,
    coupon: 0.007453,
    apr: 0.916,
    executable: true,
    scenarios: [],
    ...overrides,
  };
}

describe('riskMetricsForDualInvestmentQuote', () => {
  it('summarizes minimum payout, maximum loss, option budget, and holding-period return', () => {
    expect(riskMetricsForDualInvestmentQuote(quoteFixture())).toEqual({
      minimumPayout: 4.943865,
      maximumPayout: 5.007453,
      maximumLoss: 0.056135,
      optionBudget: 0.056135,
      holdingPeriodReturn: 0.0014906,
      quoteTtlSeconds: 30,
      maxCostSlippage: 0.01,
      liquidityStatus: 'verified',
    });
  });

  it('marks liquidity unavailable when any quoted leg is not executable', () => {
    expect(
      riskMetricsForDualInvestmentQuote(
        quoteFixture({
          executable: false,
          legs: [{ ...quoteFixture().legs[0], executable: false, error: 'No book liquidity' }],
        }),
      ).liquidityStatus,
    ).toBe('unavailable');
  });
});
