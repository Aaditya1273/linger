# Dual Investment Page Information Decisions

Date: 2026-06-20

## Intent

This pass does not redesign the UI. It decides what information belongs on the
first product page before any layout or visual work.

The current page behaves like a calculator and internal quote workbench. The next
version should read as a product page for **Dual Investment**, with **Buy Low** as
the active product direction and **Sell High** shown as coming soon.

## Product Naming

Use:

- Page/product name: **Dual Investment**
- Active direction: **Buy Low**
- Disabled direction: **Sell High**

Do not use:

- Dual Investment Calculator
- Target Buy as the primary product label
- Target Sale as the primary product label

Reason: Binance and user expectations frame this product as Dual Investment with
Buy Low / Sell High directions. The page should match that mental model.

## Top-Level Information To Keep

Keep these as primary user-facing information:

- Current BTC price.
- Selected settlement date or expiry.
- Quote freshness status.
- Buy Low / Sell High direction selector.
- Sell High disabled with a coming soon state.

Keep, but make secondary:

- Oracle/source status.
- Network/testnet status.
- Last updated time.

Move out of the primary product surface:

- Forward price.
- Strike grid.
- Oracle lag.
- SVI/vault-utilization explanation.
- Predict mint bounds.
- Raw oracle ids.

These are still valuable for transparency, but they are not first-order product
selection information.

## Buy Low Quote List

The quote list should help users compare available Buy Low choices. It should not
feel like a developer scan table.

Keep these columns:

- **Target Price**: show the Buy Low target price.
- **Below Current Price**: combine with target price or show directly beside it,
  for example "5.20% below".
- **Floor Price**: keep because it defines the lower bound of the payoff path.
- **Interval**: keep if the product still uses a payoff ladder.
- **Coupon**: keep as the absolute reward amount.
- **APR**: keep as the annualized comparison number.
- **Cost**: keep as the transparent DeepBook Predict construction cost.

Remove from the primary quote list:

- Legs.
- Action column.
- Internal filter text.
- Default ladder text.
- Local SVI/vault utilization text.
- Grid construction text.

Interaction decision:

- The row itself can become selectable later.
- A separate "Use" action column is not product-like and should be removed from
  the primary table.

Naming decision:

- Prefer "Buy Low Products" or "Available Buy Low Quotes" over "Target Buy BTC
  Estimates".
- Prefer "Cost" over "Ask Cost" unless the transparency drawer is open.
- Prefer "APR" over "Anker APR" in the primary product surface.

## Custom Buy Low Form

The custom form should be reduced to the user's actual product intent.

Keep as primary inputs:

- Subscription amount.
- Target Buy Price / Target Price.

Do not require as primary inputs:

- Floor price.
- Payoff smoothness.
- Number of Predict legs.

Handling decision:

- Floor price, interval, and leg count should be auto-derived from the selected
  quote, market rules, or a later risk mode.
- These can be exposed in an advanced/transparency area, not in the main form.

Button:

- Keep **Preview Live Quote**.
- After a quote is previewed, the page should show a rewards/outcome preview
  before subscription.

## Rewards Preview After Live Quote

After Preview Live Quote, show a Binance-style explanation panel with two
settlement scenarios.

Scenario tabs:

- **BTC settles above target**
- **BTC settles on or below target**

The panel should include:

- Current BTC price marker.
- Target price marker.
- Start date.
- Settlement date.
- Clear settlement curve or payoff illustration.
- Subscription amount.
- Rewards, including APR.
- Total expected payout.
- "You will receive" result.

Buy Low outcome copy:

- If BTC settles above target: user receives principal plus coupon in dUSDC.
- If BTC settles on or below target: production mental model is BTC delivery at
  the target price, but current testnet settlement should be described honestly
  as dUSDC cash settlement or BTC-equivalent until BTC delivery routing exists.

Important product truth:

- Do not claim the user receives BTC on testnet unless the route actually
  delivers BTC.
- If using Binance-style copy, add a compact testnet qualifier where needed.

## Transparency Information

Keep transparency, but move it out of the primary decision path.

Advanced/transparency area may include:

- DeepBook Predict legs.
- Strike list.
- Ask cost per leg.
- Total leg cost.
- Oracle id.
- Strike grid.
- SVI timestamp.
- Server lag.
- Quote TTL.
- Slippage/max cost bounds.
- Liquidity status.

Do not remove this information from the product entirely, because transparency is
part of Anker's differentiation. Just stop making it the first thing the user has
to parse.

## Subscribe / Execution

Keep subscription as the final action after preview, not as part of the scan
table.

Primary CTA flow:

1. Select Buy Low terms or enter amount and target price.
2. Preview Live Quote.
3. Review scenario/rewards preview.
4. Subscribe.

Execution details such as product container, manager readiness, preflight, and
quote envelope status should be operational states near the final Subscribe CTA,
not headline content.

## Current Page Elements To Reclassify

Primary product surface:

- Current BTC price.
- Settlement/expiry.
- Buy Low/Sell High selector.
- Buy Low quote list with target, percent below, floor, interval, coupon, APR,
  and cost.
- Custom amount and target price.
- Preview Live Quote.
- Rewards/scenario preview.
- Subscribe CTA after preview.

Secondary/advanced surface:

- Oracle details.
- Forward price.
- Strike grid.
- Oracle lag.
- SVI and vault utilization.
- Predict legs.
- Ask cost per leg.
- Quote validity.
- Slippage limit.
- Liquidity status.
- Product container / manager details.

Remove or rename:

- "Dual Investment Calculator" -> "Dual Investment".
- "Target Buy" as the top-level direction -> "Buy Low".
- "Target Sale" -> "Sell High".
- "Target Buy BTC Estimates" -> "Available Buy Low Quotes".
- "Design Your Target Buy" -> "Design Your Buy Low".
- "Anker APR" -> "APR" on the primary surface.
- "Ask Cost" -> "Cost" on the primary surface.
- "Action" column -> row selection or a later detail affordance.

## Open Decisions Before UIUX

- Whether Floor Price should be visible in the quote list only, or also editable
  in an advanced mode.
- Whether Cost should remain visible to normal users or move into the quote detail
  while APR/Coupon stay primary.
- How exactly to phrase the testnet cash-settlement limitation without weakening
  the Buy Low mental model.
- Whether the rewards preview should show BTC-equivalent on the below-target
  branch even when payout is dUSDC.
