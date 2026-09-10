-- Benchmark Recorder schema (ADR-0005).
-- Also applied automatically by the cron route (ensureSchema) because Marketplace
-- DATABASE_URL is sensitive and cannot be pulled via Vercel CLI for a one-shot migrate.
-- Runs are unique on boundary_ms so retried crons never double-count.

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id BIGSERIAL PRIMARY KEY,
  boundary_ms BIGINT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ok', 'snapshot_fallback', 'upstream_failure')),
  duration_ms INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'snapshot')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmark_samples (
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
);

CREATE INDEX IF NOT EXISTS benchmark_samples_run_id_idx ON benchmark_samples (run_id);
CREATE INDEX IF NOT EXISTS benchmark_samples_headline_idx
  ON benchmark_samples (headline_eligible)
  WHERE headline_eligible;
