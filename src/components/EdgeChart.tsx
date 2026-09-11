'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DAY_MS } from '../products/units';
import type { EdgeTrack, EdgeTrackPoint, EdgeTracks } from '../recorder/buildEdgeTracks';
import {
  copyForLocale,
  formatApr,
  formatEdgePts,
  formatPercent,
  utcOffsetLabel,
  type Locale,
} from '../i18n';
import { Badge, type Tone } from '../ui';

const HOUR_MS = 3_600_000;
const STATUS_TONE: Record<EdgeTrack['status'], Tone> = {
  active: 'positive',
  hourlyShelf: 'warning',
  expired: 'neutral',
};

function numberLocale(locale: Locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

/** Viewer timezone for time labels: undefined = browser local, 'UTC' = pre-hydration fallback. */
export type DisplayTimeZone = 'UTC' | undefined;

/**
 * Server markup (and the first client render) must agree, but the server does not
 * know the viewer's timezone — so both render UTC, then a post-hydration re-render
 * switches every time label to the viewer's local timezone.
 */
export function useDisplayTimeZone(): DisplayTimeZone {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated ? undefined : 'UTC';
}

export function offsetLabel(ms: number, timeZone: DisplayTimeZone) {
  return timeZone === 'UTC' ? 'UTC' : utcOffsetLabel(ms);
}

export function formatInstant(ms: number, locale: Locale, timeZone: DisplayTimeZone) {
  return new Date(ms).toLocaleString(numberLocale(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hour12: false,
  });
}

function formatDayTick(ms: number, locale: Locale, timeZone: DisplayTimeZone) {
  return new Date(ms).toLocaleString(numberLocale(locale), {
    month: 'short',
    day: 'numeric',
    timeZone,
  });
}

function formatTimeTick(ms: number, locale: Locale, timeZone: DisplayTimeZone) {
  return new Date(ms).toLocaleString(numberLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hour12: false,
  });
}

function statusLabel(status: EdgeTrack['status'], copy: ReturnType<typeof copyForLocale>) {
  if (status === 'active') return copy.analytics.statusActive;
  if (status === 'hourlyShelf') return copy.analytics.statusHourlyShelf;
  return copy.analytics.statusExpired;
}

function trackTenorDays(track: EdgeTrack) {
  const roundedDays = Math.round(track.summary.firstSeenRemainingMs / DAY_MS);
  return roundedDays < 1 ? 1 : roundedDays;
}

function trackSettlementLabel(track: EdgeTrack, locale: Locale, timeZone: DisplayTimeZone) {
  return `${formatInstant(track.settlementMs, locale, timeZone)} (${offsetLabel(track.settlementMs, timeZone)})`;
}

function trackOptionLabel(track: EdgeTrack, locale: Locale, timeZone: DisplayTimeZone) {
  const copy = copyForLocale(locale);
  return `${trackSettlementLabel(track, locale, timeZone)} · ${copy.analytics.marketTenorApprox(trackTenorDays(track))}`;
}

export function EdgeTrackTooltipContent({
  point,
  locale,
}: {
  point: EdgeTrackPoint;
  locale: Locale;
}) {
  const copy = copyForLocale(locale);
  return (
    <div className="analytics-edge-tooltip" role="status">
      <strong>
        {formatInstant(point.boundaryMs, locale, undefined)} ({utcOffsetLabel(point.boundaryMs)}) ·{' '}
        {copy.analytics.tooltipRows(point.rowCount)}
      </strong>
      <div>
        <span>{copy.analytics.medianEdge}</span>
        <strong>{formatEdgePts(point.medianEdgePp, locale)}</strong>
      </div>
      <div>
        <span>{copy.analytics.tooltipRange}</span>
        <strong>
          {formatEdgePts(point.minEdgePp, locale)} – {formatEdgePts(point.maxEdgePp, locale)}
        </strong>
      </div>
      <div>
        <span>{copy.analytics.tooltipAnkerApr}</span>
        <strong>{formatApr(point.medianNetApr, locale)}</strong>
      </div>
      <div>
        <span>{copy.analytics.tooltipBinanceApr}</span>
        <strong>{formatApr(point.medianBenchmarkApr, locale)}</strong>
      </div>
    </div>
  );
}

function TrackSummaryStrip({
  track,
  locale,
  timeZone,
}: {
  track: EdgeTrack;
  locale: Locale;
  timeZone: DisplayTimeZone;
}) {
  const copy = copyForLocale(locale);
  const { summary } = track;
  // The Sampled window hides on phones (its end is the Last Run caption right
  // below) — hence the marker class on that entry.
  const entries: { label: string; value: string; className?: string }[] = [
    { label: copy.analytics.sampleCount, value: summary.sampleCount.toLocaleString(numberLocale(locale)) },
    {
      label: copy.analytics.leadingPctTrack,
      value:
        summary.leadingPct === null
          ? copy.analytics.emptyValue
          : formatPercent(summary.leadingPct, locale, { maximumFractionDigits: 1 }),
    },
    {
      label: copy.analytics.medianEdge,
      value:
        summary.medianEdgePp === null
          ? copy.analytics.emptyValue
          : formatEdgePts(summary.medianEdgePp, locale),
    },
    {
      label: copy.analytics.trackWindow,
      value: `${formatInstant(summary.firstBoundaryMs, locale, timeZone)} – ${formatInstant(summary.lastBoundaryMs, locale, timeZone)} (${offsetLabel(summary.lastBoundaryMs, timeZone)})`,
      className: 'analytics-track-window',
    },
  ];
  return (
    <dl
      className="analytics-track-summary"
      aria-label={copy.analytics.trackSummaryLabel}
      data-testid="analytics-track-summary"
    >
      {entries.map(({ label, value, className }) => (
        <div key={label} className={className}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function yDomain(track: EdgeTrack): [number, number] {
  const lo = Math.min(0, ...track.points.map((p) => p.minEdgePp));
  const hi = Math.max(0, ...track.points.map((p) => p.maxEdgePp));
  const pad = Math.max(0.01, (hi - lo) * 0.1);
  return [lo - pad, hi + pad];
}

/** Ticks at a readable 1/2/5 step; zero is a multiple of the step, so it always gets a tick. */
function yTicks([lo, hi]: [number, number]): number[] {
  const rawStep = (hi - lo) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let tick = Math.ceil(lo / step) * step; tick <= hi + step / 1e6; tick += step) {
    ticks.push(Math.abs(tick) < step / 1e6 ? 0 : tick);
  }
  return ticks;
}

function TrackChart({
  track,
  locale,
  timeZone,
}: {
  track: EdgeTrack;
  locale: Locale;
  timeZone: DisplayTimeZone;
}) {
  const copy = copyForLocale(locale);
  const spanMs =
    track.points[track.points.length - 1]!.boundaryMs - track.points[0]!.boundaryMs;
  const tickFormatter =
    spanMs < 48 * HOUR_MS
      ? (value: number) => formatTimeTick(value, locale, timeZone)
      : (value: number) => formatDayTick(value, locale, timeZone);
  const domain = yDomain(track);
  const data = track.points.map((point) => ({
    ...point,
    band: [point.minEdgePp, point.maxEdgePp] as [number, number],
  }));

  return (
    <div className="analytics-edge-chart-frame" data-testid="analytics-edge-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="var(--copper-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="boundaryMs"
            domain={['dataMin', 'dataMax']}
            tickFormatter={tickFormatter}
            stroke="var(--ink-soft)"
            tick={{ fill: 'var(--ink-soft)', fontSize: 12 }}
          />
          <YAxis
            domain={domain}
            ticks={yTicks(domain)}
            tickFormatter={(value: number) => formatEdgePts(value, locale)}
            stroke="var(--ink-soft)"
            tick={{ fill: 'var(--ink-soft)', fontSize: 12 }}
            width={72}
          />
          {/* The zero-line semantic lives in the chart itself: tinted half-planes
              with "who leads" labels, so the plot reads without the caption. */}
          <ReferenceArea
            y1={0}
            y2={domain[1]}
            fill="var(--grass)"
            fillOpacity={0.06}
            stroke="none"
            label={{
              value: copy.analytics.chartLeadsAbove,
              position: 'insideTopLeft',
              fill: 'var(--grass)',
              fontSize: 11,
              fontWeight: 800,
            }}
          />
          <ReferenceArea
            y1={domain[0]}
            y2={0}
            fill="var(--coral)"
            fillOpacity={0.05}
            stroke="none"
            label={{
              value: copy.analytics.chartLeadsBelow,
              position: 'insideBottomLeft',
              fill: 'var(--coral)',
              fontSize: 11,
              fontWeight: 800,
            }}
          />
          <ReferenceLine y={0} stroke="var(--navy)" strokeWidth={2} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as EdgeTrackPoint | undefined;
              if (!point) return null;
              return <EdgeTrackTooltipContent point={point} locale={locale} />;
            }}
          />
          {/* Gold band matches the product page's ReturnOverview fill — one
              chart palette across the app (navy line + gold area). */}
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--gold)"
            fillOpacity={0.28}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="medianEdgePp"
            type="monotone"
            stroke="var(--navy)"
            strokeWidth={2.5}
            // Visible dots: with a handful of Runs the median is a straight
            // segment, and an undotted straight line reads as an illustration
            // rather than a measurement. The dots are the evidence.
            dot={{ r: 3.5, strokeWidth: 2, fill: 'var(--paper)', stroke: 'var(--navy)' }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Native grouped select — the mobile sheet variant left with the Sui UI. */
export interface SheetSelectOption {
  id: string;
  primary: string;
  secondary?: string;
}

function NativeSelect(props: {
  value: string;
  onSelect: (id: string) => void;
  label: string;
  closeLabel: string;
  triggerValue: string;
  groups: ReadonlyArray<{ key: string; label: string; options: SheetSelectOption[] }>;
}) {
  return (
    <select
      className="edge-select"
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onSelect(event.target.value)}
    >
      {props.groups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.secondary ? `${option.primary} · ${option.secondary}` : option.primary}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function EdgeChart({
  edgeTracks,
  snapshot = false,
  locale,
}: {
  edgeTracks: EdgeTracks;
  /** Recorder paused: every Track is a frozen archive — no Active/Ended split. */
  snapshot?: boolean;
  locale: Locale;
}) {
  const copy = copyForLocale(locale);
  const timeZone = useDisplayTimeZone();
  // The live active/ended statuses are judged against the newest Run, which is
  // meaningless once the Recorder stops — a frozen page must not claim a market
  // is "Active". Snapshot mode flattens to one archive list, freshest data
  // first (ties broken by nearest settlement, matching the live default).
  const tracks = snapshot
    ? [...edgeTracks.tracks].sort(
        (a, b) =>
          b.summary.lastBoundaryMs - a.summary.lastBoundaryMs || a.settlementMs - b.settlementMs,
      )
    : edgeTracks.tracks;
  const [selectedSettlementMs, setSelectedSettlementMs] = useState<number | null>(null);
  const selected =
    tracks.find((track) => track.settlementMs === selectedSettlementMs) ?? tracks[0] ?? null;
  const activeTracks = tracks.filter((track) => track.status === 'active');
  const endedTracks = tracks.filter((track) => track.status !== 'active');
  // Recorder freshness, restated beside the plot on phones (the hero shows
  // only the LIVE chip there; desktop keeps the full hero ticker instead).
  const lastRunMs =
    tracks.length === 0 ? null : Math.max(...tracks.map((track) => track.summary.lastBoundaryMs));

  const toOption = (track: EdgeTrack): SheetSelectOption => ({
    id: String(track.settlementMs),
    primary: trackSettlementLabel(track, locale, timeZone),
    secondary: copy.analytics.marketTenorApprox(trackTenorDays(track)),
  });
  const groups = snapshot
    ? [{ key: 'archived', label: copy.analytics.marketGroupArchived, options: tracks.map(toOption) }]
    : [
        { key: 'active', label: copy.analytics.marketGroupActive, options: activeTracks.map(toOption) },
        { key: 'ended', label: copy.analytics.marketGroupEnded, options: endedTracks.map(toOption) },
      ];

  return (
    <section className="calculation-section analytics-edge-chart" aria-label={copy.analytics.chartLabel}>
      <div className="section-heading analytics-chart-heading">
        <div>
          <h2>{copy.analytics.chartTitle}</h2>
          <p>{copy.analytics.chartSubtitle}</p>
        </div>
        {/* Legend for the two encodings; the band is otherwise only
            discoverable via the tooltip. */}
        <div className="analytics-chart-legend">
          <span>
            <i className="analytics-legend-line" aria-hidden="true" />
            {copy.analytics.medianEdge}
          </span>
          <span>
            <i className="analytics-legend-band" aria-hidden="true" />
            {copy.analytics.legendBand}
          </span>
        </div>
      </div>

      {selected === null ? (
        <p className="analytics-unavailable">{copy.analytics.chartEmpty}</p>
      ) : (
        <>
          <div className="analytics-track-controls">
            <div className="analytics-track-select">
              <span className="di-select-label">{copy.analytics.marketSelectLabel}</span>
              <NativeSelect
                value={String(selected.settlementMs)}
                onSelect={(id: string) => setSelectedSettlementMs(Number(id))}
                label={copy.analytics.marketSelectLabel}
                closeLabel={copy.common.close}
                triggerValue={trackOptionLabel(selected, locale, timeZone)}
                groups={groups}
              />
            </div>
            <Badge tone={snapshot ? 'neutral' : STATUS_TONE[selected.status]}>
              {snapshot ? copy.analytics.statusArchived : statusLabel(selected.status, copy)}
            </Badge>
          </div>

          <TrackSummaryStrip track={selected} locale={locale} timeZone={timeZone} />

          {selected.points.length < 2 ? (
            <p className="analytics-unavailable">{copy.analytics.trackInsufficient}</p>
          ) : (
            <TrackChart track={selected} locale={locale} timeZone={timeZone} />
          )}

          {lastRunMs !== null ? (
            <p className="analytics-chart-caption">
              {(snapshot ? copy.analytics.snapshotDataThrough : copy.analytics.recorderLastRun)(
                `${formatInstant(lastRunMs, locale, timeZone)} (${offsetLabel(lastRunMs, timeZone)})`,
              )}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
