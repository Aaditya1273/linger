'use client';

import { useEffect, useState } from 'react';
import { copyForLocale, type Locale } from '../i18n';
import { formatInstant, offsetLabel, useDisplayTimeZone } from './EdgeChart';

const RUN_CADENCE_MS = 15 * 60_000;
/** Two missed Runs on the 15-minute cadence reads as "Delayed", not jitter. */
const DELAYED_AFTER_MS = 3 * RUN_CADENCE_MS;

/**
 * Hero-right slot: the Recorder heartbeat — analytics' counterpart to the
 * product page's live-price ticker. Freshness is judged only after hydration
 * (server "now" and a cached ISR page must not disagree with the viewer).
 * Snapshot mode replaces the wall-clock states outright: a paused Recorder
 * must read as a deliberate archive boundary, never as "Delayed".
 */
export function AnalyticsRecorderStatus({
  lastRunMs,
  snapshot = false,
  locale,
}: {
  lastRunMs: number | null;
  snapshot?: boolean;
  locale: Locale;
}) {
  const copy = copyForLocale(locale);
  const timeZone = useDisplayTimeZone();
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);

  if (lastRunMs === null) return null;

  const delayed = !snapshot && nowMs !== null && nowMs - lastRunMs > DELAYED_AFTER_MS;
  const flagClassName = snapshot
    ? 'di-live-flag is-snapshot'
    : delayed
      ? 'di-live-flag is-stale'
      : 'di-live-flag';
  const flagLabel = snapshot
    ? copy.analytics.recorderSnapshot
    : delayed
      ? copy.analytics.recorderDelayed
      : copy.analytics.recorderLive;
  const timestamp = `${formatInstant(lastRunMs, locale, timeZone)} (${offsetLabel(lastRunMs, timeZone)})`;

  // Kicker and timestamp are wrapped so phones can retire them (the hero
  // keeps just the LIVE/Snapshot chip; the chart caption restates the boundary).
  return (
    <div className="di-hero-ticker analytics-recorder">
      <span className="di-hero-label">
        <span className="analytics-recorder-kicker">{copy.analytics.recorderKicker}</span>
        <span className={flagClassName}>
          <span className="di-live-dot" aria-hidden="true" />
          {flagLabel}
        </span>
      </span>
      <strong className="analytics-recorder-lastrun">
        {snapshot
          ? copy.analytics.snapshotDataThrough(timestamp)
          : copy.analytics.recorderLastRun(timestamp)}
      </strong>
    </div>
  );
}
