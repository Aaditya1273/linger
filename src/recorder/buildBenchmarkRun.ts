import {
  findBinanceDualInvestmentMatch,
  type BinanceDualInvestmentProduct,
} from '../deepbook/binanceDualInvestment';
import { buildIndicativeDualInvestmentQuote } from '../hooks/useDualInvestmentScan';
import {
  buildDualInvestmentScanInputs,
  scanQuoteDisplayMetrics,
} from '../products/dualInvestmentScan';
import type { OracleMarket } from '../products/types';

/** Same principal the product page browse ladder uses (`DEFAULT_PRINCIPAL`). */
const BROWSE_PRINCIPAL = 500;

/** Fifteen-minute cron cadence — Run timestamps align to these walls. */
export const RUN_BOUNDARY_MS = 15 * 60 * 1000;

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

export function alignToRunBoundary(nowMs: number): number {
  return Math.floor(nowMs / RUN_BOUNDARY_MS) * RUN_BOUNDARY_MS;
}

/**
 * Pure sampling seam: markets + Binance products + spot + now + app version → Run + Samples.
 * No network, no database — the product-page quote + matcher path, frozen for recording.
 */
export function buildBenchmarkRun(input: {
  markets: readonly OracleMarket[];
  binanceProducts: readonly BinanceDualInvestmentProduct[];
  spot: number;
  nowMs: number;
  appVersion: string;
  source?: BenchmarkSampleSource;
  upstreamFailed?: boolean;
  principal?: number;
  durationMs?: number;
}): { run: BenchmarkRun; samples: BenchmarkSample[] } {
  const source = input.source ?? 'live';
  const boundaryMs = alignToRunBoundary(input.nowMs);
  const durationMs = input.durationMs ?? 0;

  if (input.upstreamFailed) {
    return {
      run: {
        boundaryMs,
        status: 'upstream_failure',
        durationMs,
        appVersion: input.appVersion,
        source,
      },
      samples: [],
    };
  }

  const status: BenchmarkRunStatus = source === 'snapshot' ? 'snapshot_fallback' : 'ok';
  const principal = input.principal ?? BROWSE_PRINCIPAL;
  const samples: BenchmarkSample[] = [];

  for (const market of input.markets) {
    const scanInputs = buildDualInvestmentScanInputs({
      market,
      principal,
    });

    for (const productInput of scanInputs) {
      let quote;
      try {
        quote = buildIndicativeDualInvestmentQuote({
          market,
          productInput,
          nowMs: input.nowMs,
        });
      } catch {
        continue;
      }

      const metrics = scanQuoteDisplayMetrics({ quote, nowMs: input.nowMs });
      // Scope: day-shelf rows that display APR + Benchmark (showApr requires ≥1d remaining).
      if (!metrics.showApr || metrics.apr === null) continue;

      const match = findBinanceDualInvestmentMatch({
        products: input.binanceProducts,
        targetPrice: productInput.targetPrice,
        settlementTimeMs: market.expiryMs,
        nowMs: input.nowMs,
      });

      let matchStatus: BenchmarkMatchStatus;
      let benchmarkSettlementMs: number | null = null;
      let benchmarkApr: number | null = null;
      let benchmarkProductId: string | null = null;

      if (match.kind === 'matched') {
        benchmarkSettlementMs = match.product.settleTimeMs;
        benchmarkProductId = match.product.id;
        if (match.product.apr === null) {
          matchStatus = 'apr_unavailable';
          benchmarkApr = null;
        } else {
          matchStatus = 'matched';
          benchmarkApr = match.product.apr;
        }
      } else {
        matchStatus = match.kind;
      }

      const headlineEligible =
        status === 'ok' && source === 'live' && matchStatus === 'matched' && metrics.apr !== null;

      samples.push({
        targetPrice: productInput.targetPrice,
        spot: input.spot,
        coupon: quote.coupon,
        reserve: quote.reserve,
        legsCost: quote.totalLegCost,
        legCount: quote.legs.length,
        netApr: metrics.apr,
        ankerSettlementMs: market.expiryMs,
        benchmarkSettlementMs,
        benchmarkApr,
        benchmarkProductId,
        matchStatus,
        source,
        appVersion: input.appVersion,
        headlineEligible,
      });
    }
  }

  return {
    run: {
      boundaryMs,
      status,
      durationMs,
      appVersion: input.appVersion,
      source,
    },
    samples,
  };
}
