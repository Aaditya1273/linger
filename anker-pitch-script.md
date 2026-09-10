# Anker Protocol - Pitch Script (Award-Focused, 8 slides)

Target length: **about 4:45**, with the demo kept tight.

Core memory:

> Structured-yield product layer on DeepBook Predict, starting with self-custody Dual Investment on Sui.

---

## Slide 1 - Title - 0:00-0:10

> Hi, I'm Chen Jie. This is Anker Protocol.
> We are building the structured-yield product layer on DeepBook Predict.
> The first beachhead is self-custody Dual Investment on Sui, starting with BTC Buy Low.

## Slide 2 - Opportunity - 0:10-0:42

> First, what is Dual Investment?
> It is a popular structured-yield product on centralized crypto exchanges.
> The user chooses an asset, a target price, and an expiry, then earns a coupon for accepting a predefined settlement outcome.
> There are two familiar versions: Buy Low, where a stablecoin user earns while waiting to buy crypto lower; and Sell High, where a crypto holder earns while waiting to sell higher.
> So the product category is already familiar on CEXs.
> But the CEX version has three problems: custody risk, opaque APR, and no on-chain composability.
> That is Anker's opportunity: keep the familiar product experience, then bring custody, transparent pricing, settlement proof, and composability on-chain. Our V1 starts with BTC Buy Low.

## Slide 3 - Higher Net APR, Shown Live - 0:42-1:14

> This is our core advantage: higher net APR, shown inside the live product.
> This screenshot is from the app, not a spreadsheet made for the pitch.
> Every row is a BTC Buy Low target.
> The user sees Anker APR, Binance APR, and Edge side by side.
> In this snapshot, Anker shows 147.69% versus 128.31% on Binance.
> That is a plus 19.38 point net APR edge, after our fee.

## Slide 4 - Live Demo - 1:14-3:05

> This is the live app on Sui testnet.
> The demo has three sections: decision, purchase, and redemption.
> First, the decision screen: target price, Anker net APR, Binance APR, and Edge.
> I choose a target, and it loads into the Buy Low builder.
> The payoff view explains the two outcomes. If BTC stays above my target, I keep dUSDC and earn the coupon. If BTC hits my price, economically I bought lower.
> Advanced details show what a CEX hides: payoff smoothness, risk fields, quote freshness, liquidity, and the DeepBook Predict legs behind the APR.
> To subscribe, I use my wallet. If needed, I create a wallet-owned product container. Then I click Subscribe Buy Low and sign.
> The Dashboard shows my ProductNote, product container, explorer links, and position proof.
> For redemption, I use a settled position. The app shows Redeem positions or Claim cash. I sign, claim the payout, and the coupon-only fee is captured on-chain.
> This is not just a Predict UI. It is a user product with custody, pricing, and settlement proof.

## Slide 5 - Business Model - 3:05-3:25

> The business model is simple.
> First, the fee base: Anker charges ten percent of coupon only, not principal.
> The APR users see is already net of this fee, so there is no surprise.
> Second, the alignment: no coupon, no fee.
> Third, the proof: the fee is captured on-chain at claim.

## Slide 6 - Why APR Can Be Structurally Better - 3:25-3:56

> Now this fee model explains why our APR can be structurally better than a CEX quote.
> First, incentives are reversed. A CEX earns more when it pays users less. Anker earns 10% of the coupon, so higher user coupon also raises Anker fee.
> Second, the fee is simple and explicit: 10% of coupon only, not principal, and the APR is already net.
> Third, Anker recreates the payoff from live DeepBook Predict legs instead of running a risk desk that warehouses risk and adds markup.
> Fourth, transparency caps margin: the Binance benchmark and leg costs are visible, so hidden margin gets compressed.

## Slide 7 - Why DeepBook Predict - 3:56-4:24

> Why DeepBook Predict?
> DeFi already had spot, leverage, and price oracles.
> What it never had was a market that prices volatility — the one input every option and structured product needs.
> That used to live only on centralized options desks.
> DeepBook Predict is the primitive that brings it on chain. It prices the option premium, with BTC oracles, rolling expiries, and strike grids, and it settles on chain.
> And because it is composable, apps can build structured payoffs straight on top.
> That is the real unlock. Without on-chain volatility pricing, Buy Low cannot exist on chain.
> DeepBook Predict is the infrastructure. Anker is the product layer that packages it into Dual Investment people already understand.
> Buy Low today. Sell High, range yield, and auto-roll next.

## Slide 8 - Closing - 4:24-4:48

> Anker is building self-custody structured yield on Sui.
> The first product is BTC Buy Low, live today with transparent pricing, a Binance benchmark, and on-chain settlement proof.
> Next, we expand into Sell High, range yield, and auto-roll notes on DeepBook Predict.
> Try it at ankerprotocol.xyz. Thank you.

---

## Cut If Running Long

- Do not read every Advanced detail field. Say: "risk, freshness, liquidity, and every Predict leg."
- Use a pre-created product container.
- Use a pre-settled position for redemption.
- Keep Slide 7 to one sentence: "DeepBook Predict supplies the primitives; Anker is the structured-yield product layer."
