/**
 * Browser-side writes — still inside the DreamDEX boundary.
 *
 * The app never imports the SDK directly; it calls these helpers. The SDK is
 * pulled in through a dynamic import so it lands in its own chunk instead of
 * the shared bundle: it is a large package and only the subscribe path needs it.
 *
 * Writes sign with the user's wallet (wagmi's walletClient), never a stored key.
 */
import type { WalletClient } from "viem";
import type { AnkerBinaryMarket, FillResult } from "./types.js";

export interface BrowserOrderInput {
  readonly walletClient: WalletClient;
  readonly indexerUrl: string;
  readonly wsRpcUrl: string;
  readonly market: AnkerBinaryMarket;
  /** Outcome-token quantity, raw units. */
  readonly quantityRaw: bigint;
  /** Limit price, raw units — already includes the cross buffer. */
  readonly limitPriceRaw: bigint;
}

/**
 * Place one IOC BUY_YES order from the browser.
 *
 * IOC for the same reason as the server path: a resting order on a market whose
 * whole life is ~60s is a stranded position.
 */
export async function placeBrowserBuyIOC(input: BrowserOrderInput): Promise<FillResult> {
  const [{ SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, ORDER_TYPE }, { somniaShannon }] = await Promise.all([
    import("@somnia-chain/markets-sdk"),
    import("@somnia-chain/markets-sdk/chains"),
  ]);

  const exchange = new SomniaMarkets({
    indexerUrl: input.indexerUrl,
    chain: somniaShannon,
    wsRpcUrl: input.wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    walletClient: input.walletClient,
  });

  // Re-check liveness against the chain immediately before signing: the quote
  // the user is looking at may have been built up to a refresh interval ago,
  // which is a meaningful fraction of a 60-second market.
  const onchain = await exchange.client.getMarketOnchain(input.market.marketId);
  if (onchain.status !== 1) {
    return {
      outcome: "FAILED",
      filledRaw: 0n,
      avgPriceRaw: 0n,
      reason: `Market is no longer trading (status ${onchain.status}). Pick the next window.`,
    };
  }

  const trader = exchange.trader;
  if (!trader) {
    return { outcome: "FAILED", filledRaw: 0n, avgPriceRaw: 0n, reason: "Wallet did not provide a signer." };
  }

  try {
    const res = await trader.placeOrder({
      pool: onchain.pool,
      side: "BUY_YES",
      price: input.limitPriceRaw,
      quantity: input.quantityRaw,
      orderType: ORDER_TYPE.MARKET, // 2 = ImmediateOrCancel
    });
    const filledRaw = res.fills.reduce((sum, f) => sum + f.quantityFilled, 0n);
    if (filledRaw === 0n) {
      return {
        outcome: "FAILED",
        transactionHash: res.hash,
        filledRaw: 0n,
        avgPriceRaw: 0n,
        reason: "IOC cancelled unfilled — no resting ask at your limit.",
      };
    }
    const spentRaw = res.fills.reduce((sum, f) => sum + (f.quantityFilled * f.fillPrice), 0n);
    return {
      outcome: "PENDING",
      transactionHash: res.hash,
      filledRaw,
      avgPriceRaw: spentRaw / filledRaw,
    };
  } catch (error) {
    return {
      outcome: "FAILED",
      filledRaw: 0n,
      avgPriceRaw: 0n,
      reason: error instanceof Error ? error.message : "Order reverted.",
    };
  }
}
