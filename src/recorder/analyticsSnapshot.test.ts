import { describe, expect, it } from 'vitest';
import { ANALYTICS_SNAPSHOT_WINDOW_END_MS, withinSnapshotWindow } from './analyticsSnapshot';

describe('withinSnapshotWindow', () => {
  it('keeps rows strictly before the 6-24 death and drops the 8-04 tail', () => {
    const before = { boundaryMs: ANALYTICS_SNAPSHOT_WINDOW_END_MS - 1 };
    const atBound = { boundaryMs: ANALYTICS_SNAPSHOT_WINDOW_END_MS };
    const after = { boundaryMs: ANALYTICS_SNAPSHOT_WINDOW_END_MS + 15 * 60_000 };

    expect(withinSnapshotWindow([before, atBound, after])).toEqual([before]);
  });

  it('bounds the window at the ADR-0012 death date', () => {
    expect(new Date(ANALYTICS_SNAPSHOT_WINDOW_END_MS).toISOString()).toBe(
      '2026-08-05T00:00:00.000Z',
    );
  });
});
