# Anker Protocol - Award-Focused Pitch + App Demo Transcript

Core memory:

> Structured-yield product layer on DeepBook Predict, starting with self-custody Dual Investment on Sui.

This version is designed around the judging criteria:

- Real-world application: CEX Dual Investment already has user demand; Binance is used as the strongest benchmark.
- Product and UX: demo a familiar Buy Low flow, not raw Predict legs.
- Technical implementation: show ProductNote, PredictManager container, live quotes, and claim.
- Presentation and vision: position Anker as a structured-yield product layer.

Use quoted text as the spoken script. Use bracketed text as screen actions.

---

## Slide 1 - Title

[Show title slide.]

> Hi, I'm Chen Jie. This is Anker Protocol.
>
> We are building the structured-yield product layer on DeepBook Predict.
>
> The first beachhead is self-custody Dual Investment on Sui, starting with BTC Buy Low.
>
> The bigger direction is a self-custody structured-yield shelf on Sui. The first product is intentionally simple: a product users already understand.

## Slide 2 - Opportunity

[Show Opportunity slide.]

> First, what is Dual Investment?
>
> Dual Investment is a very popular structured-yield product on centralized crypto exchanges.
>
> The basic idea is simple. The user chooses an asset, a target price, and an expiry. In return for accepting a predefined settlement outcome, the user earns a coupon.
>
> It is not only BTC Buy Low. That is just our first product.
>
> In the CEX version, there are usually two familiar directions.
>
> Buy Low is for stablecoin users: I have USDC, I want to buy crypto lower, and I can earn while I wait.
>
> Sell High is for crypto holders: I have BTC, I want to sell higher, and I can earn while I wait.
>
> So before Anker, the product category is already familiar. Users already buy Dual Investment through centralized crypto exchanges.
>
> But the CEX version has three trust problems.
>
> First, custody risk. The user's funds sit inside a CEX account.
>
> Second, opaque APR. The user receives one number, but cannot inspect pricing, spread, or risk premium.
>
> Third, no composability. There is no wallet-owned receipt, no public settlement proof, and no DeFi integration.
>
> That is Anker's opportunity: keep the familiar product experience, then bring custody, transparent pricing, settlement proof, and composability on-chain.
>
> For V1, we start with BTC Buy Low. After that, the same product layer can expand into Sell High and a broader structured-yield shelf on DeepBook Predict.

## Slide 3 - Higher Net APR, Shown Live

[Show Higher Net APR slide. Point to Anker APR, Binance APR, and Edge.]

> This is our core advantage: higher net APR, shown inside the live product.
>
> This screenshot is from the app, not a spreadsheet made for the pitch.
>
> Every row is a BTC Buy Low target.
>
> The user sees three things side by side.
>
> First, Anker APR. This is the user's net APR after our fee.
>
> Second, Binance APR. This is the matched CEX benchmark for the same target and settlement date.
>
> Third, Edge. This is Anker net APR minus Binance APR.
>
> In this snapshot, Anker shows 147.69% versus 128.31% on Binance.
>
> That is a plus 19.38 point net APR edge, after our fee.

---

# Live Demo

## Demo Opening

[Switch to `/app/dual-investment`.]

> This is the live app on Sui testnet.
>
> The demo has three sections: decision, purchase, and redemption.
>
> I am on BTC Buy Low. The user does not start from options jargon. They start from a familiar CEX product.
>
> The pair is BTC over dUSDC, the direction is Buy Low, and the settlement date comes from live-ready DeepBook Predict oracle expiries.

## 1. Compare APRs

[Zoom into `Price & APR reference`.]

> The first screen is a decision screen.
>
> On the left, I see Buy Low targets below current BTC spot.
>
> Then I see Anker estimated APR. This is net of the protocol fee, so it is the take-home APR.
>
> Next to it is Binance APR, pulled from the live Binance Dual Investment benchmark and matched by target and settlement date.
>
> The last column is Edge: Anker net APR minus Binance APR.
>
> This is the product-market fit argument on screen. The user already knows the category, and Anker shows a transparent, self-custody quote next to the CEX quote they recognize.

## 2. Choose a Target

[Click a target row.]

> I choose this target.
>
> The row loads directly into the Buy Low builder.
>
> Here I can adjust the amount, the Buy Low price, and the settlement date.
>
> The app gives a fast estimate immediately, then upgrades to a live executable quote before subscription.
>
> Subscription is not enabled on fake pricing. If the live quote is stale or non-executable, the app blocks the transaction.

## 3. Show the Payoff

[Point to `Return Overview`. Toggle `Above [target]` and `At or Below [target]`.]

> The payoff is explained in user language.
>
> If BTC stays above my target, I keep my dUSDC and earn the coupon.
>
> If BTC settles at or below my target, economically I bought BTC at the price I chose.
>
> On testnet, this is cash-settled in dUSDC for now. The UI says that directly.
>
> This matters for judges because the product is honest about risk. It does not hide behind a high APR headline.

## 4. Open Advanced Details

[Open `Advanced details`. Show `Payoff smoothness`, risk fields, and `DeepBook Predict Legs`.]

> Most users can stay in the simple Buy Low view.
>
> But if they want to inspect the product, Advanced details shows what a CEX normally hides.
>
> Payoff smoothness controls whether we use 3, 6, or 9 Predict legs.
>
> The risk fields show minimum payout, maximum loss, option budget, holding-period return, quote validity, slippage limit, and liquidity.
>
> And below that are the DeepBook Predict legs: every leg, its payout amount, and its ask cost.
>
> This is the technical implementation inside a product UX. DeepBook Predict is not just mentioned. It is the pricing substrate.

## 5. Purchase Flow: Container + Subscribe

[Scroll to `On-chain Subscribe`. Connect wallet if needed.]

> Now I subscribe.
>
> The app first checks whether my wallet has an available product container.
>
> This container is a wallet-owned DeepBook PredictManager.
>
> That matters because the position is not pooled exchange custody. The container belongs to my wallet.

[If needed, click `Create Product Container` and sign.]

> If I do not have one, I create it with one wallet transaction.
>
> After the transaction confirms, the container is ready.

[Click `Subscribe Buy Low` and sign.]

> Now I click Subscribe Buy Low.
>
> Before signing, Anker refreshes the exact quote and preflights the transaction.
>
> I confirm in my wallet.
>
> Now the subscription is submitted.
>
> The principal is inside my wallet-owned product container, the Predict legs are minted, and Anker creates a ProductNote that records the trade terms.

## 6. Dashboard: Track and Verify

[Open `/app/dashboard` or click `View Dashboard`.]

> Now I go to the Dashboard.
>
> This is where the user tracks positions.
>
> I can see total deposited, expected rewards, and open positions.
>
> On the card, I see the deposit, reward, settlement time, and status.
>
> The reward APR is still net of the fee snapshot stored in this ProductNote, so the number stays consistent with what the user saw before subscribing.

[Open `On-chain proof`.]

> If I open On-chain proof, I can verify the position.
>
> Here is the ProductNote object, the subscription transaction, the product container, the oracle, the target price, the floor, the payout range, positions held, backing ratio, and the number of legs.
>
> The links go to the Sui explorer.
>
> This is the difference between an exchange account entry and an on-chain product receipt.

## 7. Redemption Flow

[Use a pre-existing settled position in `Ready to claim`.]

> For the redemption step, I use a position that has already reached settlement.
>
> After expiry, the Dashboard moves the position into Ready to claim.
>
> Depending on the state of the Predict legs, the app shows either Redeem positions or Claim cash.

[If the button says `Redeem positions`, click it and sign.]

> In this example, the first action is Redeem positions.
>
> That redeems the Predict legs so the position can settle.
>
> I sign the transaction, and the Dashboard refreshes.

[Then click `Claim cash` and sign. If it already says `Claim cash`, start here.]

> Now the position is claimable, so I click Claim cash.
>
> This withdraws the final payout to my wallet.
>
> The performance fee is taken here, on-chain, and only on the coupon.
>
> If there is no coupon, there is no fee. If the user earns one hundred dollars of coupon, the user keeps ninety and Anker earns ten.

[Show completed card and transaction links.]

> Now the position is completed, and the redeem and settlement transactions are visible in the proof section.
>
> This is the full loop: compare APR, choose target, inspect the quote, subscribe from my wallet, receive a ProductNote, and claim after settlement.
>
> This is not just a Predict UI. It is a user product with custody, pricing, and settlement proof.

---

## Slide 5 - Business Model

[Show Business Model slide.]

> The business model is simple: Anker takes ten percent of the coupon only, not principal.
>
> The APR users see is already net of that fee, and if there is no coupon, there is no fee.

## Slide 6 - Why APR Can Be Structurally Better

[Show Why APR Can Be Structurally Better slide.]

> That fee model is why APR can be structurally better: a CEX earns more when it pays users less, while Anker earns more when the user's coupon is higher.
>
> And because DeepBook leg costs and the Binance benchmark are visible, hidden margin gets compressed.

## Slide 7 - Why DeepBook Predict

[Show Why DeepBook Predict slide.]

> DeepBook Predict gives us the on-chain primitives: BTC oracles, expiries, strikes, pricing, and settlement.
>
> Anker is the product layer on top: BTC Buy Low first, then Sell High, range yield, and auto-roll notes.

## Slide 8 - Closing

[Show closing slide with QR and URL.]

> Anker is building self-custody structured yield on Sui.
>
> The first product is BTC Buy Low, live today with transparent pricing, a Binance benchmark, and on-chain settlement proof.
>
> Next, we expand into Sell High, range yield, and auto-roll notes on DeepBook Predict.
>
> You can try it live at ankerprotocol.xyz.
>
> Thank you.

---

# Fast Cut

If the demo runs long:

1. Skip the field-by-field Advanced details readout.
2. Use a pre-created product container.
3. Use a pre-settled dashboard card for redemption.
4. Shorten Slide 7 to: "DeepBook Predict supplies the primitives; Anker is the structured-yield product layer."

One sentence judges should remember:

> Anker is self-custody Dual Investment on Sui, powered by DeepBook Predict and benchmarked live against Binance.
