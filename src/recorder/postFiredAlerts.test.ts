import { describe, expect, it, vi } from 'vitest';
import type { FiredAlert } from './evaluateAlertRules';
import {
  createMemoryAlertIssuePoster,
  postFiredAlerts,
  type AlertIssuePoster,
} from './postFiredAlerts';

function alert(type: FiredAlert['type'], overrides: Partial<FiredAlert> = {}): FiredAlert {
  return {
    type,
    marker: `alert-type:${type}`,
    title: `title:${type}`,
    body: `body for ${type}\n\n<!-- alert-type:${type} -->`,
    ...overrides,
  };
}

describe('postFiredAlerts', () => {
  it('creates a needs-triage Issue for each fired alert when none is open', async () => {
    const poster = createMemoryAlertIssuePoster();
    const fired = [alert('upstream_failure'), alert('low_matched_rate')];

    await postFiredAlerts({ alerts: fired, poster });

    expect(poster.created).toEqual([
      {
        title: 'title:upstream_failure',
        body: expect.stringContaining('alert-type:upstream_failure'),
        labels: ['needs-triage'],
      },
      {
        title: 'title:low_matched_rate',
        body: expect.stringContaining('alert-type:low_matched_rate'),
        labels: ['needs-triage'],
      },
    ]);
  });

  it('suppresses creation when an open Issue of the same alert type already exists', async () => {
    const poster = createMemoryAlertIssuePoster();
    poster.openMarkers.add('alert-type:upstream_failure');

    await postFiredAlerts({
      alerts: [alert('upstream_failure'), alert('snapshot_fallback')],
      poster,
    });

    expect(poster.created).toHaveLength(1);
    expect(poster.created[0]?.title).toBe('title:snapshot_fallback');
  });

  it('logs posting failures and never throws', async () => {
    const log = vi.fn();
    const poster: AlertIssuePoster = {
      async findOpenAlertIssue() {
        return null;
      },
      async createAlertIssue() {
        throw new Error('GitHub 502');
      },
    };

    await expect(
      postFiredAlerts({
        alerts: [alert('upstream_failure')],
        poster,
        log,
      }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('upstream_failure'),
      expect.any(Error),
    );
  });

  it('continues posting remaining alerts after one failure', async () => {
    const created: string[] = [];
    const poster: AlertIssuePoster = {
      async findOpenAlertIssue() {
        return null;
      },
      async createAlertIssue(input) {
        if (input.title.includes('upstream_failure')) {
          throw new Error('boom');
        }
        created.push(input.title);
      },
    };

    await postFiredAlerts({
      alerts: [alert('upstream_failure'), alert('snapshot_fallback')],
      poster,
      log: () => {},
    });

    expect(created).toEqual(['title:snapshot_fallback']);
  });
});
