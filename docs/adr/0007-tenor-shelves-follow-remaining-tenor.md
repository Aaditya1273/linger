# Tenor shelves follow remaining tenor; decayed day markets join the hourly shelf

A product's economics are set by its remaining horizon, not its creation span: a market with three hours left is an intraday trade — held, priced, and displayed in per-period yield (ADR-0002) like one — whether it was born as a 3h or a 7d market. Shelving therefore follows remaining tenor: at least one day remaining sells on the day shelf, under one day on the hourly shelf, and a day-born market crossing the line migrates to the hourly shelf, staying subscribable while it still quotes a positive coupon. The alternative — immutable classification by birth tenor — was drafted earlier the same day (this ADR's number originally carried it) and rejected before any implementation landed: it marooned per-period-yield rows on the day shelf beside APR rows, while markets with the identical holding horizon sat on the hourly shelf below — one holding decision split across two shelves with two yield notations. The buyer of a 6-hours-left product is an hourly buyer ("a few extra basis points for holding until tonight"), so the product meets them on the hourly shelf.

## Considered Options

- **Remaining-tenor shelving (chosen).** Same horizon → same shelf → same notation; markets migrate shelves at the 24h line and leave only when unquotable or expired.
- **Birth-tenor immutable classification.** "A market is what it was created as" sounds principled but ships the display incoherence above; drafted and reversed the same day on product grounds.
- **Retiring decayed day markets from both shelves.** Hides genuinely subscribable inventory during its most active final day.

## Consequences

- The hourly shelf now spans anything under 24h remaining, not just the 1h cadence's native 1–3h; hourly curation, tenor labels, and sorting must handle 4–23h rows.
- Minute-cadence markets stay excluded (ADR-0002). Today the hourly predicate admits markets by matching the 1h cadence fingerprint, and day-born markets pass only because they happen to share those params — the durable predicate is exclusion-based ("sub-day remaining AND not minute-cadence"), so shelving does not hinge on that coincidence.
- The Benchmark surface is untouched: APR + Benchmark render only at ≥ 1 day remaining, i.e. only on the day shelf, so the Recorder's sampling scope and ADR-0006's ~33% decay cap on settlement offset hold unchanged.
- The existing thin-yield pruning rule governs a decayed market's final hours: when the coupon can no longer clear the floor, the row leaves the shelf on its own.
