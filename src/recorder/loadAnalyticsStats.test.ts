import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggregateHeadlineStats } from './aggregateHeadlineStats';
import {
  analyticsFixtureSamples,
  FIXTURE_SETTLEMENT_1D_MS,
  FIXTURE_SETTLEMENT_3D_MS,
  FIXTURE_SETTLEMENT_7D_MS,
} from './analyticsFixtures';
import { buildEdgeTracks } from './buildEdgeTracks';

describe('loadAnalyticsStats', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('aggregates fixture Samples when fixture data mode is on', async () => {
    vi.stubEnv('ANKER_DETERMINISTIC_E2E', 'true');
    const { loadAnalyticsStats } = await import('./loadAnalyticsStats');

    const result = await loadAnalyticsStats();
    const samples = analyticsFixtureSamples();

    expect(result).toEqual({
      kind: 'ready',
      usingFixture: true,
      stats: aggregateHeadlineStats(samples),
      edgeTracks: buildEdgeTracks(samples),
    });
    if (result.kind === 'ready') {
      expect(result.stats.sampleCount).toBe(6);
      expect(result.stats.leadingPct).toBeCloseTo(5 / 6);
      expect(result.stats.medianEdgePp).toBeCloseTo(0.075);
      expect(result.stats.currentLeadingStreak).toBe(2);
      expect(result.stats.ladderCoverage).toBeCloseTo(6 / 7);
      expect(result.edgeTracks.tracks.map((t) => t.settlementMs)).toEqual([
        FIXTURE_SETTLEMENT_3D_MS,
        FIXTURE_SETTLEMENT_7D_MS,
        FIXTURE_SETTLEMENT_1D_MS,
      ]);
      expect(result.edgeTracks.tracks.map((t) => t.status)).toEqual([
        'active',
        'active',
        'hourlyShelf',
      ]);
      expect(result.edgeTracks.tracks[2]!.points[0]!.medianEdgePp).toBeCloseTo(-0.05);
    }
  });

  it('reports not_configured when Neon is absent outside fixture mode', async () => {
    vi.stubEnv('ANKER_DETERMINISTIC_E2E', 'false');
    vi.stubEnv('NEXT_PUBLIC_ANKER_DETERMINISTIC_E2E', 'false');
    vi.stubEnv('DATABASE_URL', '');
    const { loadAnalyticsStats } = await import('./loadAnalyticsStats');

    await expect(loadAnalyticsStats()).resolves.toEqual({
      kind: 'unavailable',
      reason: 'not_configured',
    });
  });
});
