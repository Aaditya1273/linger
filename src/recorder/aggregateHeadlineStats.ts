import { DAY_MS } from '../products/tenorMarkets';
import type { BenchmarkRun, BenchmarkSample } from './buildBenchmarkRun';
import { medianEdgePp, sampleEdgePp } from './evaluateAlertRules';
import type { TimestampedSample } from './store';

export type { TimestampedSample };

export type TenorBucketId = '1d' | '2d' | '3d' | '7d' | '14d';

export interface TenorBucketStats {
  bucket: TenorBucketId;
  sampleCount: number;
  leadingPct: number | null;
  medianEdgePp: number | null;
}

export interface HeadlineStats {
  /** Live-source matched samples only. */
  sampleCount: number;
  /** Fraction of headline samples with Edge > 0. */
  leadingPct: number | null;
  /** Median Edge (pp) over headline samples. */
  medianEdgePp: number | null;
  /** Consecutive newest ok Runs whose headline median Edge is positive. */
  currentLeadingStreak: number;
  /**
   * Matched / all samples — includes snapshot-fallback and unmatched rows
   * so ladder gaps stay visible. Failed Runs contribute no Samples.
   */
  ladderCoverage: number | null;
  /** Earliest Run boundary among the input samples (or runs when provided). */
  sampleStartMs: number | null;
  tenorBuckets: readonly TenorBucketStats[];
}

const TENOR_BUCKET_ORDER: readonly TenorBucketId[] = ['1d', '2d', '3d', '7d', '14d'];

export interface AggregateHeadlineStatsInput {
  samples: readonly TimestampedSample[];
  /** Newest-first optional; when present, streak breaks on non-ok Runs. */
  runs?: readonly Pick<BenchmarkRun, 'boundaryMs' | 'status'>[];
}

/**
 * Pure stats aggregator: Samples in → headline figures out.
 * Headline cards use `headlineEligible` only; ladder coverage uses every sample.
 */
export function aggregateHeadlineStats(
  samplesOrInput: readonly TimestampedSample[] | AggregateHeadlineStatsInput,
): HeadlineStats {
  const input =
    'samples' in samplesOrInput && !Array.isArray(samplesOrInput)
      ? samplesOrInput
      : { samples: samplesOrInput as readonly TimestampedSample[] };
  const { samples, runs } = input;

  if (samples.length === 0 && (!runs || runs.length === 0)) {
    return {
      sampleCount: 0,
      leadingPct: null,
      medianEdgePp: null,
      currentLeadingStreak: 0,
      ladderCoverage: null,
      sampleStartMs: null,
      tenorBuckets: [],
    };
  }

  const headline = samples.filter((s) => s.headlineEligible);
  const leading = headline.filter(isLeadingSample);
  const matched = samples.filter((s) => s.matchStatus === 'matched').length;
  const sampleStartCandidates = [
    ...samples.map((s) => s.boundaryMs),
    ...(runs ?? []).map((r) => r.boundaryMs),
  ];

  return {
    sampleCount: headline.length,
    leadingPct: headline.length === 0 ? null : leading.length / headline.length,
    medianEdgePp: medianEdgePp(headline),
    currentLeadingStreak: leadingStreakRuns(samples, runs),
    ladderCoverage: samples.length === 0 ? null : matched / samples.length,
    sampleStartMs:
      sampleStartCandidates.length === 0 ? null : Math.min(...sampleStartCandidates),
    tenorBuckets: bucketByTenor(headline),
  };
}

export function remainingTenorBucket(sample: TimestampedSample): TenorBucketId {
  const remainingMs = sample.ankerSettlementMs - sample.boundaryMs;
  const days = remainingMs / DAY_MS;
  if (days < 2) return '1d';
  if (days < 3) return '2d';
  if (days < 7) return '3d';
  if (days < 14) return '7d';
  return '14d';
}

function isLeadingSample(sample: BenchmarkSample): boolean {
  const edge = sampleEdgePp(sample);
  return edge !== null && edge > 0;
}

function leadingStreakRuns(
  samples: readonly TimestampedSample[],
  runs: AggregateHeadlineStatsInput['runs'],
): number {
  if (runs && runs.length > 0) {
    const sorted = [...runs].sort((a, b) => b.boundaryMs - a.boundaryMs);
    let streak = 0;
    for (const run of sorted) {
      if (run.status !== 'ok') break;
      const headline = samples.filter((s) => s.boundaryMs === run.boundaryMs && s.headlineEligible);
      const median = medianEdgePp(headline);
      if (median === null || median <= 0) break;
      streak += 1;
    }
    return streak;
  }

  const byBoundary = new Map<number, TimestampedSample[]>();
  for (const sample of samples) {
    const group = byBoundary.get(sample.boundaryMs);
    if (group) group.push(sample);
    else byBoundary.set(sample.boundaryMs, [sample]);
  }

  const boundaries = [...byBoundary.keys()].sort((a, b) => b - a);
  let streak = 0;
  for (const boundaryMs of boundaries) {
    const headline = byBoundary.get(boundaryMs)!.filter((s) => s.headlineEligible);
    const median = medianEdgePp(headline);
    if (median === null || median <= 0) break;
    streak += 1;
  }
  return streak;
}

function bucketByTenor(headline: readonly TimestampedSample[]): TenorBucketStats[] {
  const groups = new Map<TenorBucketId, TimestampedSample[]>();
  for (const sample of headline) {
    const bucket = remainingTenorBucket(sample);
    const group = groups.get(bucket);
    if (group) group.push(sample);
    else groups.set(bucket, [sample]);
  }

  return TENOR_BUCKET_ORDER.filter((bucket) => groups.has(bucket)).map((bucket) => {
    const group = groups.get(bucket)!;
    const leading = group.filter(isLeadingSample);
    return {
      bucket,
      sampleCount: group.length,
      leadingPct: group.length === 0 ? null : leading.length / group.length,
      medianEdgePp: medianEdgePp(group),
    };
  });
}
