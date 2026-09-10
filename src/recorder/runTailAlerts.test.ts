import { describe, expect, it, vi } from 'vitest';
import type { BenchmarkRun, BenchmarkSample } from './buildBenchmarkRun';
import { runTailAlerts } from './executeBenchmarkSweep';
import { createMemoryAlertIssuePoster } from './postFiredAlerts';
import { createMemoryBenchmarkRunStore } from './store';

const BOUNDARY = Date.UTC(2026, 6, 14, 12, 0, 0);
const RUN_MS = 15 * 60 * 1000;

function okRun(boundaryMs: number, edgePp: number): {
  run: BenchmarkRun;
  samples: BenchmarkSample[];
} {
  return {
    run: {
      boundaryMs,
      status: 'ok',
      durationMs: 40,
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
        netApr: 0.35 + edgePp,
        ankerSettlementMs: boundaryMs + 3 * 86_400_000,
        benchmarkSettlementMs: boundaryMs + 3 * 86_400_000 + 8 * 3_600_000,
        benchmarkApr: 0.35,
        benchmarkProductId: 'binance-1',
        matchStatus: 'matched',
        source: 'live',
        appVersion: '0.2.1',
        headlineEligible: true,
      },
    ],
  };
}

describe('runTailAlerts', () => {
  it('opens a GitHub Issue when a rule fires after persist', async () => {
    const store = createMemoryBenchmarkRunStore();
    const poster = createMemoryAlertIssuePoster();
    const current = {
      run: {
        boundaryMs: BOUNDARY,
        status: 'upstream_failure' as const,
        durationMs: 10,
        appVersion: '0.2.1',
        source: 'live' as const,
      },
      samples: [] as BenchmarkSample[],
    };
    await store.insertRunIfAbsent(current.run, current.samples);

    await runTailAlerts({ store, current, alertPoster: poster });

    expect(poster.created).toHaveLength(1);
    expect(poster.created[0]?.labels).toEqual(['needs-triage']);
    expect(poster.created[0]?.body).toContain('alert-type:upstream_failure');
  });

  it('fires the streak alert using stored prior Runs', async () => {
    const store = createMemoryBenchmarkRunStore();
    const poster = createMemoryAlertIssuePoster();

    for (let i = 7; i >= 1; i -= 1) {
      const prior = okRun(BOUNDARY - i * RUN_MS, -0.01);
      await store.insertRunIfAbsent(prior.run, prior.samples);
    }
    const current = okRun(BOUNDARY, -0.02);
    await store.insertRunIfAbsent(current.run, current.samples);

    await runTailAlerts({ store, current, alertPoster: poster });

    expect(poster.created.map((c) => c.title)).toEqual([
      'Benchmark Recorder: median Edge negative for 8 consecutive Runs',
    ]);
  });

  it('logs and swallows listRecentRuns failures so persistence stays intact', async () => {
    const log = vi.fn();
    const poster = createMemoryAlertIssuePoster();
    const store = {
      async insertRunIfAbsent() {
        return { outcome: 'inserted' as const, runId: 'x' };
      },
      async listRecentRuns() {
        throw new Error('db down');
      },
      async listAllRuns() {
        return [];
      },
      async listTimestampedSamples() {
        return [];
      },
    };
    const current = okRun(BOUNDARY, 0.1);

    await expect(
      runTailAlerts({ store, current, alertPoster: poster, log }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      'Benchmark Recorder alert evaluation failed',
      expect.any(Error),
    );
    expect(poster.created).toHaveLength(0);
  });

  it('does nothing when no alert poster is configured', async () => {
    const store = createMemoryBenchmarkRunStore();
    const current = {
      run: {
        boundaryMs: BOUNDARY,
        status: 'upstream_failure' as const,
        durationMs: 10,
        appVersion: '0.2.1',
        source: 'live' as const,
      },
      samples: [] as BenchmarkSample[],
    };
    await store.insertRunIfAbsent(current.run, current.samples);

    await expect(runTailAlerts({ store, current })).resolves.toBeUndefined();
  });
});
