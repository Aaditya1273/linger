# Anker Protocol — Submission Copy

Paste the block that fits each field on the submission form. All facts match the README + live app.

---

## 0) Description — "What it does, why it matters" (primary submission field)

**What it does**

Anker pays you a reward for agreeing to buy Bitcoin at a lower price. You pick a price below today's, pick a date, and you earn while you wait — it's the same "buy the dip and earn" product millions of people use on Binance, except your money stays in your own wallet. And right on the screen, Anker shows you how its rate compares to Binance, live. It's live now at **ankerprotocol.xyz**.

**Why it matters**

On an exchange, you give up control of your money, you can't see how they set the rate, and you can't prove what you actually own. Anker keeps the same simple experience but fixes all three: you hold your own money, you can see where the reward comes from, and every position is recorded on-chain so anyone can check it. And you usually earn more than Binance pays for the same trade — and you can watch that difference live, instead of just taking our word for it.

---

## 1) Tagline (one line)

> Self-custody Dual Investment on Sui — with a live Binance APR check built right into the product. Powered by DeepBook Predict.

*(shorter alt)* Self-custody Dual Investment on Sui, benchmarked live against Binance.

---

## 2) Short summary (2–3 sentences)

Anker Protocol rebuilds Dual Investment — one of the most popular structured-yield products on centralized exchanges — as a **self-custody** product on Sui, powered by **DeepBook Predict**. You buy BTC lower and earn a yield while you wait, but your funds stay in your own wallet, you can inspect exactly how the APR is built, and every position is an on-chain receipt. The wedge: the discovery screen shows **Anker's net APR next to the live Binance APR for the same trade** — so the advantage is proven inside the product, not claimed in a pitch.

---

## 3) Full description

**What it is**
Anker Protocol is a structured-yield product on Sui. Its first product is **BTC Buy Low** (dUSDC-denominated): you pick a target BTC price below spot and a settlement date, and earn a coupon for committing to buy lower. It's the same product millions already use on Binance Dual Investment — rebuilt so you keep custody, can see how the yield is made, and can verify everything on-chain. **Live today on Sui testnet at ankerprotocol.xyz.**

**The problem**
CEX Dual Investment is popular but asks the user to accept three hidden costs: you give up **custody** (funds sit in an exchange account), the **APR is a black box** (the exchange sets the spread), and there's **no proof** (you can't independently verify what you hold or what it settles to). Anker keeps the exact same user journey — pick a price, pick a date, see the reward — and moves the construction on-chain so none of that is hidden.

**What makes Anker different**

- **A live Binance benchmark, inside the product.** Most "better than the CEX" claims live in a pitch deck. Anker makes it a column: `Est. APR` (Anker, net of fee) · `Binance APR` (live) · `Edge`. The Binance row is pulled live from the public API, matched by strike + settlement date, and refreshed ~10s. The proof is in the app.
- **Self-custody by construction.** Funds never sit in an exchange account. Each position lives in a **wallet-owned DeepBook PredictManager container** you create and control — not pooled protocol custody.
- **No black box.** The APR isn't quoted at you — it's **compiled from real DeepBook Predict legs**, each priced with a live on-chain quote (Sui `devInspect`). You can expand and inspect every leg, strike, payout, and cost.
- **On-chain proof.** Every subscription mints a **ProductNote** — a Move object in your wallet recording every term of the trade — with an event-indexed dashboard and explorer links for each object and transaction.
- **One small, transparent, aligned fee.** A single **10% performance fee on the coupon only** (never principal). The APR you see is already net of it. No coupon, no fee — Anker earns more only when you do.
- **A structural edge, shown live.** Because the premium is market-priced on DeepBook Predict (not a CEX counterparty's spread), the take is one small explicit fee, and incentives are aligned, more of the yield reaches the user — in testnet observation, typically **~10–20 percentage points higher net APR** than the matched Binance row. It's market-dependent and shown live, so you can verify it the moment it appears.

**Why DeepBook Predict (the unlock)**
DeFi already had spot, leverage, and price oracles — but no on-chain market that prices **volatility**, the one input every option and structured product needs. That lived only on CEX options desks. **DeepBook Predict brings volatility pricing on-chain, composably** — with BTC oracles, rolling expiries, strike grids, and on-chain settlement. Anker is the **product layer** on top: it packages those primitives into Dual Investment a normal user already understands. Without DeepBook Predict, an on-chain Buy Low product couldn't exist.

**What's live today**
The full path works end-to-end on Sui testnet: discover BTC oracles → compare net APR vs live Binance → subscribe → mint a ProductNote → track in the dashboard → claim. A Next.js app plus a **Move package deployed on Sui testnet**, live `devInspect` quote previews, an event-indexed dashboard with explorer links, and CI with static guardrails that block misleading or unsafe patterns.

**Vision**
Anker is the **structured-yield product layer on DeepBook Predict**. BTC Buy Low is the beachhead; next come Sell High, principal-protected range yield, capped notes, auto-roll series, and tokenized vault shares other Sui protocols can build on.

---

## 4) Built with (tech stack)

Sui · Move · DeepBook Predict · Next.js · TypeScript · React Query

---

## 5) Links

- **Live app:** https://www.ankerprotocol.xyz
- **Code:** https://github.com/cl-fi/AnkerProtocol
- **Network:** Sui testnet
- **DeepBook Predict:** https://docs.sui.io/onchain-finance/deepbook-predict/

---

## 6) Suggested tags

DeFi · Structured Yield · Dual Investment · Self-custody · DeepBook Predict · Options · Sui
