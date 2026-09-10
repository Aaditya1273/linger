import packageJson from '../../package.json';
import { buildBenchmarkRun, type BenchmarkRun, type BenchmarkSample } from './buildBenchmarkRun';
import {
  evaluateAlertRules,
  NEGATIVE_EDGE_STREAK_REQUIRED,
} from './evaluateAlertRules';
import { loadRecorderInputs } from './loadRecorderInputs';
import { postFiredAlerts, type AlertIssueLog, type AlertIssuePoster } from './postFiredAlerts';
import type { BenchmarkRunStore, InsertRunResult, RunWithSamples } from './store';

function readAppVersion(): string {
  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
}

export interface ExecuteBenchmarkSweepResult {
  run: BenchmarkRun;
  samples: BenchmarkSample[];
  persist: InsertRunResult;
}

/**
 * One Benchmark Recorder sweep: load inputs → pure Run builder → idempotent persist
 * → alert-rule evaluation (fail-soft Issue posting).
 */
export async function executeBenchmarkSweep(input: {
  store: BenchmarkRunStore;
  wallClockMs?: number;
  appVersion?: string;
  alertPoster?: AlertIssuePoster | null;
  log?: AlertIssueLog;
}): Promise<ExecuteBenchmarkSweepResult> {
  const wallClockMs = input.wallClockMs ?? Date.now();
  const startedAt = Date.now();
  const appVersion = input.appVersion ?? readAppVersion();

  const loaded = await loadRecorderInputs(wallClockMs);
  const { run, samples } = buildBenchmarkRun({
    markets: loaded.markets,
    binanceProducts: loaded.binanceProducts,
    spot: loaded.spot,
    nowMs: loaded.nowMs,
    appVersion,
    upstreamFailed: loaded.upstreamFailed,
    durationMs: Date.now() - startedAt,
  });

  // Duration includes persist prep; stamp final wall time before write.
  const finalized: BenchmarkRun = {
    ...run,
    durationMs: Date.now() - startedAt,
  };

  const persist = await input.store.insertRunIfAbsent(finalized, samples);

  await runTailAlerts({
    store: input.store,
    current: { run: finalized, samples },
    alertPoster: input.alertPoster,
    log: input.log,
  });

  return { run: finalized, samples, persist };
}

/**
 * Tail of a Run: evaluate pure alert rules over recent history and post Issues.
 * Failures are logged; never thrown — persistence is already done.
 */
export async function runTailAlerts(input: {
  store: BenchmarkRunStore;
  current: RunWithSamples;
  alertPoster?: AlertIssuePoster | null;
  log?: AlertIssueLog;
}): Promise<void> {
  if (!input.alertPoster) return;

  try {
    const history = await input.store.listRecentRuns(NEGATIVE_EDGE_STREAK_REQUIRED);
    const recent = history.filter((snap) => snap.run.boundaryMs !== input.current.run.boundaryMs);
    const alerts = evaluateAlertRules({ current: input.current, recent });
    if (alerts.length === 0) return;
    await postFiredAlerts({
      alerts,
      poster: input.alertPoster,
      log: input.log,
    });
  } catch (error) {
    const log = input.log ?? ((message, err) => console.error(message, err));
    log('Benchmark Recorder alert evaluation failed', error);
  }
}
