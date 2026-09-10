import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_RECORDER_PAUSED } from '../../../../src/recorder/analyticsSnapshot';
import { authorizeCronRequest } from '../../../../src/recorder/cronAuth';
import { GET } from './route';

// Route handler auth is the thin adapter; reuse the pure seam with Request-shaped headers.
describe('GET /api/cron/benchmark-recorder auth', () => {
  it('rejects requests without the cron secret', () => {
    expect(
      authorizeCronRequest({
        authorizationHeader: new Request('http://localhost/api/cron/benchmark-recorder').headers.get(
          'authorization',
        ),
        cronSecret: 'expected',
      }),
    ).toBe(false);
  });

  it('accepts Bearer CRON_SECRET the way Vercel Cron sends it', () => {
    const request = new Request('http://localhost/api/cron/benchmark-recorder', {
      headers: { authorization: 'Bearer expected' },
    });
    expect(
      authorizeCronRequest({
        authorizationHeader: request.headers.get('authorization'),
        cronSecret: 'expected',
      }),
    ).toBe(true);
  });
});

// The pause gate (ADR-0013): with the cron entry gone from vercel.json, this
// keeps a stray authorized invocation from inserting empty Runs.
describe('GET /api/cron/benchmark-recorder while paused', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuses an authorized sweep with 503 while ANALYTICS_RECORDER_PAUSED', async () => {
    expect(ANALYTICS_RECORDER_PAUSED).toBe(true);
    vi.stubEnv('CRON_SECRET', 'expected');

    const response = await GET(
      new Request('http://localhost/api/cron/benchmark-recorder', {
        headers: { authorization: 'Bearer expected' },
      }),
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/paused/i);
  });
});
