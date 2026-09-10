import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../products/tenorMarkets';
import type { BenchmarkMatchStatus, BenchmarkSampleSource } from './buildBenchmarkRun';
import { buildEdgeTracks } from './buildEdgeTracks';
import type { TimestampedSample } from './store';

const RUN_A = Date.UTC(2026, 6, 14, 12, 0, 0);
const RUN_B = RUN_A + 15 * 60 * 1000;
const HOUR_MS = 3_600_000;
const SETTLEMENT_3D = RUN_A + 3 * DAY_MS;
const SETTLEMENT_7D = RUN_A + 7 * DAY_MS;

function sample(overrides: Partial<TimestampedSample> & { boundaryMs: number }): TimestampedSample {
  const base: TimestampedSample = {
    boundaryMs: overrides.boundaryMs,
    targetPrice: 73_500,
    spot: 73_560,
    coupon: 0.12,
    reserve: 4.5,
    legsCost: 0.38,
    legCount: 6,
    netApr: 0.4,
    ankerSettlementMs: SETTLEMENT_3D,
    benchmarkSettlementMs: SETTLEMENT_3D + 8 * HOUR_MS,
    benchmarkApr: 0.3,
    benchmarkProductId: 'binance-1',
    matchStatus: 'matched' as BenchmarkMatchStatus,
    source: 'live' as BenchmarkSampleSource,
    appVersion: '0.2.1',
    headlineEligible: true,
  };
  return { ...base, ...overrides };
}

describe('buildEdgeTracks', () => {
  it('returns no tracks when there are no samples', () => {
    expect(buildEdgeTracks([])).toEqual({ tracks: [] });
  });

  it('groups samples into one Track per Expiry Market and aggregates ladder rows per Run', () => {
    const samples = [
      // 3d market, Run A: two ladder rows
      sample({ boundaryMs: RUN_A, targetPrice: 73_500, netApr: 0.5 }), // edge +0.20
      sample({ boundaryMs: RUN_A, targetPrice: 72_800, netApr: 0.35 }), // edge +0.05
      // 3d market, Run B: one row
      sample({ boundaryMs: RUN_B, targetPrice: 73_500, netApr: 0.4 }), // edge +0.10
      // 7d market, Run B
      sample({
        boundaryMs: RUN_B,
        targetPrice: 73_000,
        netApr: 0.25, // edge −0.05
        ankerSettlementMs: SETTLEMENT_7D,
        benchmarkSettlementMs: SETTLEMENT_7D + 8 * HOUR_MS,
      }),
    ];

    const { tracks } = buildEdgeTracks(samples);

    expect(tracks.map((t) => t.settlementMs)).toEqual([SETTLEMENT_3D, SETTLEMENT_7D]);

    const track3d = tracks[0]!;
    expect(track3d.points).toHaveLength(2);
    expect(track3d.points[0]).toMatchObject({ boundaryMs: RUN_A, rowCount: 2 });
    expect(track3d.points[0]!.medianEdgePp).toBeCloseTo(0.125);
    expect(track3d.points[0]!.minEdgePp).toBeCloseTo(0.05);
    expect(track3d.points[0]!.maxEdgePp).toBeCloseTo(0.2);
    expect(track3d.points[0]!.medianNetApr).toBeCloseTo(0.425);
    expect(track3d.points[0]!.medianBenchmarkApr).toBeCloseTo(0.3);
    expect(track3d.points[1]).toMatchObject({ boundaryMs: RUN_B, rowCount: 1 });
    expect(track3d.points[1]!.medianEdgePp).toBeCloseTo(0.1);

    expect(track3d.summary.sampleCount).toBe(3);
    expect(track3d.summary.leadingPct).toBe(1);
    expect(track3d.summary.medianEdgePp).toBeCloseTo(0.1);
    expect(track3d.summary.firstBoundaryMs).toBe(RUN_A);
    expect(track3d.summary.lastBoundaryMs).toBe(RUN_B);
    expect(track3d.summary.firstSeenRemainingMs).toBe(SETTLEMENT_3D - RUN_A);

    const track7d = tracks[1]!;
    expect(track7d.points).toHaveLength(1);
    expect(track7d.points[0]!.medianEdgePp).toBeCloseTo(-0.05);
    expect(track7d.summary.leadingPct).toBe(0);
  });

  it('omits non-headline samples (snapshot, unmatched) from Tracks', () => {
    const samples = [
      sample({ boundaryMs: RUN_A }),
      sample({
        boundaryMs: RUN_A,
        targetPrice: 72_000,
        source: 'snapshot',
        headlineEligible: false,
      }),
      sample({
        boundaryMs: RUN_A,
        targetPrice: 74_000,
        matchStatus: 'no_product',
        headlineEligible: false,
        benchmarkApr: null,
        benchmarkSettlementMs: null,
        benchmarkProductId: null,
      }),
    ];

    const { tracks } = buildEdgeTracks(samples);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.points).toHaveLength(1);
    expect(tracks[0]!.points[0]!.rowCount).toBe(1);
  });

  it('marks Track status from the newest plotted Run: active, hourly shelf, or expired', () => {
    const settlementPassed = RUN_A + 10 * 60 * 1000; // before RUN_B → expired
    const samples = [
      // Active: sampled in the newest Run
      sample({ boundaryMs: RUN_B }),
      // Ended, settlement still ahead of newest Run → migrated to hourly shelf
      sample({
        boundaryMs: RUN_A,
        ankerSettlementMs: SETTLEMENT_7D,
        benchmarkSettlementMs: SETTLEMENT_7D + 8 * HOUR_MS,
      }),
      // Ended, settlement already behind newest Run → expired
      sample({
        boundaryMs: RUN_A,
        ankerSettlementMs: settlementPassed,
        benchmarkSettlementMs: settlementPassed + HOUR_MS,
      }),
    ];

    const { tracks } = buildEdgeTracks(samples);

    const statusBySettlement = new Map(tracks.map((t) => [t.settlementMs, t.status]));
    expect(statusBySettlement.get(SETTLEMENT_3D)).toBe('active');
    expect(statusBySettlement.get(SETTLEMENT_7D)).toBe('hourlyShelf');
    expect(statusBySettlement.get(settlementPassed)).toBe('expired');
  });

  it('orders active Tracks by settlement ascending, then ended Tracks by settlement descending', () => {
    const settlementNear = RUN_A + DAY_MS;
    const settlementEndedOld = RUN_A + 10 * 60 * 1000;
    const settlementEndedRecent = RUN_A + 20 * 60 * 1000;
    const samples = [
      sample({ boundaryMs: RUN_B, ankerSettlementMs: SETTLEMENT_3D, benchmarkSettlementMs: SETTLEMENT_3D + HOUR_MS }),
      sample({ boundaryMs: RUN_B, ankerSettlementMs: settlementNear, benchmarkSettlementMs: settlementNear + HOUR_MS }),
      sample({ boundaryMs: RUN_A, ankerSettlementMs: settlementEndedOld, benchmarkSettlementMs: settlementEndedOld + HOUR_MS }),
      sample({ boundaryMs: RUN_A, ankerSettlementMs: settlementEndedRecent, benchmarkSettlementMs: settlementEndedRecent + HOUR_MS }),
    ];

    const { tracks } = buildEdgeTracks(samples);

    expect(tracks.map((t) => t.settlementMs)).toEqual([
      settlementNear,
      SETTLEMENT_3D,
      settlementEndedRecent,
      settlementEndedOld,
    ]);
  });
});
