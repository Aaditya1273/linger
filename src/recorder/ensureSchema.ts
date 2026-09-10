import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

type Sql = NeonQueryFunction<false, false>;

/**
 * Idempotent DDL — same statements as schema.sql.
 * Marketplace DATABASE_URL is sensitive and cannot be pulled via CLI, so the
 * first authorized cron/manual trigger applies the schema in-process.
 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS benchmark_runs (
  id BIGSERIAL PRIMARY KEY,
  boundary_ms BIGINT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ok', 'snapshot_fallback', 'upstream_failure')),
  duration_ms INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'snapshot')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
  `CREATE TABLE IF NOT EXISTS benchmark_samples (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES benchmark_runs (id) ON DELETE CASCADE,
  target_price DOUBLE PRECISION NOT NULL,
  spot DOUBLE PRECISION NOT NULL,
  coupon DOUBLE PRECISION NOT NULL,
  reserve DOUBLE PRECISION NOT NULL,
  legs_cost DOUBLE PRECISION NOT NULL,
  leg_count INTEGER NOT NULL,
  net_apr DOUBLE PRECISION,
  anker_settlement_ms BIGINT NOT NULL,
  benchmark_settlement_ms BIGINT,
  benchmark_apr DOUBLE PRECISION,
  benchmark_product_id TEXT,
  match_status TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'snapshot')),
  app_version TEXT NOT NULL,
  headline_eligible BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
  `CREATE INDEX IF NOT EXISTS benchmark_samples_run_id_idx ON benchmark_samples (run_id)`,
  `CREATE INDEX IF NOT EXISTS benchmark_samples_headline_idx
  ON benchmark_samples (headline_eligible)
  WHERE headline_eligible`,
] as const;

export async function ensureBenchmarkSchema(databaseUrl: string): Promise<void> {
  const sql = neon(databaseUrl);
  await ensureBenchmarkSchemaWithSql(sql);
}

export async function ensureBenchmarkSchemaWithSql(sql: Sql): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await sql.query(statement);
  }
}
