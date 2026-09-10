# The app reads Predict from the chain, not an indexer — 8-04 migration

The 6-24 Predict deployment died on 2026-08-05: upstream cut its Block Scholes
push while bringing up a fresh 8-04 deployment (published 2026-08-04T12:19Z)
built on Block Scholes' production signed-oracle stores. The app migrates to
8-04 as a clean cut — old 6-24 positions are no longer shown, matching
Cumulative Rewards' "from the current deployment onward" definition — and the
Anker `product_note` contract is republished against the new `account` package
(a fresh publish, not an upgrade: `AccountWrapper`'s type identity changed,
which is upgrade-incompatible; ADR-0003's in-place-upgrade rule applies within
a deployment generation, not across one).

The structural decision: **no indexer**. Mysten's predict-server and propbook
REST APIs still serve only the dead 6-24 deployment, so every read moved
on-chain:

- **Discovery** — devInspect `plp::active_expiry_markets(vault)` (O(active
  markets), no event-window pagination, unchanged when day-scale cadences
  activate), then the `ExpiryMarket` objects plus the vault's
  `RegisteredExpiry` funding records, whose allocation/cash pair is the cadence
  fingerprint `tenorMarkets` keys on.
- **Oracles** — one devInspect batch over the propbook store getters
  `pyth_feed::normalized_spot` and `block_scholes_store::{spot,forward,svi}`.
  Clients pass only `expiry_ms` and never derive the provider-defined u256
  series ids (the sid algorithm already changed once upstream, DBU-537; the
  getters absorb that).
- **Settlement** — the `ExpiryMarket` object's `settlement_price`, served to
  the browser by `/api/markets/{id}/state`. `settled_at_ms` is gone: no
  consumer used it, and the object does not carry it.

## Considered Options

- **On-chain reads behind the same server routes (chosen).** The browser keeps
  calling our own API routes; only the server-side data source changed. When
  Mysten ships an 8-04 indexer, the seam to swap back is
  `createPredictAdapter`'s injectable `fetchMarkets` plus `predictOnchain.ts`.
- **Wait for the official indexer.** 6-24 minting is permanently dead
  (`EBlockScholesPriceStale`); waiting means an unusable product for an
  unknown period. Rejected.
- **Index MarketCreated events ourselves.** Covers today's 1m/5m/1h churn but
  needs unbounded pagination once month-scale cadences exist; the active-set
  devInspect does not. Rejected.

## Consequences

- The predict/propbook proxy routes, their allowlists, and the `/status`
  server-lag plumbing are deleted; `serverLagSeconds` is served as 0 and
  staleness is judged solely from oracle source timestamps (`oracleHealth`).
- `sui client publish/upgrade` state changes: `contracts/anker_protocol`
  publishes fresh (new original id, new Registry) via
  `scripts/apply-anker-publish.mjs`; the old package's notes keep their type
  identity and silently leave the portfolio.
- Every gRPC client passes `fetchInit: { cache: 'no-store' }`: Next.js patches
  global fetch with a data cache in route handlers, and a cached gRPC-web POST
  freezes oracle reads at their first value — which would eventually trip the
  Oracle Feed Paused gate on perfectly live feeds.
- The 8-04 deployment record is hand-assembled from on-chain state
  (`deployment.testnet.json`, provenance in `wiring.vendoredNote`) because
  upstream has published none; 6-24 is archived as
  `deployment.testnet-6-24.json`. The official switch signal to watch remains
  `packages/predict/sdk/src/config/testnet.ts` upstream.
