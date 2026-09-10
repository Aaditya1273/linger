import { describe, expect, it } from 'vitest';
import { oracleMarketFromFixture } from '../test/oracleMarketFixture';
import {
  DEFAULT_MIN_PREDICT_ASK,
  estimateBinaryUpAskPrice,
  estimateBinaryUpFairPrice,
  estimateMinQuotableStrike,
  estimatePredictTradingFeeFromFairPrice,
  estimateTargetBuyFloorPrice,
} from './predictPricing';
import type { OracleMarket } from './types';

function marketFixture(): OracleMarket {
  return oracleMarketFromFixture();
}

describe('estimateBinaryUpFairPrice', () => {
  it('estimates binary UP fair prices locally from oracle SVI parameters', () => {
    const market = marketFixture();

    expect(estimateBinaryUpFairPrice({ market, strike: 66_500 })).toBeGreaterThan(0.99);
    expect(estimateBinaryUpFairPrice({ market, strike: 72_500 })).toBeLessThan(0.99);
  });
});

describe('estimateBinaryUpAskPrice', () => {
  it('adds the Predict post-spread ask markup to the local fair price', () => {
    const market = marketFixture();
    const fairPrice = estimateBinaryUpFairPrice({ market, strike: 72_500 });
    const askPrice = estimateBinaryUpAskPrice({ market, strike: 72_500 });

    expect(fairPrice).not.toBeNull();
    expect(askPrice).not.toBeNull();
    expect(askPrice as number).toBeGreaterThan(fairPrice as number);
  });

  it('uses the chain minimum fee around low fair prices (Bernoulli floor)', () => {
    // max(0.02 * sqrt(0.02*0.98), 0.005) = max(0.02*√0.0196, 0.005) ≈ max(0.0028, 0.005) = 0.005
    expect(estimatePredictTradingFeeFromFairPrice({ fairPrice: 0.02, baseFee: 0.02, minFee: 0.005 })).toBe(0.005);
  });

  it('uses base_fee * sqrt(p*(1-p)) in the interior', () => {
    // p=0.5 → sqrt(0.25)=0.5 → 0.02*0.5=0.01 > min_fee 0.005
    expect(estimatePredictTradingFeeFromFairPrice({ fairPrice: 0.5, baseFee: 0.02, minFee: 0.005 })).toBeCloseTo(0.01);
  });

  it('adds EWMA congestion penalty when provided (browse default is zero)', () => {
    const fee = estimatePredictTradingFeeFromFairPrice({
      fairPrice: 0.5,
      baseFee: 0.02,
      minFee: 0.005,
      ewmaPenaltyRate: 0.001,
    });
    expect(fee).toBeCloseTo(0.011);
  });

  it('applies the expiry fee ramp inside the window', () => {
    const fee = estimatePredictTradingFeeFromFairPrice({
      fairPrice: 0.5,
      baseFee: 0.02,
      minFee: 0.005,
      timeToExpiryMs: 0,
      expiryFeeWindowMs: 86_400_000,
      expiryFeeMaxMultiplier: 2,
    });
    // at expiry: multiplier = 2 → 0.01 * 2 = 0.02
    expect(fee).toBeCloseTo(0.02);
  });

  it('returns null fair/ask at SVI boundary when total variance is invalid', () => {
    const market = marketFixture();
    const broken: OracleMarket = {
      ...market,
      svi: { ...market.svi!, a: -1, b: 0, rho: 0, m: 0, sigma: 0 },
    };
    expect(estimateBinaryUpFairPrice({ market: broken, strike: 72_500 })).toBeNull();
    expect(estimateBinaryUpAskPrice({ market: broken, strike: 72_500 })).toBeNull();
  });

  it('saturates deep-ITM binary UP fair price near 1', () => {
    const market = marketFixture();
    expect(estimateBinaryUpFairPrice({ market, strike: market.minStrike })).toBeGreaterThan(0.99);
  });
});

describe('estimateMinQuotableStrike', () => {
  it('solves the deepest strike whose ask stays inside the Predict max-ask clamp', () => {
    const market = marketFixture();
    const nowMs = market.spotTimestampMs;

    const minQuotable = estimateMinQuotableStrike({ market, nowMs });

    expect(minQuotable).not.toBeNull();
    expect(minQuotable as number).toBeGreaterThan(market.minStrike);
    expect(minQuotable as number).toBeLessThan(market.forward);
    // At the solved strike the ask fits the clamp; one rung deeper it no longer does.
    expect(
      estimateBinaryUpAskPrice({ market, strike: minQuotable as number, nowMs }) as number,
    ).toBeLessThanOrEqual(0.985 + 1e-6);
    expect(
      estimateBinaryUpAskPrice({ market, strike: (minQuotable as number) - 100, nowMs }) as number,
    ).toBeGreaterThan(0.985);
  });

  it('returns null when SVI parameters are unavailable', () => {
    const { svi: _svi, ...market } = marketFixture();
    expect(estimateMinQuotableStrike({ market })).toBeNull();
  });
});

describe('estimateTargetBuyFloorPrice', () => {
  it('uses a 0.02 default lower ask boundary for local floor solving', () => {
    expect(DEFAULT_MIN_PREDICT_ASK).toBe(0.02);
  });

  it('raises a too-deep fixed floor toward the Predict ask bounds without network quotes', () => {
    const market = marketFixture();
    const floor = estimateTargetBuyFloorPrice({ market, targetPrice: 73_000 });
    const askPrice = estimateBinaryUpAskPrice({ market, strike: floor });

    expect(floor).toBeGreaterThan(68_000);
    expect(floor).toBeLessThan(73_000);
    expect(askPrice).not.toBeNull();
    expect(askPrice as number).toBeLessThanOrEqual(0.9855);
  });

  it('falls back to the old fixed floor distance when SVI is unavailable', () => {
    const { svi, ...market } = marketFixture();

    expect(estimateTargetBuyFloorPrice({ market, targetPrice: 73_000 })).toBe(68_000);
    expect(svi).toBeDefined();
  });
});
