import type { BenchmarkRun, BenchmarkSample } from './buildBenchmarkRun';

export interface RunWithSamples {
  run: BenchmarkRun;
  samples: readonly BenchmarkSample[];
}

/** Sample annotated with its Run boundary for Analytics re-aggregation. */
export interface TimestampedSample extends BenchmarkSample {
  boundaryMs: number;
}

export type InsertRunResult =
  | { outcome: 'inserted'; runId: string }
  | { outcome: 'already_exists'; runId: string };

export interface BenchmarkRunStore {
  insertRunIfAbsent(run: BenchmarkRun, samples: readonly BenchmarkSample[]): Promise<InsertRunResult>;
  /** Newest-first by boundary_ms, each with its Samples. */
  listRecentRuns(limit: number): Promise<readonly RunWithSamples[]>;
  /** Newest-first Run rows (including failed Runs with no Samples). */
  listAllRuns(): Promise<readonly BenchmarkRun[]>;
  /** All Samples with their Run boundary — Analytics / re-aggregation input. */
  listTimestampedSamples(): Promise<readonly TimestampedSample[]>;
}

interface StoredRun {
  runId: string;
  run: BenchmarkRun;
  samples: BenchmarkSample[];
}

/** In-memory store for unit tests — same idempotency contract as the Neon adapter. */
export function createMemoryBenchmarkRunStore(): BenchmarkRunStore & {
  getRun(boundaryMs: number): StoredRun | undefined;
} {
  const byBoundary = new Map<number, StoredRun>();
  let seq = 0;

  return {
    async insertRunIfAbsent(run, samples) {
      const existing = byBoundary.get(run.boundaryMs);
      if (existing) {
        return { outcome: 'already_exists', runId: existing.runId };
      }
      const runId = `mem-${++seq}`;
      byBoundary.set(run.boundaryMs, {
        runId,
        run: { ...run },
        samples: samples.map((sample) => ({ ...sample })),
      });
      return { outcome: 'inserted', runId };
    },
    async listRecentRuns(limit) {
      if (limit <= 0) return [];
      return [...byBoundary.values()]
        .sort((a, b) => b.run.boundaryMs - a.run.boundaryMs)
        .slice(0, limit)
        .map((stored) => ({
          run: { ...stored.run },
          samples: stored.samples.map((sample) => ({ ...sample })),
        }));
    },
    async listAllRuns() {
      return [...byBoundary.values()]
        .sort((a, b) => b.run.boundaryMs - a.run.boundaryMs)
        .map((stored) => ({ ...stored.run }));
    },
    async listTimestampedSamples() {
      return [...byBoundary.values()]
        .sort((a, b) => b.run.boundaryMs - a.run.boundaryMs)
        .flatMap((stored) =>
          stored.samples.map((sample) => ({
            ...sample,
            boundaryMs: stored.run.boundaryMs,
          })),
        );
    },
    getRun(boundaryMs) {
      return byBoundary.get(boundaryMs);
    },
  };
}
