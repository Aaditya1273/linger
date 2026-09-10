import type { BenchmarkRun, BenchmarkSample } from './buildBenchmarkRun';
import type { RunWithSamples } from './store';

export type { RunWithSamples };

export type AlertType =
  | 'upstream_failure'
  | 'snapshot_fallback'
  | 'low_matched_rate'
  | 'negative_median_edge_streak';

export interface FiredAlert {
  type: AlertType;
  /** Stable marker embedded in Issue body for dedupe lookups. */
  marker: string;
  title: string;
  body: string;
}

/** Consecutive ok Runs with negative median Edge required to fire the streak alert. */
export const NEGATIVE_EDGE_STREAK_REQUIRED = 8;
const LOW_MATCHED_RATE_THRESHOLD = 0.5;

const ALERT_COPY: Record<
  AlertType,
  { title: string; summary: string }
> = {
  upstream_failure: {
    title: 'Benchmark Recorder: Run failed (upstream unreachable)',
    summary: 'A Recorder Run failed because Predict or Binance was unreachable.',
  },
  snapshot_fallback: {
    title: 'Benchmark Recorder: day browse degraded to Snapshot',
    summary: 'A Recorder Run fell back to the Snapshot photograph instead of live day browse.',
  },
  low_matched_rate: {
    title: 'Benchmark Recorder: matched rate below 50%',
    summary: 'Matched Benchmark rate for this Run dropped below 50%.',
  },
  negative_median_edge_streak: {
    title: 'Benchmark Recorder: median Edge negative for 8 consecutive Runs',
    summary: 'Median Edge has been negative across 8 consecutive qualifying (ok) Runs.',
  },
};

export function alertMarker(type: AlertType): string {
  return `alert-type:${type}`;
}

/** Edge in percentage points; defined only for matched rows with both APRs. */
export function sampleEdgePp(sample: BenchmarkSample): number | null {
  if (sample.matchStatus !== 'matched') return null;
  if (sample.netApr === null || sample.benchmarkApr === null) return null;
  return sample.netApr - sample.benchmarkApr;
}

export function matchedRate(samples: readonly BenchmarkSample[]): number | null {
  if (samples.length === 0) return null;
  const matched = samples.filter((s) => s.matchStatus === 'matched').length;
  return matched / samples.length;
}

/** Median of defined Edges; null when the Run has no Edge observations. */
export function medianEdgePp(samples: readonly BenchmarkSample[]): number | null {
  const edges = samples
    .map(sampleEdgePp)
    .filter((edge): edge is number => edge !== null)
    .sort((a, b) => a - b);
  if (edges.length === 0) return null;
  const mid = Math.floor(edges.length / 2);
  if (edges.length % 2 === 1) return edges[mid]!;
  return (edges[mid - 1]! + edges[mid]!) / 2;
}

function fire(type: AlertType, detailLines: string[]): FiredAlert {
  const copy = ALERT_COPY[type];
  const marker = alertMarker(type);
  return {
    type,
    marker,
    title: copy.title,
    body: [
      copy.summary,
      '',
      ...detailLines,
      '',
      `<!-- ${marker} -->`,
    ].join('\n'),
  };
}

/**
 * Pure alert-rule seam: recent Runs/Samples in → fired alerts out.
 * No network. Callers supply `current` (just finished) and `recent` prior Runs
 * newest-first by boundary.
 */
export function evaluateAlertRules(input: {
  current: RunWithSamples;
  recent: readonly RunWithSamples[];
}): FiredAlert[] {
  const { current, recent } = input;
  const fired: FiredAlert[] = [];

  if (current.run.status === 'upstream_failure') {
    fired.push(
      fire('upstream_failure', [
        `- boundaryMs: ${current.run.boundaryMs}`,
        `- status: ${current.run.status}`,
      ]),
    );
  }

  if (current.run.status === 'snapshot_fallback') {
    fired.push(
      fire('snapshot_fallback', [
        `- boundaryMs: ${current.run.boundaryMs}`,
        `- source: ${current.run.source}`,
      ]),
    );
  }

  const rate = matchedRate(current.samples);
  if (rate !== null && rate < LOW_MATCHED_RATE_THRESHOLD) {
    const matched = current.samples.filter((s) => s.matchStatus === 'matched').length;
    fired.push(
      fire('low_matched_rate', [
        `- boundaryMs: ${current.run.boundaryMs}`,
        `- matched: ${matched} / ${current.samples.length} (${(rate * 100).toFixed(1)}%)`,
      ]),
    );
  }

  if (hasNegativeMedianEdgeStreak(current, recent)) {
    fired.push(
      fire('negative_median_edge_streak', [
        `- current boundaryMs: ${current.run.boundaryMs}`,
        `- required consecutive ok Runs: ${NEGATIVE_EDGE_STREAK_REQUIRED}`,
      ]),
    );
  }

  return fired;
}

function hasNegativeMedianEdgeStreak(
  current: RunWithSamples,
  recent: readonly RunWithSamples[],
): boolean {
  const sequence = [current, ...recent];
  let streak = 0;

  for (const snap of sequence) {
    if (snap.run.status !== 'ok') break;
    const median = medianEdgePp(snap.samples);
    if (median === null || median >= 0) break;
    streak += 1;
    if (streak >= NEGATIVE_EDGE_STREAK_REQUIRED) return true;
  }

  return false;
}
