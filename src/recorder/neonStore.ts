import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { BenchmarkRun, BenchmarkRunStatus, BenchmarkSample, BenchmarkSampleSource, BenchmarkMatchStatus } from './buildBenchmarkRun';
import type { BenchmarkRunStore, InsertRunResult, RunWithSamples, TimestampedSample } from './store';

type Sql = NeonQueryFunction<false, false>;

export function createNeonBenchmarkRunStore(databaseUrl: string): BenchmarkRunStore {
  const sql = neon(databaseUrl);
  return {
    insertRunIfAbsent(run, samples) {
      return insertRunIfAbsentWithSql(sql, run, samples);
    },
    listRecentRuns(limit) {
      return listRecentRunsWithSql(sql, limit);
    },
    listAllRuns() {
      return listAllRunsWithSql(sql);
    },
    listTimestampedSamples() {
      return listTimestampedSamplesWithSql(sql);
    },
  };
}

/**
 * Idempotent write. If samples fail after the Run row is inserted, the Run is
 * deleted so a retry can complete the sweep (HTTP neon has no interactive txn).
 */
export async function insertRunIfAbsentWithSql(
  sql: Sql,
  run: BenchmarkRun,
  samples: readonly BenchmarkSample[],
): Promise<InsertRunResult> {
  const inserted = await sql`
    INSERT INTO benchmark_runs (boundary_ms, status, duration_ms, app_version, source)
    VALUES (${run.boundaryMs}, ${run.status}, ${run.durationMs}, ${run.appVersion}, ${run.source})
    ON CONFLICT (boundary_ms) DO NOTHING
    RETURNING id
  `;

  if (inserted.length === 0) {
    const existing = await sql`
      SELECT id FROM benchmark_runs WHERE boundary_ms = ${run.boundaryMs} LIMIT 1
    `;
    const runId = String(existing[0]?.id ?? '');
    return { outcome: 'already_exists', runId };
  }

  const runId = String(inserted[0]!.id);

  try {
    for (const sample of samples) {
      await sql`
        INSERT INTO benchmark_samples (
          run_id,
          target_price,
          spot,
          coupon,
          reserve,
          legs_cost,
          leg_count,
          net_apr,
          anker_settlement_ms,
          benchmark_settlement_ms,
          benchmark_apr,
          benchmark_product_id,
          match_status,
          source,
          app_version,
          headline_eligible
        ) VALUES (
          ${runId},
          ${sample.targetPrice},
          ${sample.spot},
          ${sample.coupon},
          ${sample.reserve},
          ${sample.legsCost},
          ${sample.legCount},
          ${sample.netApr},
          ${sample.ankerSettlementMs},
          ${sample.benchmarkSettlementMs},
          ${sample.benchmarkApr},
          ${sample.benchmarkProductId},
          ${sample.matchStatus},
          ${sample.source},
          ${sample.appVersion},
          ${sample.headlineEligible}
        )
      `;
    }
  } catch (error) {
    await sql`DELETE FROM benchmark_runs WHERE id = ${runId}`;
    throw error;
  }

  return { outcome: 'inserted', runId };
}

interface RunRow {
  id: string | number;
  boundary_ms: string | number;
  status: BenchmarkRunStatus;
  duration_ms: number;
  app_version: string;
  source: BenchmarkSampleSource;
}

interface SampleRow {
  run_id: string | number;
  target_price: number;
  spot: number;
  coupon: number;
  reserve: number;
  legs_cost: number;
  leg_count: number;
  net_apr: number | null;
  anker_settlement_ms: string | number;
  benchmark_settlement_ms: string | number | null;
  benchmark_apr: number | null;
  benchmark_product_id: string | null;
  match_status: BenchmarkMatchStatus;
  source: BenchmarkSampleSource;
  app_version: string;
  headline_eligible: boolean;
}

export async function listRecentRunsWithSql(sql: Sql, limit: number): Promise<readonly RunWithSamples[]> {
  if (limit <= 0) return [];

  const runRows = (await sql`
    SELECT id, boundary_ms, status, duration_ms, app_version, source
    FROM benchmark_runs
    ORDER BY boundary_ms DESC
    LIMIT ${limit}
  `) as RunRow[];

  if (runRows.length === 0) return [];

  const recent: RunWithSamples[] = [];
  for (const row of runRows) {
    const runId = String(row.id);
    const sampleRows = (await sql`
      SELECT
        run_id,
        target_price,
        spot,
        coupon,
        reserve,
        legs_cost,
        leg_count,
        net_apr,
        anker_settlement_ms,
        benchmark_settlement_ms,
        benchmark_apr,
        benchmark_product_id,
        match_status,
        source,
        app_version,
        headline_eligible
      FROM benchmark_samples
      WHERE run_id = ${runId}
      ORDER BY id ASC
    `) as SampleRow[];

    recent.push({
      run: {
        boundaryMs: Number(row.boundary_ms),
        status: row.status,
        durationMs: row.duration_ms,
        appVersion: row.app_version,
        source: row.source,
      },
      samples: sampleRows.map(mapSampleRow),
    });
  }

  return recent;
}

interface TimestampedSampleRow extends SampleRow {
  boundary_ms: string | number;
}

export async function listAllRunsWithSql(sql: Sql): Promise<readonly BenchmarkRun[]> {
  const runRows = (await sql`
    SELECT id, boundary_ms, status, duration_ms, app_version, source
    FROM benchmark_runs
    ORDER BY boundary_ms DESC
  `) as RunRow[];

  return runRows.map((row) => ({
    boundaryMs: Number(row.boundary_ms),
    status: row.status,
    durationMs: row.duration_ms,
    appVersion: row.app_version,
    source: row.source,
  }));
}

export async function listTimestampedSamplesWithSql(sql: Sql): Promise<readonly TimestampedSample[]> {
  const rows = (await sql`
    SELECT
      r.boundary_ms,
      s.run_id,
      s.target_price,
      s.spot,
      s.coupon,
      s.reserve,
      s.legs_cost,
      s.leg_count,
      s.net_apr,
      s.anker_settlement_ms,
      s.benchmark_settlement_ms,
      s.benchmark_apr,
      s.benchmark_product_id,
      s.match_status,
      s.source,
      s.app_version,
      s.headline_eligible
    FROM benchmark_samples s
    INNER JOIN benchmark_runs r ON r.id = s.run_id
    ORDER BY r.boundary_ms DESC, s.id ASC
  `) as TimestampedSampleRow[];

  return rows.map((row) => ({
    ...mapSampleRow(row),
    boundaryMs: Number(row.boundary_ms),
  }));
}

function mapSampleRow(row: SampleRow): BenchmarkSample {
  return {
    targetPrice: row.target_price,
    spot: row.spot,
    coupon: row.coupon,
    reserve: row.reserve,
    legsCost: row.legs_cost,
    legCount: row.leg_count,
    netApr: row.net_apr,
    ankerSettlementMs: Number(row.anker_settlement_ms),
    benchmarkSettlementMs:
      row.benchmark_settlement_ms === null ? null : Number(row.benchmark_settlement_ms),
    benchmarkApr: row.benchmark_apr,
    benchmarkProductId: row.benchmark_product_id,
    matchStatus: row.match_status,
    source: row.source,
    appVersion: row.app_version,
    headlineEligible: row.headline_eligible,
  };
}
