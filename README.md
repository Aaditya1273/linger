# Anker Protocol — Somnia Edition

**Self-custody Dual Investment on Somnia, benchmarked live against Binance & Polymarket. Powered by DreamDEX Event Contracts.**

Somnia Shannon testnet · chainId **50312** · [faucet](https://testnet.somnia.network) · [explorer](https://shannon-explorer.somnia.network)

Anker rebuilds **Dual Investment** — the structured-yield staple every major CEX
sells — as a self-custodial product on Somnia. Your wallet is the only identity.
Principal never enters an Anker account: it sits in DreamDEX as collateral behind
a real Event Contract position, and the **AnkerNote** ERC-721 in your wallet is
the receipt that records every term of the trade.

> I have USDso. I want to earn on it. Show me the reward, the risk, and the exact
> Event Contract behind the number before I commit.

---

## Architecture

```
  browser (wagmi v2 + viem)
      │  wallet IS identity — no account, no password
      ▼
  Next.js app  ── /app/dual-investment · /app/portfolio · /analytics
      │
      ├─ /api/markets   ─┐
      ├─ /api/settled    ├──►  packages/dex  ── THE ONLY DreamDEX boundary
      └─ /api/binance   ─┘         │          (guardrail-enforced)
                                   ▼
                        @somnia-chain/markets-sdk
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          DreamDEX Event Contracts        AnkerNote.sol (ERC-721)
          (collateral + legs live here)   (wallet-owned proof)
                    │
              Somnia Shannon · 50312
```

Every read and write against DreamDEX goes through `packages/dex`. No component,
hook, or route may import the SDK or reach the indexer directly — `npm run lint`
fails the build if one does.

---

## Quickstart

```bash
npm install --legacy-peer-deps
cp .env.example .env            # defaults already point at Shannon

npm run lint                    # typecheck + boundary guardrails
npm run test:unit               # 107 tests
npm run build
npm run dev                     # http://127.0.0.1:3000

# contract
npm run contract:build          # solc -> contracts/build/AnkerNote.json
npm run contract:deploy         # needs a funded burner; writes deployments/testnet.json

# proof: places ONE real IOC order on Shannon and logs the tx hash
npm run smoke
```

The app is fully browsable **without a wallet** — markets, quotes, and Analytics
all render read-only.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SOMNIA_RPC` | yes | Shannon JSON-RPC (`https://dream-rpc.somnia.network`) |
| `WS_RPC` | yes | Shannon websocket, for the SDK's live tail |
| `INDEXER_URL` | yes | DreamDEX indexer (`https://dev.smk.somnia.host/v1/graphql`) |
| `NEXT_PUBLIC_SOMNIA_RPC` / `_WS_RPC` / `_INDEXER_URL` | yes | Same three, for the browser bundle |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | no | Enables the WalletConnect connector; injected wallets work without it |
| `NEXT_PUBLIC_ANKER_NOTE_ADDRESS` | after deploy | AnkerNote address; the portfolio says so when unset |
| `BURNER_PRIVATE_KEY` | scripts only | `smoke.ts` / `deploy.ts`. Testnet burner. **Never committed** — `.gitignore` blocks `.env*` |
| `DATABASE_URL` | no | Neon, for the Benchmark archive. Unset ⇒ Analytics serves the stored window |

No mainnet configuration exists anywhere in the repo.

---

## How we use DreamDEX Event Contracts

Three properties of the venue shape the whole design.

### 1 · One book, two sides

A binary market has a **single YES order book**. NO is that same book inverted —
`noBid = 1 − yesAsk`, quantities carry over. The two sides are held together by
**complete sets**: `1 USDso ⇌ 1 YES + 1 NO`, mintable and burnable at any time,
which is what stops either side drifting from its true complement.

Anker's Buy Low leg is a **YES buy**. `packages/dex` exposes `upSymbol()` and
`downSymbol()` so the product vocabulary reads naturally, but there is only ever
one book underneath, and the ask is read from it in raw bigint units
(`getBinaryOrderBook`), never from a float-rounded convenience tier.

### 2 · Markets die and respawn

A settled market **leaves the live list entirely**. A portfolio that only reads
live markets therefore loses every position at exactly the moment it becomes
claimable. `scanSettled()` reads the dedicated past tier
(`listPastBinaryMarkets`) so the redeem path keeps working after settlement.

Pool addresses are **recycled** across successive markets — the SDK is explicit
that a pool binding is time-varying — so a market is keyed by `marketId` and
never by pool.

### 3 · Liveness is an on-chain question

The indexed status lags the chain, and the timestamp-implicit
Listed→Trading→Settling transitions emit no events at all. Every write is
therefore gated on a fresh `getMarketOnchain(marketId)` with `status === 1`
(Trading), cached for only 3 seconds — on a market whose whole life is 60
seconds, a 15-second-old status read is a quarter of its existence.

Orders are **IOC**, always. A resting order on a 60-second market is a stranded
position: it cannot be cancelled faster than the market settles, and the pool
caps every order's expiry at the market's own expiry. Either the leg crosses now
at the price the quote showed, or the subscription fails cleanly as `FAILED`.

---

## How the quote is built

```
  Q        = principal / targetPrice        (BTC the principal buys at target)
  legCost  = Q × ask                        (live, from the order book)
  coupon   = Q − legCost
  reserve  = principal − Q

  settles ≥ target →  cash + Q  =  principal + coupon
  settles < target →  cash      =  principal − legCost      (cash = principal − legCost)
```

All of it in **bigint**, in the collateral's raw units. Floats are banned in
`packages/dex` by a lint rule; decimals are read from the ERC-20 at runtime and
cached, never hard-coded.

**Yield, not APR.** DreamDEX Shannon's maximum tenor is ~2.7 hours, so a coupon
annualizes to five and six figures. The UI leads with **per-period yield** and
keeps the annualized number muted and labelled — the same rule ADR-0002 set for
the Sui hourly shelf. A quote is only subscribable when it is matched against a
live, on-chain-Trading market with a resting ask; everything else renders as a
clearly-marked snapshot, never a fake APR.

### Why one leg

The Sui original compiled a 3/6/9-rung ladder of fixed strikes sharing one
expiry. Measured across DreamDEX Shannon's entire indexed universe, the venue
offers **at most one fixed strike per (asset, expiry)** and a **~2.7h maximum
tenor**, so a ladder is not constructible today. Buy Low collapses to the single
rung while keeping the payoff identity exactly. Restoring the ladder needs a
day-scale series with multiple strikes — see the roadmap.

---

## Why users earn more

| Value layer | On a CEX | On Anker |
| --- | --- | --- |
| **The option premium** | Opaque spread; the exchange keeps the margin | Market-priced on a public DreamDEX order book, one explicit 10% performance fee on coupon actually earned |
| **The float on idle principal** | The exchange keeps the interest | Routable into SomniaLend, back into the coupon *(roadmap)* |
| **The position itself** | Frozen in an exchange account until settlement | A transferable ERC-721 — portable collateral across Somnia DeFi *(roadmap)* |

The trust layer comes free: funds sit in DreamDEX under your own address, the
AnkerNote is wallet-owned, and the only protocol take is a fee **on coupon, never
on returned principal** — enforced in the contract, not by the client.

## Business model

10% performance fee on coupon actually earned, snapshotted per note at mint so a
later rate change can never be applied retroactively. No coupon, no fee. No
management fee, no spread, no withdrawal fee.

---

## Benchmark & Analytics

The Benchmark Recorder compared Anker's net APR against the matching Binance
Dual Investment product every 15 minutes, accumulating **10,899 matched samples**
(Jul 14–17, 2026): ahead of Binance **98.2%** of the time, median edge **+6.10
APR points**.

**Recording is currently paused, and the page says so.** Binance Dual Investment
is a day-scale product and DreamDEX Shannon has no day-scale shelf, so no row has
anything to pair with. Rather than record empty sweeps, Analytics serves the
stored samples as a **closed observation window** — same verdict band, stats,
Edge Tracks and full methodology, in a completed tense with an explicit
"data through" boundary. Recording reopens the moment day-scale markets exist.

This is the honest version of the claim, and the disclosure is part of the point.

## Roadmap

1. **Register an Anker venue + series on DreamDEX** (`MarketCreatorAdmin`,
   `OracleHubAdmin`) with a day-scale cadence and a real strike ladder. Restores
   the 3/6/9-leg product, makes tenors Binance-matchable, and restarts the
   Recorder live against Binance and Polymarket.
2. **Polymarket column** in Analytics — it has short-horizon Up/Down markets that
   *do* match Shannon's tenors today.
3. **Idle-principal routing** into SomniaLend, back into the coupon.
4. **AnkerNote as collateral** across Somnia DeFi.

## Repo map

| Path | What |
| --- | --- |
| `packages/dex/` | The only DreamDEX boundary — markets, books, IOC orders, settlement scan |
| `contracts/AnkerNote.sol` | ERC-721 Position receipt; on-chain fee enforcement |
| `src/products/buyLow.ts` | The quote compiler (bigint) |
| `src/wallet/` | wagmi config, Shannon chain, AnkerNote binding |
| `src/recorder/` | Benchmark archive schema, Edge Tracks, headline stats |
| `scripts/smoke.ts` | Places one real Shannon order; proof of the write path |

## Demo

2–3 minute walkthrough: _(video link — records a real Shannon transaction hash)_

## License

MIT
