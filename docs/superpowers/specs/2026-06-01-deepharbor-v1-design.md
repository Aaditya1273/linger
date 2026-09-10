# DeepHarbor V1 Design

Date: 2026-06-01

## Summary

DeepHarbor V1 is a real-quote structured product terminal for DeepBook Predict.
It lets users build familiar CEX-style products, starting with Dual Investment
and Shark Fin, while showing the underlying DeepBook Predict legs, costs, and
payoff behavior.

V1 is intentionally execution-agnostic. It uses real DeepBook Predict market and
quote data, but does not depend on the current `PredictManager` execution model
for its core product logic. This keeps the product stable while DeepBook Predict
contracts and position management evolve.

## Product Positioning

DeepHarbor turns DeepBook Predict binaries and ranges into personalized
structured notes.

The product promise is:

```text
CEX-style structured products, transparently built on DeepBook Predict.
```

Users see familiar products:

- Dual Investment: target-buy BTC with USDC.
- Shark Fin: principal-protected range yield.

Advanced users can inspect:

- DeepBook Predict oracle and expiry.
- Spot, forward, and SVI freshness.
- Every leg used in the product.
- Ask cost per leg and total leg cost.
- Scenario-by-scenario payoff.

## V1 Scope

V1 includes:

- Real DeepBook Predict market data.
- Real quote preview for Predict legs through on-chain preview or devInspect.
  If live quote preview is unavailable, the product is marked not executable.
- Dual Investment product builder.
- Shark Fin product builder.
- Preset quote boards for discovery.
- Custom target/range inputs.
- Product compiler from structured product inputs to Predict legs.
- Payoff simulator.
- Leg transparency panel.
- Execution adapter interface for future wallet or contract execution.

V1 excludes:

- DeepHarbor Move contract.
- Custodial vault.
- Pooled user funds.
- Protocol fee capture.
- Tokenized receipt or share.
- Auto-roll custody.
- Guaranteed APR.

These excluded items are roadmap items because DeepBook Predict position
management is expected to change.

## Page Structure

DeepHarbor opens directly into a structured product workspace.

Top bar:

- Product name: DeepHarbor.
- Tagline: On-chain structured products powered by DeepBook Predict.
- Network indicator.
- Quote freshness indicator.
- Wallet connection slot.

Main workspace:

- Left: Product Builder.
- Center: Quote, outcomes, and payoff chart.
- Right: DeepBook Predict Transparency.

### Product Builder

The builder supports:

- Product selector: Dual Investment or Shark Fin.
- Principal input.
- Expiry/oracle selector.
- Target price input for Dual Investment.
- Floor price and step size inputs for Dual Investment.
- Lower bound, upper bound, and step size inputs for Shark Fin.
- Preset quote board for common price bands.
- Custom input for user-specific numbers such as `66,666` or `68,888`.

### Quote And Payoff Panel

The quote and payoff panel shows:

- Estimated coupon.
- Estimated APR.
- Minimum and maximum return where applicable.
- Scenario cards.
- Payoff chart.
- BTC settlement price slider.
- Whether the current structure is attractive under current quotes.

### Transparency Panel

The transparency panel is a core part of the product, not an advanced hidden
mode. It shows:

- Selected oracle ID.
- Expiry.
- Spot and forward.
- Latest SVI timestamp.
- Server checkpoint lag.
- Strike grid alignment.
- Leg list.
- Ask cost per leg.
- Total leg cost.
- Unused principal or yield budget.

## Architecture

V1 is split into six modules:

```text
1. Market Data Layer
2. Quote Provider
3. Product Compiler
4. Payoff Simulator
5. UI State / Product Builder
6. Execution Adapter Interface
```

### Market Data Layer

The Market Data Layer fetches render-ready state from the public DeepBook
Predict server.

Initial endpoints:

- `GET /status`
- `GET /predicts/:predict_id/oracles`
- `GET /oracles/:oracle_id/state`
- `GET /oracles/:oracle_id/svi/latest`

The layer exposes:

- Active BTC oracles.
- Oracle status.
- Expiry.
- Spot.
- Forward.
- SVI params.
- Minimum strike.
- Tick size.
- Server lag.

It does not implement product logic.

### Quote Provider

The Quote Provider returns executable leg pricing.

Preferred V1 strategy:

- Directional positions: preview `predict::get_trade_amounts`.
- Ranges: preview `predict::get_range_trade_amounts`.

The preview can be implemented through devInspect or another official quote
surface if DeepBook Predict exposes one later.

The provider returns a normalized leg quote:

```text
leg_id
instrument_type
oracle_id
expiry
strike
lower_strike
higher_strike
is_up
quantity
ask_price
ask_cost
redeem_preview
quote_timestamp
```

The Product Compiler depends on this normalized shape, not on a specific API or
Move execution flow.

### Product Compiler

The Product Compiler is the core DeepHarbor module. It takes user product
inputs, market data, and leg quotes, then returns a structured product quote.

It does not call wallet APIs, mutate chain state, or rely on the current
`PredictManager` ownership model.

### Payoff Simulator

The Payoff Simulator is deterministic. It takes a structured product quote and a
set of BTC settlement prices, then computes:

- Which legs pay out.
- Which legs expire worthless.
- Final USDC outcome.
- BTC-equivalent outcome where relevant.
- Coupon and APR.
- Best, base, and worst scenarios.

### UI State / Product Builder

The UI state layer manages:

- Selected product.
- User inputs.
- Preset quote selection.
- Custom price edits.
- Quote refresh.
- Loading, stale, and error states.

### Execution Adapter Interface

V1 defines, but does not have to fully implement, execution adapters:

```text
buildOpenTransaction(quote)
buildRedeemTransaction(position)
trackPositions(wallet)
```

Future adapters can target:

- Current wallet-native `PredictManager` execution.
- A DeepHarbor Note contract.
- Fee-taking execution contract.
- Auto-roll mandate.

## Dual Investment Logic

Dual Investment is the V1 flagship product.

User inputs:

- `principal`
- `target_price`
- `floor_price`
- `expiry`
- `step_size`

The product intent:

- If BTC settles above the target, the user receives USDC principal plus coupon.
- If BTC settles below the target, the final USDC balance is shown as
  BTC-equivalent at settlement.

Core calculations:

```text
target_btc_amount = principal / target_price
cash_reserve = target_btc_amount * floor_price
ladder_notional_budget = target_btc_amount * (target_price - floor_price)
```

The compiler builds an UP ladder from floor to target:

```text
floor = 58,000
target = 73,000
step = 2,000

legs:
  UP 58,000
  UP 60,000
  UP 62,000
  ...
  UP 72,000
```

Each crossed strike contributes payout that helps fill one segment of the final
cash outcome. The system quotes every leg with real Predict pricing.

```text
total_leg_cost = sum(leg.ask_cost)
coupon_budget = principal - cash_reserve - total_leg_cost
```

If `coupon_budget <= 0`, the quote is marked unattractive and not recommended.
The UI suggests:

- Higher target.
- Higher floor.
- Wider step.
- Later expiry.
- Different oracle.

Settlement simulation:

```text
settlement <= floor:
  final_usdc = cash_reserve + coupon_budget

floor < settlement < target:
  final_usdc = cash_reserve + paid_up_legs + coupon_budget

settlement >= target:
  final_usdc = principal + coupon_budget
```

BTC-equivalent:

```text
btc_equivalent = final_usdc / settlement_price
```

The UI must disclose both the USDC amount and BTC-equivalent result so users can
compare the product against a direct BTC purchase.

## Shark Fin Logic

Shark Fin is the second V1 product.

User inputs:

- `principal`
- `lower_bound`
- `upper_bound`
- `expiry`
- `step_size`
- `base_yield_assumption`

The product intent:

- Below the lower bound, principal is protected and return is minimal.
- Inside the range, return rises with BTC settlement price.
- Above the upper bound, return is capped.

Core calculations:

```text
protected_principal = principal
yield_budget = principal * base_apr * days_to_expiry / 365
total_leg_cost = sum(leg.ask_cost)
unused_yield = yield_budget - total_leg_cost
```

The compiler spends yield budget on a range-like Predict structure:

- UP ladder inside the range, or
- `mint_range(lower, upper)` representation if it provides better quoting and
  explanation.

Example:

```text
range = 74,000 - 86,000
step = 1,000

legs:
  UP 74,000
  UP 75,000
  ...
  UP 85,000
```

Settlement simulation:

```text
settlement <= lower:
  final_usdc = principal + unused_yield

lower < settlement < upper:
  final_usdc = principal + unused_yield + realized_ladder_payout

settlement >= upper:
  final_usdc = principal + unused_yield + max_range_payout
```

The base yield assumption is configurable in V1. Predict legs must still use
real quote data. If `total_leg_cost > yield_budget`, the structure is marked not
recommended because the assumed yield cannot fund the option package.

## Preset Quote Board

Preset quote boards guide users before they enter exact custom numbers.

Dual Investment presets:

- Targets near `spot * 95%`, `spot * 92%`, `spot * 90%`, and `spot * 88%`.
- Floor and step generated from a risk mode.
- Display estimated APR, coupon, floor, and leg cost.

Shark Fin presets:

- Ranges around spot, such as `spot +/- 5%`, `spot +/- 8%`, and `spot +/- 12%`.
- Display min return, max return, and leg cost.

Presets are discovery tools only. Final quotes must refresh after custom input.

## Strike Alignment

Users can enter arbitrary target and range prices, but executable Predict legs
must align to the oracle strike grid.

The UI preserves the user intent and discloses execution alignment:

```text
User target: 73,188.873666
Executable strike: nearest valid grid strike
Rounding impact: displayed in USDC and bps
```

The compiler must never silently execute a different strike from what the user
sees.

## Data Freshness And Errors

Each quote displays:

- Spot timestamp.
- SVI timestamp.
- Quote timestamp.
- Server checkpoint lag.

Freshness states:

```text
fresh: under 10 seconds
warning: 10 to 60 seconds
stale: over 60 seconds
```

The UI handles:

- Predict server unavailable.
- Server lag too high.
- No active oracle.
- Oracle close to expiry.
- Stale SVI.
- Strike out of grid.
- Quote cost too high.
- Coupon less than or equal to zero.
- Not enough valid strikes.
- DevInspect or quote preview failure.

Errors should include next actions:

- Try a later expiry.
- Widen the price range.
- Increase step size.
- Choose a target closer to the grid.
- Refresh quote.

For demo resilience, the app can show the latest successful quote snapshot if a
refresh fails. It must label the snapshot as stale and not executable.

## Testing Strategy

Compiler unit tests:

- Dual Investment leg generation.
- Shark Fin leg generation.
- Strike rounding.
- Coupon-positive and coupon-negative cases.

Payoff simulator unit tests:

- Settlement below floor.
- Settlement exactly at floor.
- Settlement inside ladder.
- Settlement exactly at target.
- Settlement above target.
- Shark Fin below range, inside range, and above range.

Quote provider tests:

- Parse saved real API responses.
- Normalize oracle and SVI fields.
- Normalize quote preview responses.
- Fail gracefully on missing or renamed fields.

Integration smoke tests:

- App can fetch `GET /status`.
- App can fetch active BTC oracles.
- App can select one active oracle.
- App can generate at least one Dual Investment quote.
- Payoff chart data is non-empty.
- Transparency panel has at least one quoted leg.

## Demo Narrative

The demo should explain:

```text
Prediction markets expose binary trades directly.
DeepHarbor compiles those binaries into familiar structured products.
```

Demo flow:

1. Open Dual Investment.
2. Show preset target-buy quotes.
3. Enter a custom target such as `66,666`.
4. Show live DeepBook Predict oracle, SVI, and strike grid.
5. Show the generated UP ladder.
6. Show ask cost, coupon, APR, and payoff chart.
7. Move the settlement slider and show which legs pay out.
8. Switch to Shark Fin to show the same compiler pattern for a second product.
9. Explain that execution is adapter-based because `PredictManager` is changing.

The closing message:

```text
DeepHarbor is a real-quote structured product terminal today, and an on-chain
structured note protocol when DeepBook Predict exposes the right position
management surface.
```

## Roadmap

Near-term:

- Wallet execution adapter for current `PredictManager`.
- Position tracker and redeem helper.
- Better real quote preview if DeepBook exposes a dedicated quote endpoint.

Protocol layer:

- DeepHarbor Note contract.
- Fee capture.
- Tokenized structured note receipt.
- Delegated position management.
- Auto-roll mandate.

Expanded products:

- Discount Buy.
- Premium Sell.
- KO-zone Dual Investment.
- Auto-roll strategy templates.

## References

- DeepBook Predict problem statement: `DeepBook Predict Problem Statement.md`
- DeepBook Predict docs: https://docs.sui.io/onchain-finance/deepbook-predict/
- DeepBook Predict codebase: https://github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16/packages/predict
- Public Predict server: https://predict-server.testnet.mystenlabs.com
