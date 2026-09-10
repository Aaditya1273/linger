# Benchmark matching picks the nearest settlement and discloses offsets, never gates on them

Until 2026-07-13 the Benchmark matcher paired products by target price + same UTC calendar date. Live data showed that rule was backwards: Binance Dual Investment settles daily at 08:00 UTC while Anker day markets expire at 00:00 UTC, so *every* match carries a fixed 8-hour offset — and the calendar-date rule accepted the worst relative offset on the shelf (the 1.4d tenor, 24% of its span) while rejecting fairer nearest-date comparisons for long tenors (10–14%), leaving 2 of 5 live tenors with any Benchmark at all. We switched to nearest-settlement matching at the same target price, surfaced everywhere as the "nearest-expiry Binance APR" with the Benchmark's own settlement time and tenor printed beside it. Offsets are disclosed, never used to suppress a comparison — the one exception is a sanity bound of offset ≤ 50% of the Anker tenor, beyond which the row honestly says "No comparable product" rather than matching something absurd when Binance's grid has a genuine hole.

## Considered Options

- **Nearest settlement + full disclosure + 50% sanity bound (chosen).** 5/5 live tenors matched; the disclosure itself ("we print the 8-hour settlement offset on every cell") is part of the transparency story.
- **Tiered gating (exact / near / incomparable at a 10% offset line).** Honest but self-harming: it would have suppressed Edge exactly on the short tenors users look at most, and "exact" never occurs in reality (the 8h offset is structural).
- **Same-calendar-date matching (status quo).** A calendar anchor with no economic meaning across tenors; kept only as the thing this ADR retires.
- **No bound at all.** Pure disclosure, but a 1.4d product would eventually "match" a 46d product if short-dated listings vanished.

Only products currently on sale qualify as Benchmark candidates: `canPurchase` is a hard filter, not a tie-breaker. Binance halts subscription some hours before settlement (empirically: products are still purchasable at ~15h lead; the exact cutoff will be mapped by the Recorder's samples), and a benchmark the user cannot actually buy is no benchmark — a halted product is treated exactly like a missing one, falling through to the next-nearest purchasable settlement or to "No comparable product".

## Consequences

- The day shelf's APR-display floor (≥ 24h remaining) caps decay-driven offset at 8h/24h ≈ 33%, so the 50% bound can never fire from time passing alone — only from real gaps in Binance's grid.
- Recorder and product page share one matcher, so recorded statistics cannot drift from what users saw.
- Benchmark Samples store both settlement timestamps raw; the bound is a display/stats-layer constant and can be retightened retroactively over full history.
- Binance's buy-low ladder currently tops out below spot, so the rows nearest the money stay unmatched regardless of rule — that is a strike-coverage gap, reported on Analytics as ladder coverage, not an error state.
