import { describe, expect, it } from 'vitest';
import { compileBuyLow, feeOnCoupon } from './buyLow';

const scale = { decimals: 6, one: 1_000_000n };
const base = {
  principalRaw: 1_000_000_000n, // 1,000 tUSDC
  askRaw: 850_000n,             // 0.85
  strikeRaw: 7_713_585n,        // $77,135.85 at oracle scale 1e2
  oracleScale: 100n,
  expirySec: 1_000_000 + 3_600,
  nowSec: 1_000_000,
  feeBps: 1_000,
  scale,
};

describe('compileBuyLow', () => {
  it('keeps the ported identity: above-target payout == principal + coupon', () => {
    const q = compileBuyLow(base);
    expect(q.executable).toBe(true);
    expect(q.couponRaw).toBe(q.quantityRaw - q.legCostRaw);
    expect(q.aboveTargetRaw).toBe(base.principalRaw + q.couponRaw);
    expect(q.belowTargetRaw).toBe(base.principalRaw - q.legCostRaw);
  });

  it('refuses a quote with no resting ask instead of quoting zero', () => {
    const q = compileBuyLow({ ...base, askRaw: 0n });
    expect(q.executable).toBe(false);
    expect(q.warning).toMatch(/liquidity/i);
    expect(q.periodYieldBps).toBe(0);
  });

  it('refuses an expired market', () => {
    expect(compileBuyLow({ ...base, nowSec: base.expirySec }).executable).toBe(false);
  });

  it('refuses when the ask leaves no positive coupon', () => {
    const q = compileBuyLow({ ...base, askRaw: scale.one });
    expect(q.executable).toBe(false);
  });

  it('charges no fee on a zero coupon', () => {
    expect(feeOnCoupon(0n, 1_000)).toBe(0n);
    expect(feeOnCoupon(1_000_000n, 1_000)).toBe(100_000n);
  });
});
