import { alertMarker, type AlertType, type FiredAlert } from './evaluateAlertRules';

export const NEEDS_TRIAGE_LABEL = 'needs-triage';

export interface AlertIssueCreateInput {
  title: string;
  body: string;
  labels: readonly string[];
}

export interface AlertIssuePoster {
  findOpenAlertIssue(type: AlertType): Promise<{ number: number } | null>;
  createAlertIssue(input: AlertIssueCreateInput): Promise<void>;
}

export type AlertIssueLog = (message: string, error?: unknown) => void;

/**
 * Thin orchestration over a GitHub Issues adapter: dedupe by open Issue of the
 * same alert type, then create with needs-triage. Failures are logged; never thrown.
 */
export async function postFiredAlerts(input: {
  alerts: readonly FiredAlert[];
  poster: AlertIssuePoster;
  log?: AlertIssueLog;
}): Promise<void> {
  const log = input.log ?? defaultLog;

  for (const alert of input.alerts) {
    try {
      const existing = await input.poster.findOpenAlertIssue(alert.type);
      if (existing) continue;

      await input.poster.createAlertIssue({
        title: alert.title,
        body: alert.body,
        labels: [NEEDS_TRIAGE_LABEL],
      });
    } catch (error) {
      log(`Failed to post Benchmark Recorder alert ${alert.type}`, error);
    }
  }
}

function defaultLog(message: string, error?: unknown): void {
  if (error === undefined) {
    console.error(message);
    return;
  }
  console.error(message, error);
}

const ALERT_TYPES = [
  'upstream_failure',
  'snapshot_fallback',
  'low_matched_rate',
  'negative_median_edge_streak',
] as const satisfies readonly AlertType[];

/** In-memory poster for unit tests — same dedupe contract as the GitHub adapter. */
export function createMemoryAlertIssuePoster(): AlertIssuePoster & {
  openMarkers: Set<string>;
  created: AlertIssueCreateInput[];
} {
  const openMarkers = new Set<string>();
  const created: AlertIssueCreateInput[] = [];
  let nextNumber = 1;

  return {
    openMarkers,
    created,
    async findOpenAlertIssue(type) {
      const marker = alertMarker(type);
      if (!openMarkers.has(marker)) return null;
      return { number: nextNumber };
    },
    async createAlertIssue(input) {
      created.push({
        title: input.title,
        body: input.body,
        labels: [...input.labels],
      });
      for (const type of ALERT_TYPES) {
        const marker = alertMarker(type);
        if (input.body.includes(marker)) openMarkers.add(marker);
      }
      nextNumber += 1;
    },
  };
}
