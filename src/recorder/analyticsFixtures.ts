import { DAY_MS } from '../products/tenorMarkets';
import type { TimestampedSample } from './store';

/** Fixed fixture boundary used by deterministic E2E / Demo Mode Analytics. */
export const ANALYTICS_FIXTURE_START_MS = Date.UTC(2026, 6, 13, 12, 0, 0);
const BOUNDARY_B = ANALYTICS_FIXTURE_START_MS + 15 * 60 * 1000;
const BOUNDARY_C = BOUNDARY_B + 15 * 60 * 1000;
const HOUR_MS = 3_600_000;

/** Fixture Expiry Markets — settlement instants are fixed; Runs drift, markets do not. */
export const FIXTURE_SETTLEMENT_3D_MS = ANALYTICS_FIXTURE_START_MS + 3 * DAY_MS;
export const FIXTURE_SETTLEMENT_7D_MS = ANALYTICS_FIXTURE_START_MS + 7 * DAY_MS;
export const FIXTURE_SETTLEMENT_1D_MS = BOUNDARY_B + DAY_MS;

function fixtureSample(
  overrides: Partial<TimestampedSample> & Pick<TimestampedSample, 'boundaryMs' | 'targetPrice'>,
): TimestampedSample {
  return {
    spot: 73_560,
    coupon: 0.12,
    reserve: 4.5,
    legsCost: 0.38,
    legCount: 6,
    netApr: 0.4,
    ankerSettlementMs: FIXTURE_SETTLEMENT_3D_MS,
    benchmarkSettlementMs: FIXTURE_SETTLEMENT_3D_MS + 8 * HOUR_MS,
    benchmarkApr: 0.3,
    benchmarkProductId: 'fixture-binance',
    matchStatus: 'matched',
    source: 'live',
    appVersion: '0.2.1',
    headlineEligible: true,
    ...overrides,
  };
}

/**
 * Deterministic Samples for fixture-mode Analytics.
 * Headline: 6 eligible (5 leading), median Edge +7.5 pts, streak 2 Runs, coverage 6/7.
 * Edge Tracks: active 3d market (two Runs, two ladder rows each — real min–max band),
 * active 7d market (one Run — insufficient-samples state), and an ended 1d market
 * (hourly shelf) holding the negative Edge point.
 */
export function analyticsFixtureSamples(): readonly TimestampedSample[] {
  return [
    // 3d market, newest Run — edges +0.10 / +0.04
    fixtureSample({
      boundaryMs: BOUNDARY_C,
      targetPrice: 73_500,
      netApr: 0.4,
      benchmarkApr: 0.3,
    }),
    fixtureSample({
      boundaryMs: BOUNDARY_C,
      targetPrice: 72_800,
      netApr: 0.34,
      benchmarkApr: 0.3,
    }),
    // 3d market, prior Run — edges +0.20 / +0.05
    fixtureSample({
      boundaryMs: BOUNDARY_B,
      targetPrice: 73_500,
      netApr: 0.5,
      benchmarkApr: 0.3,
    }),
    fixtureSample({
      boundaryMs: BOUNDARY_B,
      targetPrice: 72_800,
      netApr: 0.35,
      benchmarkApr: 0.3,
    }),
    // 7d market, newest Run only — edge +0.10
    fixtureSample({
      boundaryMs: BOUNDARY_C,
      targetPrice: 73_000,
      netApr: 0.4,
      benchmarkApr: 0.3,
      ankerSettlementMs: FIXTURE_SETTLEMENT_7D_MS,
      benchmarkSettlementMs: FIXTURE_SETTLEMENT_7D_MS + 8 * HOUR_MS,
    }),
    // 1d market, prior Run only (ended Track) — edge −0.05
    fixtureSample({
      boundaryMs: BOUNDARY_B,
      targetPrice: 72_500,
      netApr: 0.25,
      benchmarkApr: 0.3,
      ankerSettlementMs: FIXTURE_SETTLEMENT_1D_MS,
      benchmarkSettlementMs: FIXTURE_SETTLEMENT_1D_MS + 8 * HOUR_MS,
    }),
    // Unmatched — coverage only
    fixtureSample({
      boundaryMs: ANALYTICS_FIXTURE_START_MS,
      targetPrice: 74_000,
      netApr: 0.35,
      benchmarkApr: null,
      benchmarkSettlementMs: null,
      benchmarkProductId: null,
      matchStatus: 'no_product',
      headlineEligible: false,
    }),
  ];
}
