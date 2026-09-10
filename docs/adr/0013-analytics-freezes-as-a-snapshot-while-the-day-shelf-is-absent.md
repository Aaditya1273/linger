# Analytics freezes as a snapshot while the day shelf is absent

The 8-04 Predict deployment runs hourly cadence only (ADR-0012): there is no
day shelf, and Binance Dual Investment — the Benchmark — is a day-scale
product, so no ladder row has anything to pair with. The Benchmark Recorder
therefore pauses, and the Analytics page reframes its stored history as a
closed observation window: same verdict band, stats, Edge Tracks, and
methodology, but in a completed tense with an explicit "Snapshot · data
through {end}" state, a why-paused disclosure, and a closed sampling window
({start}–{end}) in the methodology. The pause is a deliberate, flag-driven
state (`ANALYTICS_RECORDER_PAUSED`, a git-tracked constant), never inferred
from staleness — a paused Recorder must read as an archive boundary, not as
"Delayed". The vercel.json cron entry is removed and the cron route 503s
behind the same flag; Neon data is untouched. Recording reopens when
day-scale markets return: flip the flag and restore the cron entry.

## Considered Options

- **Freeze as a closed observation window (chosen).** The recorded verdict
  ("Anker led X% of the time, by Y pts") keeps its full evidentiary value;
  the disclosure of *why* recording stopped is itself part of the
  transparency story (ADR-0006's stance).
- **Keep the cron running.** An empty-shelf sweep still inserts a Run with
  zero headline samples: the leading-streak aggregation breaks on the newest
  Run and permanently reports 0, and the alert tail can spam Issues. The
  Run history would also fill with meaningless empty sweeps. Rejected.
- **Hide the Analytics page until day-scale returns.** Throws away the one
  dataset that substantiates the Edge claim, and a vanished page reads worse
  than an honest pause. Rejected.
- **Benchmark hourly tenors instead.** Binance has no hourly Dual Investment;
  there is no comparable product to record (the whole reason for the pause).
  Rejected.
- **Infer the paused state from sample staleness.** Indistinguishable from a
  broken Recorder — the page would show "Delayed" forever and the pause date
  would drift with clock math. Rejected in favor of the explicit flag.

## Consequences

- Statuses judged against the newest Run (Active / Moved to hourly shelf) are
  meaningless once Runs stop, so snapshot mode flattens the market picker to
  one "Recorded markets" archive group, freshest data first, every Track
  badged "Archived".
- The product-page CTA claim ("the ladder runs the same comparison live") is
  retired while paused; the CTA instead points at what is actually open
  (hourly tenors).
- Stats definitions, aggregation, and the Neon schema are untouched; history
  can still be re-aggregated (ADR-0005) and recording appends to the same
  store when it resumes.
- `DATABASE_URL` remains a runtime dependency of the Analytics page while
  paused — the archive is served live from Neon, not baked into the build.
- Resume checklist: flip `ANALYTICS_RECORDER_PAUSED` to false and restore the
  `/api/cron/benchmark-recorder` entry in vercel.json. Nothing else moved.

## Addendum: the post-migration tail is bounded out of the served snapshot

Deploying the pause surfaced a tail nobody had noticed: the cron kept
sweeping for ~4 days after 6-24 died (2026-08-05 → 2026-08-09), recording
the 8-04 deployment's day-shelf remnants — markets with anomalous tenors
(≈52d, ≈60d) and no day-oracle pricing — as "live-source matched" Samples
with edges in the hundreds of points (+419 pts median on the freshest
market). Tracks are keyed by settlement instant only, so a 6-24 and an 8-04
market sharing a settlement merge into one Track; a time bound is the only
clean separator. The served snapshot therefore ends at
`ANALYTICS_SNAPSHOT_WINDOW_END_MS` (2026-08-05T00:00Z): `loadAnalyticsStats`
filters both Samples and Runs by boundary — Runs too, or a post-bound ok Run
with no surviving headline samples would zero the leading streak. The tail
rows stay in Neon untouched (ADR-0005's re-aggregation promise is exactly
what makes this a display-layer constant), and the exclusion is disclosed in
the methodology's Recording-paused entry.
