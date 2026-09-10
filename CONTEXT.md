# Anker Protocol

Non-custodial structured yield products (dual investment, shark fin) on Sui, built on DeepBook Predict's range-digital option markets.

## Language

### Products

**Dual Investment (双币投资)**:
Anker's flagship structured product: deposit quote asset, pick a target price and tenor; at expiry the deposit either converts at the target price or is returned, and the coupon is paid either way. Mirrors the CEX product of the same name. A single product whose tenor list spans hourly to day-scale; hourly tenors show per-period yield with at most a muted reference APR (ADR-0002), and minute-level tenors are deliberately not offered.
_Avoid_: dual currency, DCI, 双币盈 (Binance brand name — use only when citing Binance), Turbo (retired name for the hourly tenors — no longer a separate product line)

**Shark Fin (鲨鱼鳍)**:
Principal-protected range product: enhanced coupon if price stays inside a bound, base coupon otherwise.

**Tenor (期限)**:
Time from subscription to expiry of a product. Dual Investment tenors run from hourly to day-scale (1d–14d); day-scale is the primary offering, and hourly stays tradable even when day-scale live markets are unavailable. A market's shelf follows its remaining tenor: at least a day remaining sells on the day shelf, under a day on the hourly shelf — a day-born market that decays below one day is offered as an hourly product (per-period yield, like its shelf-mates) while it can still quote. Minute-level tenors are never offered.
_Avoid_: duration, term, expiry length

### Lifecycle

**Subscribe (订阅)**:
A user enters a product: deposits principal and opens a Position in one transaction.
_Avoid_: buy, invest, mint (mint refers to the underlying Predict legs)

**Position (仓位)**:
One structured-product holding: opened by Subscribe, closed by Claim. The user-facing unit of the portfolio — users have Positions, see Position cards, and track each Position's yield. Backed on-chain by a ProductNote object, which is implementation vocabulary only (contracts, code, on-chain proof disclosures) — never user-facing copy, same treatment as AccountWrapper.
_Avoid_: note / 产品凭证 (retired user-facing name — structured-note jargon foreign to CEX users), receipt, ticket

**Leg (腿)**:
One DeepBook Predict order minted as part of a subscription. A Position is composed of one or more legs.
_Avoid_: option, bet

**Settlement (结算)**:
The moment the underlying expiry market fixes its settlement price after expiry. Settlement is protocol-side and permissionless; it is not an Anker action.

**Claim (领取)**:
The user (or a keeper on their behalf) redeems the settled legs and withdraws principal plus payout, closing the Position.
_Avoid_: redeem (reserved for the Predict-level leg operation), withdraw

### Wallet

**Receive (收款)**:
Wallet-level action: present the connected wallet's own Sui address (with QR) so assets on the Sui network can be sent to it — e.g. a CEX withdrawal landing in the user's address. Funds arrive in the user's own wallet, never an app-side account.
_Avoid_: deposit / 充值 (implies a platform account holding the funds; "deposit" is reserved for Subscribe's principal deposit)

**Send (转出)**:
Wallet-level action: transfer an asset from the connected wallet to another Sui address — e.g. back to a CEX deposit address. Send moves Available funds only; it never touches a Position, which is closed only by Claim.
_Avoid_: withdraw / 提现 (already banned for Claim; wallet-out is Send), transfer (reserved for the low-level PTB operation)

**Available (可用)**:
The dUSDC a user can Send or Subscribe with right now. Always one number, everywhere in the app — the wallet's coins plus any idle AccountWrapper balance are never shown as separate pools.
_Avoid_: wallet balance (undercounts idle wrapper funds), spendable, free balance

**In Position (持仓中)**:
The principal currently locked inside open Positions: money that has left Available at Subscribe and returns — plus payout — only at Claim.
_Avoid_: total deposited / 总存入 (retired metric label), locked, staked

**Total Assets (总资产)**:
Available plus In Position principal. Expected rewards are displayed separately and are never counted into Total Assets before Claim.
_Avoid_: portfolio value, net worth, balance (ambiguous with Available)

**Cumulative Rewards (累计收益)**:
The realized sum of payout minus principal across every Claim the user has made — money already in hand, distinct from expected rewards on open Positions. Counted from the current deployment onward.
_Avoid_: total earnings, historical yield, PnL (implies mark-to-market of open Positions)

### Benchmarking

**Benchmark (基准)**:
The comparable Binance Dual Investment product for an Anker quote row: same target price, nearest settlement time, and currently on sale — a halted product is no benchmark, exactly as if it did not exist. Surfaced as the "nearest-expiry Binance APR" (最近到期 Binance APR), always shown with the Benchmark's own settlement time and tenor; the settlement offset is disclosed alongside Edge — never used to suppress a comparison.
_Avoid_: competitor quote, reference product, same-day match (retired rule — calendar-date matching rejected fairer nearest matches)

**Edge (领先幅度)**:
Anker net APR minus Benchmark APR for the same matched row, in percentage points; positive means Anker leads. Defined only where a Benchmark match exists.
_Avoid_: spread, premium

**Edge Track (领先轨迹)**:
One Expiry Market's Edge history: from its first Benchmark Sample until the market leaves the day shelf. Surfaced on the Analytics page one Track at a time — a median line with a min–max band across that market's ladder rows.
_Avoid_: per-tenor line (retired chart grouping — a market's history jumped between remaining-tenor bucket lines), curve, series

**Benchmark Sample (基准采样)**:
One recorded comparison for one day-tenor ladder row at one instant: the Anker quote, the Benchmark result (or its absence), and the data-source condition at that moment.
_Avoid_: snapshot / 快照 (names the retired day-browse fallback tier, ADR-0011)

**Run (采样轮)**:
One scheduled sweep that records Benchmark Samples across the whole day-tenor ladder. Degraded or failed sweeps are recorded as such, never silently skipped.

**Benchmark Recorder (基准记录器)**:
The subsystem that executes Runs and persists Benchmark Samples, feeding the analytics page and internal monitoring. Paused since the 8-04 migration — the current deployment has no day shelf to sample — so Analytics serves the stored Samples as a closed observation window (a frozen archive, ADR-0013); recording reopens when day-scale markets return.

### Upstream (DeepBook Predict)

**AccountWrapper**:
The DeepBook Predict custody object that holds a subscriber's deposited funds and minted legs. One wrapper per subscriber; Anker ProductNotes record its object id. Created invisibly as a one-time setup step inside the first subscription flow — never presented to users as an account they own or manage; the wallet is the only user-facing identity.
_Avoid_: Manager, PredictManager, product container, Predict account (retired user-facing name — implies a manageable account concept)

**Cadence**:
A DeepBook Predict schedule that continuously creates per-expiry markets (currently 1m / 5m / 1h on testnet). Anker's hourly tenors use only the 1h cadence.

**Expiry Market**:
One DeepBook Predict market object for a single expiry timestamp, discovered from the Predict indexer; where legs are minted, priced, and settled.
_Avoid_: oracle market (pre-6-24 vocabulary), pool

**Oracle Feed Paused (预言机暂停推送)**:
The designed product state entered when the upstream Block Scholes push behind on-chain mint pricing stops or goes missing (detected from the feed source timestamps the quote pipeline already carries; `src/products/oracleHealth.ts`). Quotes stay browsable as indicative, but every quote compiles non-executable with `warningCode: 'oracle-paused'`, so the subscribe CTA is disabled with a localized explanation on desktop and phone alike — a mint would only abort `EBlockScholesPriceStale` on-chain. Claiming settled notes is unaffected (settlement uses the Pyth price and the redeem path needs no pricer). First observed 2026-08-05 22:52 UTC when upstream cut the 6-24 deployment's Block Scholes push for good while switching to the 8-04 deployment; resolved by migrating to 8-04 (ADR-0012).
_Avoid_: surfacing the raw Move abort to users, treating the pause as a transient network error

**Deployment Generation (部署代际)**:
One complete upstream publish of the DeepBook Predict package set (4-16 → 6-24 → 8-04). The app targets exactly one generation at a time, vendored as `deployment.testnet.json`; a generation switch is a clean cut — positions, wrappers, and the Anker contract's `account` dependency all belong to a generation, so old-generation Positions leave the portfolio and Cumulative Rewards restarts (ADR-0012). Since 8-04 every Predict read is on-chain (no upstream indexer serves the live generation).
_Avoid_: mixing object ids across generations in one config, treating an upstream redeploy as an upgrade

**Snapshot (行情快照)** — retired (ADR-0011):
The demo-era committed photograph of 4-16 Legacy Oracle states + Binance benchmark that once backed day browse when live markets were unreachable. Removed along with Demo Mode: the app now serves live data or an honest error state, never stand-in data. The term survives only in historical Benchmark Sample rows (`source = 'snapshot'`) recorded while the tier existed.
_Avoid_: reintroducing any stand-in market data as a "temporary" fallback
