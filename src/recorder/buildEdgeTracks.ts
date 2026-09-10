import { medianEdgePp, sampleEdgePp } from './evaluateAlertRules';
import type { TimestampedSample } from './store';

export type EdgeTrackStatus = 'active' | 'hourlyShelf' | 'expired';

export interface EdgeTrackPoint {
  boundaryMs: number;
  medianEdgePp: number;
  minEdgePp: number;
  maxEdgePp: number;
  /** Ladder rows aggregated into this point. */
  rowCount: number;
  medianNetApr: number;
  medianBenchmarkApr: number;
}

export interface EdgeTrackSummary {
  /** Plotted ladder rows across the whole Track. */
  sampleCount: number;
  leadingPct: number | null;
  medianEdgePp: number | null;
  firstBoundaryMs: number;
  lastBoundaryMs: number;
  /** Remaining tenor when the Recorder first saw this market. */
  firstSeenRemainingMs: number;
}

export interface EdgeTrack {
  /** Market identity: the Anker settlement instant. */
  settlementMs: number;
  status: EdgeTrackStatus;
  points: readonly EdgeTrackPoint[];
  summary: EdgeTrackSummary;
}

export interface EdgeTracks {
  /** Active Tracks first (settlement ascending), then ended (settlement descending). */
  tracks: readonly EdgeTrack[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

interface PlottedSample extends TimestampedSample {
  edgePp: number;
  netApr: number;
  benchmarkApr: number;
}

function buildPoints(samples: readonly PlottedSample[]): EdgeTrackPoint[] {
  const byBoundary = new Map<number, PlottedSample[]>();
  for (const sample of samples) {
    const group = byBoundary.get(sample.boundaryMs);
    if (group) group.push(sample);
    else byBoundary.set(sample.boundaryMs, [sample]);
  }

  return [...byBoundary.entries()]
    .sort(([a], [b]) => a - b)
    .map(([boundaryMs, rows]) => {
      const edges = rows.map((row) => row.edgePp);
      return {
        boundaryMs,
        medianEdgePp: median(edges),
        minEdgePp: Math.min(...edges),
        maxEdgePp: Math.max(...edges),
        rowCount: rows.length,
        medianNetApr: median(rows.map((row) => row.netApr)),
        medianBenchmarkApr: median(rows.map((row) => row.benchmarkApr)),
      };
    });
}

/**
 * Pure chart seam: Samples → one Edge Track per Expiry Market
 * (grouped by Anker settlement instant, one aggregated point per Run).
 * Only live-source matched (headlineEligible) samples are plotted.
 * A Track is active while its market still appears in the newest plotted Run;
 * an ended Track is expired once its settlement has passed, otherwise it
 * migrated to the hourly shelf and left the Recorder's day-shelf scope.
 */
export function buildEdgeTracks(samples: readonly TimestampedSample[]): EdgeTracks {
  const byMarket = new Map<number, PlottedSample[]>();
  for (const sample of samples) {
    if (!sample.headlineEligible) continue;
    const edgePp = sampleEdgePp(sample);
    if (edgePp === null || sample.netApr === null || sample.benchmarkApr === null) continue;
    if (sample.benchmarkSettlementMs === null) continue;

    const plotted: PlottedSample = {
      ...sample,
      edgePp,
      netApr: sample.netApr,
      benchmarkApr: sample.benchmarkApr,
    };
    const group = byMarket.get(sample.ankerSettlementMs);
    if (group) group.push(plotted);
    else byMarket.set(sample.ankerSettlementMs, [plotted]);
  }

  if (byMarket.size === 0) return { tracks: [] };

  const latestBoundaryMs = Math.max(
    ...[...byMarket.values()].flatMap((rows) => rows.map((row) => row.boundaryMs)),
  );

  const tracks: EdgeTrack[] = [...byMarket.entries()].map(([settlementMs, rows]) => {
    const points = buildPoints(rows);
    const firstBoundaryMs = points[0]!.boundaryMs;
    const lastBoundaryMs = points[points.length - 1]!.boundaryMs;
    const leading = rows.filter((row) => row.edgePp > 0).length;
    const status: EdgeTrackStatus =
      lastBoundaryMs === latestBoundaryMs
        ? 'active'
        : settlementMs <= latestBoundaryMs
          ? 'expired'
          : 'hourlyShelf';
    return {
      settlementMs,
      status,
      points,
      summary: {
        sampleCount: rows.length,
        leadingPct: rows.length === 0 ? null : leading / rows.length,
        medianEdgePp: medianEdgePp(rows),
        firstBoundaryMs,
        lastBoundaryMs,
        firstSeenRemainingMs: settlementMs - firstBoundaryMs,
      },
    };
  });

  const active = tracks
    .filter((track) => track.status === 'active')
    .sort((a, b) => a.settlementMs - b.settlementMs);
  const ended = tracks
    .filter((track) => track.status !== 'active')
    .sort((a, b) => b.settlementMs - a.settlementMs);

  return { tracks: [...active, ...ended] };
}
