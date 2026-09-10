import { isDeterministicE2E } from '../config/runtimeModes';
import { ensureBenchmarkSchema } from './ensureSchema';
import {
  aggregateHeadlineStats,
  type HeadlineStats,
} from './aggregateHeadlineStats';
import { ANALYTICS_RECORDER_PAUSED, withinSnapshotWindow } from './analyticsSnapshot';
import { analyticsFixtureSamples } from './analyticsFixtures';
import { buildEdgeTracks, type EdgeTracks } from './buildEdgeTracks';
import { createNeonBenchmarkRunStore } from './neonStore';

export type AnalyticsStatsLoad =
  | { kind: 'ready'; stats: HeadlineStats; edgeTracks: EdgeTracks; usingFixture: boolean }
  | { kind: 'unavailable'; reason: 'not_configured' | 'load_failed' };

/**
 * Loads Samples (E2E fixture or Neon) and builds Analytics page inputs:
 * headline stats + Edge Tracks.
 */
export async function loadAnalyticsStats(): Promise<AnalyticsStatsLoad> {
  if (isDeterministicE2E()) {
    const samples = analyticsFixtureSamples();
    return {
      kind: 'ready',
      stats: aggregateHeadlineStats(samples),
      edgeTracks: buildEdgeTracks(samples),
      usingFixture: true,
    };
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return { kind: 'unavailable', reason: 'not_configured' };
  }

  try {
    await ensureBenchmarkSchema(databaseUrl);
    const store = createNeonBenchmarkRunStore(databaseUrl);
    const [allSamples, allRuns] = await Promise.all([
      store.listTimestampedSamples(),
      store.listAllRuns(),
    ]);
    // While paused, the served snapshot ends at the 6-24 death: later sweeps
    // ran against 8-04's unpriced day markets (see analyticsSnapshot.ts).
    const samples = ANALYTICS_RECORDER_PAUSED ? withinSnapshotWindow(allSamples) : allSamples;
    const runs = ANALYTICS_RECORDER_PAUSED ? withinSnapshotWindow(allRuns) : allRuns;
    return {
      kind: 'ready',
      stats: aggregateHeadlineStats({ samples, runs }),
      edgeTracks: buildEdgeTracks(samples),
      usingFixture: false,
    };
  } catch {
    return { kind: 'unavailable', reason: 'load_failed' };
  }
}
