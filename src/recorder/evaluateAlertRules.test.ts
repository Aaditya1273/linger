import { describe, expect, it } from 'vitest';
import type { BenchmarkRun, BenchmarkSample } from './buildBenchmarkRun';
import { evaluateAlertRules, type AlertType, type RunWithSamples } from './evaluateAlertRules';

const BOUNDARY = Date.UTC(2026, 6, 14, 12, 0, 0);
const RUN_MS = 15 * 60 * 1000;

function run(
  overrides: Partial<BenchmarkRun> & Pick<BenchmarkRun, 'boundaryMs'> = {
    boundaryMs: BOUNDARY,
  },
): BenchmarkRun {
  return {
    status: 'ok',
    durationMs: 40,
    appVersion: '0.2.1',
    source: 'live',
    ...overrides,
  };
}

function sample(overrides: Partial<BenchmarkSample> = {}): BenchmarkSample {
  return {
    targetPrice: 73_500,
    spot: 73_560,
    coupon: 0.12,
    reserve: 4.5,
    legsCost: 0.38,
    legCount: 6,
    netApr: 0.45,
    ankerSettlementMs: BOUNDARY + 3 * 86_400_000,
    benchmarkSettlementMs: BOUNDARY + 3 * 86_400_000 + 8 * 3_600_000,
    benchmarkApr: 0.35,
    benchmarkProductId: 'binance-1',
    matchStatus: 'matched',
    source: 'live',
    appVersion: '0.2.1',
    headlineEligible: true,
    ...overrides,
  };
}

function runWithSamples(
  boundaryMs: number,
  opts: {
    status?: BenchmarkRun['status'];
    source?: BenchmarkRun['source'];
    samples?: BenchmarkSample[];
  } = {},
): RunWithSamples {
  const status = opts.status ?? 'ok';
  const source = opts.source ?? (status === 'snapshot_fallback' ? 'snapshot' : 'live');
  return {
    run: run({
      boundaryMs,
      status,
      source,
    }),
    samples: opts.samples ?? [sample()],
  };
}

function typesOf(alerts: { type: AlertType }[]): AlertType[] {
  return alerts.map((a) => a.type);
}

/** One matched row with given Edge (netApr − benchmarkApr) in percentage points. */
function matchedWithEdge(edgePp: number): BenchmarkSample {
  return sample({ netApr: 0.35 + edgePp, benchmarkApr: 0.35, matchStatus: 'matched' });
}

describe('evaluateAlertRules', () => {
  it('stays quiet on a healthy Run', () => {
    const current = runWithSamples(BOUNDARY, {
      samples: [matchedWithEdge(0.1), matchedWithEdge(0.05)],
    });

    expect(evaluateAlertRules({ current, recent: [] })).toEqual([]);
  });

  it('fires upstream_failure when the Run failed', () => {
    const current = runWithSamples(BOUNDARY, { status: 'upstream_failure', samples: [] });

    const alerts = evaluateAlertRules({ current, recent: [] });

    expect(typesOf(alerts)).toEqual(['upstream_failure']);
    expect(alerts[0]?.marker).toBe('alert-type:upstream_failure');
  });

  it('fires snapshot_fallback when day browse degraded to Snapshot', () => {
    const current = runWithSamples(BOUNDARY, {
      status: 'snapshot_fallback',
      samples: [sample({ source: 'snapshot', headlineEligible: false })],
    });

    expect(typesOf(evaluateAlertRules({ current, recent: [] }))).toEqual(['snapshot_fallback']);
  });

  it('fires low_matched_rate when matched rate drops below 50%', () => {
    const current = runWithSamples(BOUNDARY, {
      samples: [
        sample({ matchStatus: 'matched' }),
        sample({ targetPrice: 73_000, matchStatus: 'no_product', netApr: 0.3, benchmarkApr: null }),
        sample({
          targetPrice: 72_500,
          matchStatus: 'no_comparable_product',
          netApr: 0.28,
          benchmarkApr: null,
        }),
      ],
    });

    // 1/3 ≈ 33% < 50%
    expect(typesOf(evaluateAlertRules({ current, recent: [] }))).toEqual(['low_matched_rate']);
  });

  it('stays quiet when matched rate is at least 50%', () => {
    const current = runWithSamples(BOUNDARY, {
      samples: [
        sample({ matchStatus: 'matched' }),
        sample({ targetPrice: 73_000, matchStatus: 'no_product', netApr: 0.3, benchmarkApr: null }),
      ],
    });

    // 1/2 = 50%
    expect(evaluateAlertRules({ current, recent: [] })).toEqual([]);
  });

  it('does not fire low_matched_rate on an empty Sample list', () => {
    const current = runWithSamples(BOUNDARY, { samples: [] });

    expect(evaluateAlertRules({ current, recent: [] })).toEqual([]);
  });

  it('does not fire negative_median_edge_streak after only 7 consecutive negative Runs', () => {
    const current = runWithSamples(BOUNDARY, { samples: [matchedWithEdge(-0.02)] });
    const recent = Array.from({ length: 6 }, (_, i) =>
      runWithSamples(BOUNDARY - (i + 1) * RUN_MS, { samples: [matchedWithEdge(-0.01)] }),
    );

    expect(typesOf(evaluateAlertRules({ current, recent }))).toEqual([]);
  });

  it('fires negative_median_edge_streak after 8 consecutive qualifying negative Runs', () => {
    const current = runWithSamples(BOUNDARY, { samples: [matchedWithEdge(-0.02)] });
    const recent = Array.from({ length: 7 }, (_, i) =>
      runWithSamples(BOUNDARY - (i + 1) * RUN_MS, { samples: [matchedWithEdge(-0.01)] }),
    );

    expect(typesOf(evaluateAlertRules({ current, recent }))).toEqual([
      'negative_median_edge_streak',
    ]);
  });

  it('breaks the negative-Edge streak when a degraded Run interrupts', () => {
    const current = runWithSamples(BOUNDARY, { samples: [matchedWithEdge(-0.02)] });
    const recent = [
      runWithSamples(BOUNDARY - RUN_MS, { samples: [matchedWithEdge(-0.01)] }),
      runWithSamples(BOUNDARY - 2 * RUN_MS, { status: 'snapshot_fallback', samples: [matchedWithEdge(-0.01)] }),
      ...Array.from({ length: 6 }, (_, i) =>
        runWithSamples(BOUNDARY - (i + 3) * RUN_MS, { samples: [matchedWithEdge(-0.01)] }),
      ),
    ];

    expect(typesOf(evaluateAlertRules({ current, recent }))).toEqual([]);
  });

  it('breaks the streak when a qualifying Run has non-negative median Edge', () => {
    const current = runWithSamples(BOUNDARY, { samples: [matchedWithEdge(-0.02)] });
    const recent = [
      ...Array.from({ length: 3 }, (_, i) =>
        runWithSamples(BOUNDARY - (i + 1) * RUN_MS, { samples: [matchedWithEdge(-0.01)] }),
      ),
      runWithSamples(BOUNDARY - 4 * RUN_MS, { samples: [matchedWithEdge(0.01)] }),
      ...Array.from({ length: 4 }, (_, i) =>
        runWithSamples(BOUNDARY - (i + 5) * RUN_MS, { samples: [matchedWithEdge(-0.01)] }),
      ),
    ];

    expect(typesOf(evaluateAlertRules({ current, recent }))).toEqual([]);
  });
});
