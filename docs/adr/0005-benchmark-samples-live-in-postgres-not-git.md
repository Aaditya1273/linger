# Benchmark Samples live in Postgres, not in git

The original P1 plan had a GitHub Action cron committing JSONL edge snapshots into the repo — zero infrastructure, publicly auditable, and it kept the contribution graph green. The 2026-07-13 redesign rejected it: the Benchmark Recorder writes Runs and Benchmark Samples to Neon Postgres (Vercel Marketplace) instead, and the repo carries no data. The deciding argument is that statistics definitions will change — comparability thresholds, tenor buckets, fee bases — and only a queryable store of raw-granularity samples lets history be re-aggregated under a new definition. JSONL-in-git freezes the aggregation at capture time, buries the commit history under ~96 data commits a day, and the green-squares side effect sits badly with the protocol's no-manufactured-traction stance.

## Considered Options

- **Neon Postgres (chosen).** Real time-series queries for the Analytics page and alert rules; re-computable history; negligible volume (~3–4k rows/day) on the free tier.
- **JSONL committed to the repo (or a separate data repo).** Public auditability for free, but zero query capability and permanent history pollution; a separate repo only relocates the problem.
- **Vercel KV.** Simple writes, but time-series aggregation means hand-rolled indexes or full scans into memory.
- **Vercel Blob JSONL.** Git minus git: same frozen-aggregation dead end behind an object store.

## Consequences

- First dynamic persistence dependency in the app (connection string via Vercel env). Tests never touch it: all recorder logic lives behind pure seams (Run builder, stats aggregator) and Postgres stays dumb storage.
- Raw data is no longer public by default. Public auditability is deferred to a future export/API; the sample schema is deliberately rich enough (raw inputs, both settlement timestamps, app version) that adding it needs no migration.
