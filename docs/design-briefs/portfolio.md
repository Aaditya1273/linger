# Design brief — Portfolio (embedded wallet)

> Paste this into a **new Design** in Claude Design that uses the **Anker Protocol
> Design System**. It tells the design agent what to build, with which of our
> components, and what content/states to cover. Style (colors, the "sticker" look,
> Fredoka font) comes from the design system automatically — don't re-specify it.
> Vocabulary follows `CONTEXT.md`: Position (仓位), Available (可用), In Position
> (持仓中), Total Assets (总资产), Cumulative Rewards (累计收益), Receive (收款),
> Send (转出). Never "Note", "deposit/withdraw", or "wallet balance".

## Product context

Anker is a self-custodial Dual Investment (Buy Low / Sell High) product on Sui.
The target user comes from a CEX via Google zkLogin and has no extension wallet,
so **the Portfolio page doubles as their embedded wallet**: it is where they see
Total Assets, move dUSDC in (Receive) and out (Send), and manage every Position.
Gas is sponsored for zkLogin sessions — SUI balances are never shown.

**Build with our components**: `Button`, `Card`, `Badge`, `Stat` + `StatGroup`,
`KeyValue` + `KeyValueList`, `Disclosure`, `Tabs` + `Tab`, `Dialog`, `InputField`.
Don't invent new component styles — compose these.

## Page layout (top to bottom)

### 1. Top nav (full width)
- Left: brand "**Anker Protocol**" with a small anchor mark and a `testnet` tag.
- Center: product links — "Dual Investment", "Portfolio" (**active**), "Analytics".
- Right: language switcher + the **wallet control**:
  - Disconnected → "Connect" button (dapp-kit modal, includes Google zkLogin).
  - Connected → an **account trigger** (green dot + short address + chevron) that
    opens the **account panel**: an **identity row** first — the sign-in identity
    the user recognizes (Google mark + email for zkLogin, wallet icon + name for
    extensions) with the short address demoted beneath it and an icon-only copy
    button — then Total assets (big number) with an Available / In Position
    breakdown, a Receive/Send button pair (both secondary), "View Portfolio"
    link, and a Disconnect row. The panel is the quick wallet; this page is the
    full one. Both open the same Receive/Send dialogs.

### 2. Hero
- `H1`: **Portfolio**
- Subtitle: "Your built-in wallet: balances, transfers, and every position in one place."
- Right-aligned secondary `Button` with a refresh icon: "**Refresh**".

### 3. Wallet band (the page's centerpiece — only when connected)
One hard-shadow card (`.pf-wallet`) containing:
- **Top row**, space-between:
  - Left: the label "**Total assets**", then the hero number "**1,000.00 dUSDC**"
    (display font), then a gold accent line "**+12.34 expected rewards**" (only
    when open Positions exist). No address here — identity lives in the header
    account control, and Receive owns the "get my address" flow.
  - Right: **Receive** (QR icon) and **Send** (arrow icon), both secondary —
    transfers are utilities; gold primary is reserved for Subscribe and Claim.
- **Three metric tiles** (reuse the `.di-portfolio` tile grid):
  - **Available** — 200.00 — hint "Ready to send or subscribe"
  - **In position** — 800.00 — hint "Locked until settlement"
  - **Cumulative rewards** — **+34.56** in green — hint "Realized across all claims"
- **Allocation bar**: a thin gold-on-navy bar showing Available share of Total assets.

Arithmetic rules (from CONTEXT.md): Total assets = Available + In Position
principal. Expected rewards are never counted in. Available is one number —
wallet coins plus idle wrapper funds are never shown as separate pools.

### 4. Positions area
Section heading row: `H2` "**Your positions**" + a `Badge` (tone `positive`) "**3 Positions**".

One muted settlement note for the whole section (testnet cash-settlement
caveat) sits under the heading — never repeated per card.

Filter tabs (only when ≥2 status buckets are non-empty), each with a count:
`All (3)` · `Ready to claim (1)` · `Active (2)` · `Completed (0)`.

Then a single-column list of **Position rows** (a ledger, not a card gallery —
the full-width rows keep the numbers vertically scannable). Each collapsed row:
header "Buy Low BTC @ $62,500" + status `Badge`; inline stats Deposit / Reward
(+APR) / Settles; a chevron Details toggle. **Ready-to-claim rows swap Settles
for "You'll receive" and carry the gold Claim button inline** — claiming never
requires expanding. The expanded detail is optional reading: the two-branch
outcome explainer, plain-row facts (fee, payout range, settlement price), the
info-only payout block for non-claimable states, and the "On-chain proof"
`Disclosure` (ProductNote ID, quote hash, tx digests — the only place
implementation vocabulary is allowed).

## The Receive dialog
`Dialog` titled "**Receive dUSDC**": intro ("Your Sui address. Withdraw from an
exchange or transfer from another wallet to this address."), a QR code in a
sticker frame, the full address in mono with a copy affordance, a coral warning
card "**Sui network only — assets sent from other networks will be lost.**", and
a muted testnet note.

## The Send dialog
`Dialog` titled "**Send dUSDC**": intro ("Transfer dUSDC to any Sui address — for
example an exchange deposit address."), recipient `InputField` (validates Sui
address), amount `InputField` with a **Max** pill, "Available: 200.00 dUSDC"
hint, a gas note ("Gas fees are covered by Anker." for zkLogin / "Gas is paid in
SUI by your wallet." for extensions), inline validation errors, and a full-width
**Send** CTA. Success state reuses the transaction-success card: check mark,
"You sent **150.00 dUSDC**", recipient row, "View transaction" link, Done.

## States to also design (each replaces the positions area)
- **No wallet** — `Card` empty: "Connect your wallet to see your assets and positions."
  (wallet band hidden too)
- **Loading** — `Card` empty: "Loading your positions…"
- **Error** — `Card` error: "Unable to load your positions."
- **Empty (connected, none yet)** — wallet band still shows; `Card` empty: "No
  positions yet for 0xab…cd12. Subscribe to Buy Low to get started."

## Deliverables
1. The main **populated** Portfolio (nav + hero + wallet band + filters + 3 rows).
2. The account panel (open state, connected).
3. The Receive and Send dialogs (form + success).
4. The 4 state variants above.
Keep everything composed from the design-system components and tokens.
