import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { HeadlineStats } from '../recorder/aggregateHeadlineStats';
import { ANALYTICS_RECORDER_PAUSED } from '../recorder/analyticsSnapshot';
import type { AnalyticsStatsLoad } from '../recorder/loadAnalyticsStats';
import {
  copyForLocale,
  DEFAULT_LOCALE,
  formatEdgePts,
  formatInteger,
  formatPercent,
  localizedPath,
  type Locale,
} from '../i18n';
import { AnalyticsMethodology } from './AnalyticsMethodology';
import { AnalyticsRecorderStatus } from './AnalyticsRecorderStatus';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { EdgeChart } from './EdgeChart';
import { buttonClassName, Stat, StatGroup } from '../ui';

function formatSampleDate(sampleMs: number | null, locale: Locale) {
  if (sampleMs === null) return null;
  const numberLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Date(sampleMs).toLocaleDateString(numberLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function statOrEmpty(value: string | null, empty: string) {
  return value ?? empty;
}

/**
 * Verdict band — the page's one-sentence story ("Anker leads X% of the time,
 * by Y pts"), promoted above the supporting counts. Mirrors the Portfolio
 * wallet band: display-size hero figure + gold accent pill.
 */
function VerdictBand({
  stats,
  startDate,
  endDate,
  snapshot,
  locale,
}: {
  stats: HeadlineStats | null;
  startDate: string | null;
  endDate: string | null;
  snapshot: boolean;
  locale: Locale;
}) {
  const copy = copyForLocale(locale);
  const leadingPct =
    stats?.leadingPct == null ? null : formatPercent(stats.leadingPct, locale, { maximumFractionDigits: 1 });
  const medianEdge = stats?.medianEdgePp == null ? null : formatEdgePts(stats.medianEdgePp, locale);
  const samples = stats === null ? null : formatInteger(stats.sampleCount, locale);
  const support =
    samples === null
      ? null
      : snapshot && startDate && endDate
        ? copy.analytics.verdictSupportWindow(samples, startDate, endDate)
        : startDate
          ? copy.analytics.verdictSupport(samples, startDate)
          : copy.analytics.verdictSupportNoDate(samples);

  return (
    <div className="analytics-verdict">
      <span className="analytics-verdict-label">{copy.analytics.leadingPct}</span>
      <span className="analytics-verdict-row">
        <strong className="analytics-verdict-value">{leadingPct ?? copy.analytics.emptyValue}</strong>
        {medianEdge !== null ? (
          <em className="analytics-verdict-edge">
            <Sparkles size={13} aria-hidden="true" />
            <span>{copy.analytics.medianEdge}</span> {medianEdge}
          </em>
        ) : null}
      </span>
      {support !== null ? <span className="analytics-verdict-support">{support}</span> : null}
    </div>
  );
}

/** Supporting tiles: data-credibility metrics, deliberately below the verdict. */
function SupportingStats({
  stats,
  snapshot,
  locale,
}: {
  stats: HeadlineStats | null;
  snapshot: boolean;
  locale: Locale;
}) {
  const copy = copyForLocale(locale);
  const empty = copy.analytics.emptyValue;

  return (
    <StatGroup className="analytics-stats">
      <Stat
        label={copy.analytics.sampleCount}
        value={stats ? formatInteger(stats.sampleCount, locale) : empty}
        hint={copy.analytics.sampleCountHint}
      />
      <Stat
        label={snapshot ? copy.analytics.leadingStreakSnapshot : copy.analytics.leadingStreak}
        value={stats ? formatInteger(stats.currentLeadingStreak, locale) : empty}
        sub={stats ? copy.analytics.leadingStreakUnit : undefined}
        hint={copy.analytics.leadingStreakHint}
      />
      <Stat
        label={copy.analytics.ladderCoverage}
        value={statOrEmpty(
          stats?.ladderCoverage == null
            ? null
            : formatPercent(stats.ladderCoverage, locale, { maximumFractionDigits: 1 }),
          empty,
        )}
        hint={copy.analytics.ladderCoverageHint}
      />
    </StatGroup>
  );
}

export function AnalyticsPage({
  locale = DEFAULT_LOCALE,
  load,
  snapshot = ANALYTICS_RECORDER_PAUSED,
}: {
  locale?: Locale;
  load: AnalyticsStatsLoad;
  /** Recorder paused: serve the stored Samples as a closed observation window. */
  snapshot?: boolean;
}) {
  const copy = copyForLocale(locale);
  const stats = load.kind === 'ready' ? load.stats : null;
  const edgeTracks = load.kind === 'ready' ? load.edgeTracks : { tracks: [] };
  const showUnavailableBanner = load.kind === 'unavailable' || (stats !== null && stats.sampleCount === 0);
  const startDate = formatSampleDate(stats?.sampleStartMs ?? null, locale);
  const lastRunMs =
    edgeTracks.tracks.length === 0
      ? null
      : Math.max(...edgeTracks.tracks.map((track) => track.summary.lastBoundaryMs));
  const endDate = formatSampleDate(lastRunMs, locale);

  return (
    <main className="dual-page" id="benchmark-analytics">
      <AppHeader activeProduct="analytics" locale={locale} />

      <section className="dual-hero calculation-hero analytics-hero">
        <div>
          <h1>{copy.analytics.title}</h1>
          <p>{snapshot ? copy.analytics.snapshotSubtitle : copy.analytics.subtitle}</p>
        </div>
        <AnalyticsRecorderStatus lastRunMs={lastRunMs} snapshot={snapshot} locale={locale} />
      </section>

      <section className="calculation-section" aria-label={copy.analytics.statsLabel}>
        {snapshot ? <p className="analytics-snapshot-banner">{copy.analytics.snapshotBanner}</p> : null}
        {showUnavailableBanner ? <p className="analytics-unavailable">{copy.analytics.unavailable}</p> : null}
        <VerdictBand stats={stats} startDate={startDate} endDate={endDate} snapshot={snapshot} locale={locale} />
        <SupportingStats stats={stats} snapshot={snapshot} locale={locale} />
      </section>

      <EdgeChart edgeTracks={edgeTracks} snapshot={snapshot} locale={locale} />

      <AnalyticsMethodology locale={locale} startDate={startDate} endDate={endDate} snapshot={snapshot} />

      {/* Close the loop: the Edge shown here historically is live, rung by
          rung, on the product ladder — send the convinced reader there. In
          snapshot mode the live-comparison claim is retired; the CTA points
          at what is actually open (hourly tenors).
          Desktop-only: the phone tab dock already navigates to the product. */}
      <section className="calculation-section analytics-cta-section">
        <div className="analytics-cta">
          <div>
            <h2>{snapshot ? copy.analytics.snapshotCtaTitle : copy.analytics.ctaTitle}</h2>
            <p>{snapshot ? copy.analytics.snapshotCtaBody : copy.analytics.ctaBody}</p>
          </div>
          <Link className={buttonClassName()} href={localizedPath(locale, '/app/dual-investment')}>
            {copy.analytics.ctaButton}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <AppFooter locale={locale} />
    </main>
  );
}
