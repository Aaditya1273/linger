import { describe, expect, it } from 'vitest';
import type { BenchmarkRun, BenchmarkSample } from './buildBenchmarkRun';
import { createMemoryBenchmarkRunStore } from './store';

function sampleRun(boundaryMs: number): { run: BenchmarkRun; samples: BenchmarkSample[] } {
  return {
    run: {
      boundaryMs,
      status: 'ok',
      durationMs: 42,
      appVersion: '0.2.1',
      source: 'live',
    },
    samples: [
      {
        targetPrice: 73_500,
        spot: 73_560,
        coupon: 0.12,
        reserve: 4.5,
        legsCost: 0.38,
        legCount: 6,
        netApr: 0.41,
        ankerSettlementMs: boundaryMs + 3 * 86_400_000,
        benchmarkSettlementMs: boundaryMs + 3 * 86_400_000 + 8 * 3_600_000,
        benchmarkApr: 0.35,
        benchmarkProductId: 'binance-1',
        matchStatus: 'matched',
        source: 'live',
        appVersion: '0.2.1',
        headlineEligible: true,
      },
      {
        targetPrice: 73_000,
        spot: 73_560,
        coupon: 0.1,
        reserve: 4.4,
        legsCost: 0.4,
        legCount: 6,
        netApr: 0.3,
        ankerSettlementMs: boundaryMs + 3 * 86_400_000,
        benchmarkSettlementMs: null,
        benchmarkApr: null,
        benchmarkProductId: null,
        matchStatus: 'no_product',
        source: 'live',
        appVersion: '0.2.1',
        headlineEligible: false,
      },
    ],
  };
}

describe('BenchmarkRunStore idempotency', () => {
  it('inserts one Run and its Samples on the first write for a boundary', async () => {
    const store = createMemoryBenchmarkRunStore();
    const { run, samples } = sampleRun(Date.UTC(2026, 6, 14, 12, 0, 0));

    const result = await store.insertRunIfAbsent(run, samples);

    expect(result).toEqual({ outcome: 'inserted', runId: expect.any(String) });
    const stored = store.getRun(run.boundaryMs);
    expect(stored?.run.status).toBe('ok');
    expect(stored?.samples).toHaveLength(2);
    expect(stored?.samples.map((s) => s.targetPrice)).toEqual([73_500, 73_000]);
  });

  it('does not duplicate rows when the same boundary is written again', async () => {
    const store = createMemoryBenchmarkRunStore();
    const boundaryMs = Date.UTC(2026, 6, 14, 12, 0, 0);
    const first = sampleRun(boundaryMs);
    const second = sampleRun(boundaryMs);
    second.run.durationMs = 999;
    second.samples = [];

    const firstResult = await store.insertRunIfAbsent(first.run, first.samples);
    const secondResult = await store.insertRunIfAbsent(second.run, second.samples);

    expect(firstResult.outcome).toBe('inserted');
    expect(secondResult).toEqual({
      outcome: 'already_exists',
      runId: firstResult.outcome === 'inserted' ? firstResult.runId : undefined,
    });
    expect(store.getRun(boundaryMs)?.samples).toHaveLength(2);
    expect(store.getRun(boundaryMs)?.run.durationMs).toBe(42);
  });

  it('lists recent Runs newest-first with their Samples', async () => {
    const store = createMemoryBenchmarkRunStore();
    const older = sampleRun(Date.UTC(2026, 6, 14, 11, 45, 0));
    const newer = sampleRun(Date.UTC(2026, 6, 14, 12, 0, 0));
    await store.insertRunIfAbsent(older.run, older.samples);
    await store.insertRunIfAbsent(newer.run, newer.samples);

    const recent = await store.listRecentRuns(1);

    expect(recent).toHaveLength(1);
    expect(recent[0]?.run.boundaryMs).toBe(newer.run.boundaryMs);
    expect(recent[0]?.samples).toHaveLength(2);
  });

  it('lists timestamped Samples newest Run first for Analytics aggregation', async () => {
    const store = createMemoryBenchmarkRunStore();
    const older = sampleRun(Date.UTC(2026, 6, 14, 11, 45, 0));
    const newer = sampleRun(Date.UTC(2026, 6, 14, 12, 0, 0));
    await store.insertRunIfAbsent(older.run, older.samples);
    await store.insertRunIfAbsent(newer.run, newer.samples);

    const samples = await store.listTimestampedSamples();

    expect(samples).toHaveLength(4);
    expect(samples[0]?.boundaryMs).toBe(newer.run.boundaryMs);
    expect(samples[0]?.targetPrice).toBe(73_500);
    expect(samples[2]?.boundaryMs).toBe(older.run.boundaryMs);
  });
});
