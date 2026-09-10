import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../products/tenorMarkets';
import type { BenchmarkMatchStatus, BenchmarkSampleSource } from './buildBenchmarkRun';
import { aggregateHeadlineStats } from './aggregateHeadlineStats';
import type { TimestampedSample } from './store';

const BOUNDARY_A = Date.UTC(2026, 6, 14, 12, 0, 0);
const BOUNDARY_B = BOUNDARY_A - 15 * 60 * 1000;
const BOUNDARY_C = BOUNDARY_B - 15 * 60 * 1000;

function sample(overrides: Partial<TimestampedSample> & { boundaryMs: number }): TimestampedSample {
  const boundaryMs = overrides.boundaryMs;
  const base: TimestampedSample = {
    boundaryMs,
    targetPrice: 73_500,
    spot: 73_560,
    coupon: 0.12,
    reserve: 4.5,
    legsCost: 0.38,
    legCount: 6,
    netApr: 0.4,
    ankerSettlementMs: boundaryMs + 3 * DAY_MS,
    benchmarkSettlementMs: boundaryMs + 3 * DAY_MS + 8 * 3_600_000,
    benchmarkApr: 0.3,
    benchmarkProductId: 'binance-1',
    matchStatus: 'matched' as BenchmarkMatchStatus,
    source: 'live' as BenchmarkSampleSource,
    appVersion: '0.2.1',
    headlineEligible: true,
  };
  return { ...base, ...overrides };
}

describe('aggregateHeadlineStats', () => {
  it('returns empty headline figures when there are no samples', () => {
    expect(aggregateHeadlineStats([])).toEqual({
      sampleCount: 0,
      leadingPct: null,
      medianEdgePp: null,
      currentLeadingStreak: 0,
      ladderCoverage: null,
      sampleStartMs: null,
      tenorBuckets: [],
    });
  });

  it('computes sample count, leading %, median Edge, and ladder coverage from headline-eligible samples', () => {
    const samples = [
      // Edge +0.10 — leading
      sample({ boundaryMs: BOUNDARY_A, netApr: 0.4, benchmarkApr: 0.3 }),
      // Edge −0.05 — trailing
      sample({ boundaryMs: BOUNDARY_A, targetPrice: 73_000, netApr: 0.25, benchmarkApr: 0.3 }),
      // Edge +0.20 — leading
      sample({ boundaryMs: BOUNDARY_B, netApr: 0.5, benchmarkApr: 0.3 }),
      // unmatched — excluded from headlines, counted in coverage
      sample({
        boundaryMs: BOUNDARY_A,
        targetPrice: 74_000,
        netApr: 0.35,
        benchmarkApr: null,
        benchmarkSettlementMs: null,
        benchmarkProductId: null,
        matchStatus: 'no_product',
        headlineEligible: false,
      }),
    ];

    const stats = aggregateHeadlineStats(samples);

    expect(stats.sampleCount).toBe(3);
    expect(stats.leadingPct).toBeCloseTo(2 / 3);
    // Edges: −0.05, +0.10, +0.20 → median +0.10
    expect(stats.medianEdgePp).toBeCloseTo(0.1);
    expect(stats.ladderCoverage).toBeCloseTo(3 / 4);
    expect(stats.sampleStartMs).toBe(BOUNDARY_B);
  });

  it('excludes snapshot-fallback and non-eligible samples from headline figures but keeps them in ladder coverage', () => {
    const samples = [
      sample({ boundaryMs: BOUNDARY_A, netApr: 0.4, benchmarkApr: 0.3 }),
      sample({
        boundaryMs: BOUNDARY_A,
        targetPrice: 72_000,
        source: 'snapshot',
        matchStatus: 'matched',
        netApr: 0.9,
        benchmarkApr: 0.1,
        headlineEligible: false,
      }),
      sample({
        boundaryMs: BOUNDARY_B,
        matchStatus: 'no_comparable_product',
        benchmarkApr: null,
        benchmarkSettlementMs: null,
        benchmarkProductId: null,
        headlineEligible: false,
      }),
    ];

    const stats = aggregateHeadlineStats(samples);

    expect(stats.sampleCount).toBe(1);
    expect(stats.leadingPct).toBe(1);
    expect(stats.medianEdgePp).toBeCloseTo(0.1);
    expect(stats.ladderCoverage).toBeCloseTo(2 / 3);
  });

  it('counts current leading streak as consecutive newest Runs with positive median Edge', () => {
    const samples = [
      // Newest run — median Edge +0.1
      sample({ boundaryMs: BOUNDARY_A, netApr: 0.4, benchmarkApr: 0.3 }),
      sample({ boundaryMs: BOUNDARY_A, targetPrice: 73_000, netApr: 0.35, benchmarkApr: 0.3 }),
      // Prior run — median Edge +0.05
      sample({ boundaryMs: BOUNDARY_B, netApr: 0.35, benchmarkApr: 0.3 }),
      // Oldest run — median Edge −0.05 (breaks streak)
      sample({ boundaryMs: BOUNDARY_C, netApr: 0.25, benchmarkApr: 0.3 }),
    ];

    expect(aggregateHeadlineStats(samples).currentLeadingStreak).toBe(2);
  });

  it('breaks the leading streak when a newer Run has non-positive median Edge', () => {
    const samples = [
      sample({ boundaryMs: BOUNDARY_A, netApr: 0.2, benchmarkApr: 0.3 }),
      sample({ boundaryMs: BOUNDARY_B, netApr: 0.4, benchmarkApr: 0.3 }),
    ];

    expect(aggregateHeadlineStats(samples).currentLeadingStreak).toBe(0);
  });

  it('breaks the leading streak when a newer failed Run is supplied even with no Samples', () => {
    const samples = [
      sample({ boundaryMs: BOUNDARY_B, netApr: 0.4, benchmarkApr: 0.3 }),
      sample({ boundaryMs: BOUNDARY_C, netApr: 0.5, benchmarkApr: 0.3 }),
    ];

    expect(
      aggregateHeadlineStats({
        samples,
        runs: [
          { boundaryMs: BOUNDARY_A, status: 'upstream_failure' },
          { boundaryMs: BOUNDARY_B, status: 'ok' },
          { boundaryMs: BOUNDARY_C, status: 'ok' },
        ],
      }).currentLeadingStreak,
    ).toBe(0);
  });

  it('buckets headline-eligible samples by remaining Anker tenor', () => {
    const samples = [
      sample({
        boundaryMs: BOUNDARY_A,
        ankerSettlementMs: BOUNDARY_A + 1.5 * DAY_MS,
        netApr: 0.4,
        benchmarkApr: 0.3,
      }),
      sample({
        boundaryMs: BOUNDARY_A,
        targetPrice: 73_000,
        ankerSettlementMs: BOUNDARY_A + 5 * DAY_MS,
        netApr: 0.2,
        benchmarkApr: 0.3,
      }),
      sample({
        boundaryMs: BOUNDARY_B,
        ankerSettlementMs: BOUNDARY_B + 10 * DAY_MS,
        netApr: 0.5,
        benchmarkApr: 0.3,
      }),
      // non-eligible — omitted from tenor buckets
      sample({
        boundaryMs: BOUNDARY_A,
        targetPrice: 74_000,
        ankerSettlementMs: BOUNDARY_A + 1.5 * DAY_MS,
        matchStatus: 'no_product',
        headlineEligible: false,
        benchmarkApr: null,
      }),
    ];

    const buckets = aggregateHeadlineStats(samples).tenorBuckets;
    expect(buckets.map((b) => b.bucket)).toEqual(['1d', '3d', '7d']);

    const bucket1d = buckets.find((b) => b.bucket === '1d')!;
    expect(bucket1d.sampleCount).toBe(1);
    expect(bucket1d.leadingPct).toBe(1);
    expect(bucket1d.medianEdgePp).toBeCloseTo(0.1);

    const bucket3d = buckets.find((b) => b.bucket === '3d')!;
    expect(bucket3d.sampleCount).toBe(1);
    expect(bucket3d.leadingPct).toBe(0);
    expect(bucket3d.medianEdgePp).toBeCloseTo(-0.1);

    const bucket7d = buckets.find((b) => b.bucket === '7d')!;
    expect(bucket7d.sampleCount).toBe(1);
    expect(bucket7d.leadingPct).toBe(1);
    expect(bucket7d.medianEdgePp).toBeCloseTo(0.2);
  });
});
