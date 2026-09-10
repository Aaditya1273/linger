# Day browse falls back to the Snapshot, never to Legacy Oracles

Until 2026-07-13 the day-tenor ladder had three tiers: live 6-24 Expiry Markets → 4-16 Legacy Oracles (chain-direct) → committed Snapshot. We removed the middle tier: day browse now degrades straight from live markets to the Snapshot. The 4-16 feed had drifted far from the real market — both its BTC price and the coupon quotes derived from it sat well below the live Binance benchmark shown beside them — yet the rows presented themselves as live. Block Scholes then stopped pushing to the 4-16 oracles entirely on 2026-07-12, hours after the committed Snapshot was captured, so the tier's premise ("still-updating") was gone too. An honestly labeled frozen photograph beats data that pretends to be live: trustworthiness of displayed data outranks its freshness.

## Considered Options

- **Snapshot as the only fallback (chosen).** One coherent photograph — oracle states and Binance benchmark captured at the same instant, every clock frozen at capture time under a visible "as of" label.
- **Keep the Legacy Oracle tier.** Live-ish data, but wrong: stale pushes rendered as live prices next to a real-time Binance comparison. Also about to self-destruct — the last 4-16 oracles expire at the end of July 2026 and can never come back.

## Consequences

- Showing the Snapshot now *means* "live day-scale Expiry Markets are temporarily unreachable" — copy says so and no longer promises a migration.
- The parsers for 4-16 oracle objects (`src/deepbook/legacyOracles.ts`) survive only because the Snapshot stores that format; the app never reads 4-16 from chain.
- The committed Snapshot (captured 2026-07-12, just before the feed died) is effectively the last possible 4-16 capture — and that is fine: the Snapshot is a demo-era stopgap, hand-picked for presentation, not a long-term backstop. Once live 6-24 day markets are dependable the whole snapshot tier is expected to be removed, so no 6-24 capture path will be built.
