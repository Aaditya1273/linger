# Turbo deliberately ignores the 1m/5m cadences

> **Naming update (2026-07):** the "Turbo" product-line name is retired — hourly tenors now live inside the single Dual Investment page (see CONTEXT.md). Every decision below still applies to those hourly tenors: 1h cadence only, per-period yield as the primary figure, no minute-level products.

DeepBook Predict testnet offers 1m, 5m, and 1h cadences. Turbo Dual Investment uses **only the 1h cadence** (three rolling expiries ≈ 1h/2h/3h tenors), even though minute-level markets exist. Minute-level settlement makes a wealth product feel like an up/down bet: it destroys the "structured yield product" positioning (Anker's differentiation against the prediction-market projects on the same track) and is counter-intuitive for the target user (CEX dual-investment users).

For the same reason, sub-day tenors use **per-period yield as the primary figure**. A secondary **reference APR** (simple annualization of the period return, clearly labeled) may appear as muted supporting copy so users can gauge magnitude — it must never become the primary column, headline metric, or a Binance-edge comparison for Turbo. Annualizing a 1-hour coupon as the main number produces scam-looking four-digit percentages.

Do not "helpfully" add minute-level products or promote APR to the primary Turbo display; both were considered and rejected on product grounds, not for technical reasons.
