/**
 * Benchmark Recorder vocabulary.
 *
 * These types describe one recorded comparison between an Anker quote and its
 * benchmark. They are the schema the Neon store, the Edge Tracks, the headline
 * aggregation, and the Analytics page all speak, so they outlive any particular
 * venue — they survived the Sui→Somnia port unchanged.
 *
 * ## Why the sweep builder is gone
 *
 * The Predict-coupled `buildBenchmarkRun()` function that used to live here
 * scanned a day-scale ladder and paired each rung with a Binance product.
 * DreamDEX Shannon has no day shelf (max tenor ~2.7h) and Binance Dual
 * Investment is day-scale, so there is nothing to pair — the exact dead-end
 * ADR-0013 already recorded on Sui. Recording therefore stays paused
 * (`ANALYTICS_RECORDER_PAUSED`) and Analytics serves the stored samples as a
 * closed observation window. The types stay because the archive is still read.
 */

export type BenchmarkRunStatus = 'ok' | 'snapshot_fallback' | 'upstream_failure';
export type BenchmarkSampleSource = 'live' | 'snapshot';
export type BenchmarkMatchStatus =
  | 'matched'
  | 'no_product'
  | 'no_comparable_product'
  | 'apr_unavailable';

export interface BenchmarkRun {
  boundaryMs: number;
  status: BenchmarkRunStatus;
  /** Filled by the orchestrator; pure builder leaves 0. */
  durationMs: number;
  appVersion: string;
  source: BenchmarkSampleSource;
}

export interface BenchmarkSample {
  targetPrice: number;
  spot: number;
  coupon: number;
  reserve: number;
  legsCost: number;
  legCount: number;
  netApr: number | null;
  ankerSettlementMs: number;
  benchmarkSettlementMs: number | null;
  benchmarkApr: number | null;
  benchmarkProductId: string | null;
  matchStatus: BenchmarkMatchStatus;
  source: BenchmarkSampleSource;
  appVersion: string;
  /** Live-source matched samples only; degraded Runs never set this. */
  headlineEligible: boolean;
}
