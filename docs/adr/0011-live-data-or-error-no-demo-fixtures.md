# Live data or an honest error — Demo Mode and the Snapshot tier are removed

The competition live demo is over and the product now runs for real users, so the two demo-era stand-in layers are gone: Demo Mode (`NEXT_PUBLIC_ANKER_DEMO_MODE` — fixture market data, disabled transactions, banner) and the Snapshot tier (the committed 2026-07-12 photograph of 4-16 Legacy Oracle states that backed day browse when live markets were unreachable, ADR-0004). When data cannot be served, routes now return an error and the UI shows its error/empty state — users are never shown market data that is not live. ADR-0004 already anticipated this: the Snapshot was "a demo-era stopgap, hand-picked for presentation, not a long-term backstop," and the 4-16 oracles it captured expire for good at the end of July 2026.

## Considered Options

- **Remove both tiers; error on unavailability (chosen).** Day-row discovery errors now propagate to the curated-oracles route's 502 instead of falling through to the photograph; quote building throws when no SVI surface exists instead of inventing non-executable "snapshot pricing"; transaction builders no longer carry a demo kill-switch.
- **Keep the tiers dormant behind their flags.** Zero-cost to keep in theory, but every market-data path had to thread `source` provenance, frozen clocks, and disabled-state copy through the stack — real complexity taxed on every change, guarding a state the product must never show again.

## Consequences

- `runtimeModes.ts` keeps only `isDeterministicE2E()`; Playwright fixtures (deterministic Predict responses, day-scale fixture markets, analytics samples) are E2E-only and remain the one sanctioned use of invented data.
- `TenorSource` / row provenance is gone from the curated-oracle API shape; `CuratedOracleListItem.market` survives only so E2E fixture day rows can embed a browse market the 6-24 indexer cannot serve.
- The Benchmark Recorder only records live inputs. The `'snapshot'` value remains in the Postgres schema and `BenchmarkSampleSource` because historical rows recorded while the tier existed still carry it.
- `legacyOracles.ts` (4-16 object parsers), `daySnapshot.*`, `SnapshotBanner`, and `scripts/capture-day-snapshot.mjs` are deleted; there is no capture path to resurrect.
