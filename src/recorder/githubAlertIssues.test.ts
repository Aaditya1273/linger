import { describe, expect, it, vi } from 'vitest';
import {
  createGitHubAlertIssuePoster,
  createGitHubAlertIssuePosterFromEnv,
} from './githubAlertIssues';

describe('createGitHubAlertIssuePoster', () => {
  it('finds an open Issue by alert-type marker in the body (label not required)', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      expect(href).toContain('/search/issues?');
      if (href.includes(encodeURIComponent('alert-type:upstream_failure'))) {
        return new Response(JSON.stringify({ items: [{ number: 42 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });

    const poster = createGitHubAlertIssuePoster({
      token: 'ghp_test',
      repository: 'cl-fi/AnkerProtocol',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(poster.findOpenAlertIssue('upstream_failure')).resolves.toEqual({ number: 42 });
    await expect(poster.findOpenAlertIssue('snapshot_fallback')).resolves.toBeNull();
  });

  it('creates an Issue with the needs-triage label', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as {
        title: string;
        body: string;
        labels: string[];
      };
      expect(body).toEqual({
        title: 't',
        body: 'b',
        labels: ['needs-triage'],
      });
      return new Response(JSON.stringify({ number: 7 }), { status: 201 });
    });

    const poster = createGitHubAlertIssuePoster({
      token: 'ghp_test',
      repository: 'cl-fi/AnkerProtocol',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await poster.createAlertIssue({
      title: 't',
      body: 'b',
      labels: ['needs-triage'],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('createGitHubAlertIssuePosterFromEnv', () => {
  it('returns null when token or repo is missing', () => {
    expect(createGitHubAlertIssuePosterFromEnv({ token: null, repository: 'a/b' })).toBeNull();
    expect(createGitHubAlertIssuePosterFromEnv({ token: 't', repository: '' })).toBeNull();
  });

  it('builds a poster when both are set', () => {
    expect(
      createGitHubAlertIssuePosterFromEnv({
        token: 'ghp_test',
        repository: 'cl-fi/AnkerProtocol',
      }),
    ).not.toBeNull();
  });
});
