import { alertMarker } from './evaluateAlertRules';
import {
  NEEDS_TRIAGE_LABEL,
  type AlertIssueCreateInput,
  type AlertIssuePoster,
} from './postFiredAlerts';

export interface GitHubAlertIssuePosterConfig {
  token: string;
  /** `owner/repo` */
  repository: string;
  fetchImpl?: typeof fetch;
}

/**
 * Thin GitHub Issues adapter: open Issues labeled needs-triage, deduped by
 * `alert-type:…` marker in the body.
 */
export function createGitHubAlertIssuePoster(
  config: GitHubAlertIssuePosterConfig,
): AlertIssuePoster {
  const fetchImpl = config.fetchImpl ?? fetch;
  const [owner, repo] = parseRepository(config.repository);
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  return {
    async findOpenAlertIssue(type) {
      const marker = alertMarker(type);
      // Search open Issues by marker only — label is applied on create, not required for dedupe.
      const query = encodeURIComponent(
        `repo:${owner}/${repo} is:issue is:open "${marker}" in:body`,
      );
      const response = await fetchImpl(`https://api.github.com/search/issues?q=${query}&per_page=1`, {
        headers: githubHeaders(config.token),
      });
      if (!response.ok) {
        throw new Error(`GitHub search issues failed: ${response.status} ${await response.text()}`);
      }
      const payload = (await response.json()) as {
        items?: Array<{ number: number }>;
      };
      const match = payload.items?.[0];
      return match ? { number: match.number } : null;
    },

    async createAlertIssue(input: AlertIssueCreateInput) {
      const response = await fetchImpl(`${base}/issues`, {
        method: 'POST',
        headers: {
          ...githubHeaders(config.token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          labels: [...input.labels],
        }),
      });
      if (!response.ok) {
        throw new Error(`GitHub create issue failed: ${response.status} ${await response.text()}`);
      }
    },
  };
}

/** Builds a poster from env, or null when token/repo are missing (alerts skipped). */
export function createGitHubAlertIssuePosterFromEnv(env: {
  token?: string | null;
  repository?: string | null;
}): AlertIssuePoster | null {
  const token = env.token?.trim();
  const repository = env.repository?.trim();
  if (!token || !repository) return null;
  return createGitHubAlertIssuePoster({ token, repository });
}

function parseRepository(repository: string): [string, string] {
  const parts = repository.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`GITHUB_ALERTS_REPO must be owner/repo, got: ${repository}`);
  }
  return [parts[0], parts[1]];
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'anker-protocol-benchmark-recorder',
  };
}
