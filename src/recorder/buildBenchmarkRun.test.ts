import { describe, expect, it } from 'vitest';
import { lastKnownMarketSnapshot } from '../test/marketSnapshotFixture';
import type { BinanceDualInvestmentProduct } from '../deepbook/binanceDualInvestment';
import type { OracleMarket } from '../products/types';
import { alignToRunBoundary, buildBenchmarkRun } from './buildBenchmarkRun';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const NOW_MS = Date.UTC(2026, 6, 14, 12, 7, 30); // mid 15-min window → boundary 12:00
const APP_VERSION = '0.2.1';
/** Spot just above a $500 rung so the ladder starts at 73_500. */
const SPOT = 73_560;
const LADDER_TOP = 73_500;
const LADDER_SECOND = 73_000;

function dayMarket(overrides: Partial<OracleMarket> = {}): OracleMarket {
  return {
    ...lastKnownMarketSnapshot,
    spot: SPOT,
    forward: SPOT,
    expiryMs: NOW_MS + 3 * DAY_MS,
    tickSize: 1,
    minStrike: 50_000,
    admissionTickSize: 1,
    ...overrides,
  };
}

function binanceProduct(
  overrides: Partial<BinanceDualInvestmentProduct> & Pick<BinanceDualInvestmentProduct, 'id' | 'strikePrice'>,
): BinanceDualInvestmentProduct {
  return {
    investmentAsset: 'USDC',
    targetAsset: 'BTC',
    settleTimeMs: NOW_MS + 3 * DAY_MS + 8 * HOUR_MS,
    apr: 0.35,
    durationDays: 3,
    canPurchase: true,
    ...overrides,
  };
}

describe('alignToRunBoundary', () => {
  it('stamps wall-clock times down to the enclosing 15-minute boundary', () => {
    expect(alignToRunBoundary(Date.UTC(2026, 6, 14, 12, 0, 0))).toBe(Date.UTC(2026, 6, 14, 12, 0, 0));
    expect(alignToRunBoundary(Date.UTC(2026, 6, 14, 12, 7, 30))).toBe(Date.UTC(2026, 6, 14, 12, 0, 0));
    expect(alignToRunBoundary(Date.UTC(2026, 6, 14, 12, 14, 59, 999))).toBe(Date.UTC(2026, 6, 14, 12, 0, 0));
    expect(alignToRunBoundary(Date.UTC(2026, 6, 14, 12, 15, 0))).toBe(Date.UTC(2026, 6, 14, 12, 15, 0));
  });
});

describe('buildBenchmarkRun', () => {
  it('builds one sample per day-shelf ladder row that displays APR + Benchmark, including unmatched', () => {
    const market = dayMarket();
    // Cover two ladder rungs: one matched, one with no Binance product at that strike.
    const products = [
      binanceProduct({ id: 'match-73500', strikePrice: LADDER_TOP }),
      // LADDER_SECOND rung intentionally absent → no_product
    ];

    const { run, samples } = buildBenchmarkRun({
      markets: [market],
      binanceProducts: products,
      spot: SPOT,
      nowMs: NOW_MS,
      appVersion: APP_VERSION,
    });

    expect(run).toMatchObject({
      boundaryMs: Date.UTC(2026, 6, 14, 12, 0, 0),
      status: 'ok',
      appVersion: APP_VERSION,
      source: 'live',
    });
    expect(samples.length).toBeGreaterThanOrEqual(2);

    const matched = samples.find((s) => s.targetPrice === LADDER_TOP);
    expect(matched).toMatchObject({
      spot: SPOT,
      matchStatus: 'matched',
      benchmarkProductId: 'match-73500',
      benchmarkApr: 0.35,
      ankerSettlementMs: market.expiryMs,
      benchmarkSettlementMs: products[0].settleTimeMs,
      source: 'live',
      appVersion: APP_VERSION,
      headlineEligible: true,
    });
    expect(matched!.netApr).toBeTypeOf('number');
    expect(matched!.coupon).toBeGreaterThan(0);
    expect(matched!.reserve).toBeGreaterThan(0);
    expect(matched!.legsCost).toBeGreaterThan(0);
    expect(matched!.legCount).toBe(6);

    const unmatched = samples.find((s) => s.targetPrice === LADDER_SECOND);
    expect(unmatched).toMatchObject({
      matchStatus: 'no_product',
      benchmarkProductId: null,
      benchmarkApr: null,
      benchmarkSettlementMs: null,
      headlineEligible: false,
    });
  });

  it('records Snapshot fallback as a degraded Run with samples that are never headline-eligible', () => {
    const market = dayMarket();
    const products = [binanceProduct({ id: 'snap-73500', strikePrice: LADDER_TOP })];

    const { run, samples } = buildBenchmarkRun({
      markets: [market],
      binanceProducts: products,
      spot: SPOT,
      nowMs: NOW_MS,
      appVersion: APP_VERSION,
      source: 'snapshot',
    });

    expect(run.status).toBe('snapshot_fallback');
    expect(run.source).toBe('snapshot');
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.headlineEligible === false)).toBe(true);
    expect(samples.every((s) => s.source === 'snapshot')).toBe(true);
  });

  it('records upstream failure as a degraded Run with no samples', () => {
    const { run, samples } = buildBenchmarkRun({
      markets: [],
      binanceProducts: [],
      spot: SPOT,
      nowMs: NOW_MS,
      appVersion: APP_VERSION,
      upstreamFailed: true,
    });

    expect(run).toMatchObject({
      status: 'upstream_failure',
      boundaryMs: Date.UTC(2026, 6, 14, 12, 0, 0),
    });
    expect(samples).toEqual([]);
  });

  it('stores no_comparable_product when the nearest Benchmark exceeds the 50% offset bound', () => {
    const market = dayMarket({ expiryMs: NOW_MS + DAY_MS }); // 1d tenor
    // Offset 20h > 50% of 24h → no_comparable_product
    const products = [
      binanceProduct({
        id: 'far',
        strikePrice: LADDER_TOP,
        settleTimeMs: market.expiryMs + 20 * HOUR_MS,
      }),
    ];

    const { samples } = buildBenchmarkRun({
      markets: [market],
      binanceProducts: products,
      spot: SPOT,
      nowMs: NOW_MS,
      appVersion: APP_VERSION,
    });

    const row = samples.find((s) => s.targetPrice === LADDER_TOP);
    expect(row).toMatchObject({
      matchStatus: 'no_comparable_product',
      benchmarkProductId: null,
      benchmarkApr: null,
      benchmarkSettlementMs: null,
      headlineEligible: false,
    });
  });

  it('keeps Benchmark settlement and product identity when APR is unavailable', () => {
    const market = dayMarket();
    const settleTimeMs = market.expiryMs + 8 * HOUR_MS;
    const products = [
      binanceProduct({
        id: 'no-apr',
        strikePrice: LADDER_TOP,
        settleTimeMs,
        apr: null,
      }),
    ];

    const { samples } = buildBenchmarkRun({
      markets: [market],
      binanceProducts: products,
      spot: SPOT,
      nowMs: NOW_MS,
      appVersion: APP_VERSION,
    });

    expect(samples.find((s) => s.targetPrice === LADDER_TOP)).toMatchObject({
      matchStatus: 'apr_unavailable',
      benchmarkProductId: 'no-apr',
      benchmarkSettlementMs: settleTimeMs,
      benchmarkApr: null,
      headlineEligible: false,
    });
  });
});