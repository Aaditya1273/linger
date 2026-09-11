# DoraHacks submission checklist

Deadline **2026-09-11 23:30**. Three things remain, all requiring your keys or your voice.

---

## 1 · Push to a real repo (BLOCKING)

`origin` still points at `https://github.com/Aaditya1273/linger.git` — an unrelated
project. Submitting that link submits the wrong repo.

```bash
gh repo create anker-somnia --public --source=. --remote=upstream --push
# or, with an existing empty repo:
git remote set-url origin https://github.com/<you>/anker-somnia.git
git push -u origin main
```

Confirm `.env` is absent from the push — `.gitignore` blocks `.env*`, and only
`.env.example` is tracked.

## 2 · Fund a burner, deploy, prove the write path — ✅ DONE

```bash
# a) get STT
open https://testnet.somnia.network      # paste the burner address

# b) put the key in .env (never committed)
cp .env.example .env && $EDITOR .env     # set BURNER_PRIVATE_KEY

# c) deploy the note contract
npm run contract:build
npm run contract:deploy                  # prints the address + explorer link

# d) paste the printed line into .env
#    NEXT_PUBLIC_ANKER_NOTE_ADDRESS=0x...

# e) place ONE real order and capture the hash for the video
npm run smoke
```

`smoke` self-funds USDso through the SDK faucet; only STT gas needs the human
faucet. It prints a `shannon-explorer.somnia.network/tx/…` link — **that hash is
what the judges want to see.**

> Shannon markets live ~60 seconds. If `smoke` reports "no market is
> simultaneously Trading on-chain and has a resting ask", that is timing, not a
> fault — run it again.

## 3 · Record 2–3 minutes

Shot list, in scoring order (Technical 25 · Innovation 20 · UX 20 · Impact 20 · Presentation 15):

| Time | Shot | Say |
| --- | --- | --- |
| 0:00 | Landing → `/app/dual-investment` | "Dual Investment — the yield product every CEX sells — rebuilt self-custodially on Somnia." |
| 0:20 | The reference table, live | "Every row is a real DreamDEX Event Contract, priced off the live order book. This refreshes every ten seconds because Shannon markets live about a minute." |
| 0:40 | Point at the **Polymarket** and **Edge** columns | "Same question, priced on Polymarket. Edge is how many probability points cheaper the DreamDEX leg is — that difference is the user's coupon." |
| 1:05 | Expand **leg disclosure** | "The exact market id, quantity, leg cost, and order type. IOC — on a sixty-second market a resting order is a stranded position." |
| 1:25 | Connect wallet → wrong network → **Switch to Somnia Shannon** | "Wallet is the only identity. No account, no password." |
| 1:40 | Subscribe → both tx | "The DreamDEX leg crosses first; the AnkerNote is minted only after it fills — so a receipt can never exist for a position that didn't." |
| 2:05 | Portfolio: buckets + explorer link | "Ready to claim, Active, Completed. Outcomes are WON / LOST / VOID / FAILED — never a boolean, because a voided market returns your stake and that is not a loss." |
| 2:25 | `/analytics` | "10,899 matched samples against Binance, 98.2% ahead. Recording is paused and the page says so — Binance Dual Investment is day-scale and Shannon has no day shelf. Honest beats impressive." |
| 2:45 | Terminal: `npm run smoke` output + explorer | "One real order on Shannon. Here's the hash." |

Have the explorer tab pre-opened on the tx — waiting for a page load on camera
costs ten seconds you don't have.

---

## What to say if a judge asks "why only one leg?"

Straight answer, and it's a strength: across DreamDEX Shannon's **entire indexed
universe** there is at most **one fixed strike per (asset, expiry)** and a **~2.7
hour maximum tenor**. A 3/6/9-rung ladder is not constructible today. Rather than
fake it, Buy Low collapses to the single rung and keeps the payoff identity
exact. The roadmap's first item is registering an Anker venue and series through
`MarketCreatorAdmin` / `OracleHubAdmin` — which restores the ladder, makes tenors
Binance-matchable, and restarts the Recorder live.

Same for Analytics being an archive rather than a live feed. Both are measured
constraints, disclosed in the product, not gaps someone found.

## Verified state

| Gate | Status |
| --- | --- |
| `npm run build` | passes |
| `npm run lint` (typecheck + 3 boundary guardrails) | passes |
| `npm run test:unit` | 112 passing, 28 files |
| All 3 routes without a wallet | 200 |
| `/api/markets` live Shannon data | yes |
| `/api/polymarket` live ladder | yes, 8 thresholds |
| `grep -riE "mysten\|enoki"` in `src/ app/ packages/` | 0 |
| AnkerNote deployed | **LIVE** `0x863b54bb144cec7ae73d56983193e2e5a60652e3` |
| `smoke.ts` real order | **FILLED** — 1 YES @ 0.968 |

## Live on Somnia Shannon — verified on-chain

| What | Value |
| --- | --- |
| **AnkerNote** | [`0x863b54bb…52e3`](https://shannon-explorer.somnia.network/address/0x863b54bb144cec7ae73d56983193e2e5a60652e3) — `name() = "Anker Note"`, `symbol() = "ANKER"`, `feeBps() = 1000` |
| **Deploy tx** | [`0x442536b7…139b`](https://shannon-explorer.somnia.network/tx/0x442536b7245a17d9e775fa62a642a845fea438f081382eba851f7b5f8787139b) — SUCCESS, block 485300023 |
| **Real IOC order** | [`0x2d9d2788…5f46`](https://shannon-explorer.somnia.network/tx/0x2d9d2788b74f8c8e916e07c4f4de8605b3da22f959b25f46c8e581466b985f46) — SUCCESS, block 485302552, filled 1 YES @ 0.968 |
| **Note minted** | [`0xf3afbcef…285f`](https://shannon-explorer.somnia.network/tx/0xf3afbcef3643fafd60a35da4c1b7818c566bf7b0f91111ed18f39ef77069285f) — Note #1, principal 100 USDso, coupon 0.352941, feeBps snapshot 1000 |
| **Note claimed** | [`0x6fedd020…10b8`](https://shannon-explorer.somnia.network/tx/0x6fedd020b5f49d8a342c5d8f10d85f0fea1d0b8df006c0702e64108bb5ff10b8) — status 0→1 Redeemed, fee of 35,294 pulled by the contract (exactly 10% of coupon) |
| Deployer / signer | `0xf691DBca14ad7733B7266b6B0c512B317843102f` |

**Use these hashes in the demo video** — they prove the write path is real, not a
mock. `npm run note:lifecycle` reproduces the mint→claim pair end to end and
prints fresh links.

The claim tx is the one to linger on: the 35,294 fee inside it was computed and
pulled *by the contract* from the note's own snapshot. The Move original took the
fee as a caller-supplied coin and never checked its value, so a hand-built
transaction paid zero. That is a real bug found and fixed during the port, and it
is visible in a block explorer.
