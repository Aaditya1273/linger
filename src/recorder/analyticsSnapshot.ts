/**
 * Analytics snapshot mode — the Benchmark Recorder is paused (ADR-0013).
 *
 * The 8-04 Predict deployment runs hourly cadence only: with no day shelf
 * there is no ladder row for the matcher to pair against Binance's day-scale
 * products, and an empty sweep would still insert a Run — zero headline
 * samples snaps the leading-streak stat to 0 and the alert rules can fire
 * on it. Stored Samples stay untouched in Neon; the Analytics page serves
 * them as a closed observation window.
 *
 * Flip to false — and restore the vercel.json cron entry — when day-scale
 * markets return.
 */
export const ANALYTICS_RECORDER_PAUSED = true;

/**
 * Archive bound: the 6-24 deployment died 2026-08-05 (ADR-0012), but the cron
 * kept sweeping until 2026-08-09 against the 8-04 deployment's unpriced day
 * markets, recording absurd edges (hundreds of pts). Those rows stay in Neon;
 * the served snapshot excludes them. Tracks are keyed by settlement instant
 * only, so a 6-24 and an 8-04 market sharing a settlement merge into one
 * Track — this time bound is the only clean separator between deployments.
 */
export const ANALYTICS_SNAPSHOT_WINDOW_END_MS = Date.UTC(2026, 7, 5);

/** Display-layer window cut: Samples and Runs at/after the bound are excluded
 * from the served snapshot (stored history is untouched). Runs must be
 * filtered too — an ok Run past the bound with no surviving headline samples
 * would zero the leading-streak stat. */
export function withinSnapshotWindow<T extends { boundaryMs: number }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.boundaryMs < ANALYTICS_SNAPSHOT_WINDOW_END_MS);
}
