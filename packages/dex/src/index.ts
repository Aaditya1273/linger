/**
 * `@anker/dex` — the ONLY module permitted to talk to DreamDEX.
 *
 * Every read and write against Somnia Markets goes through here. No component,
 * hook, or route may import `@somnia-chain/markets-sdk` or `fetch` the indexer
 * directly; `scripts/quality-gates.mjs` fails the build if one does. The point
 * is that the venue's quirks — markets that die and respawn, one book serving
 * two sides, an indexer that lags the chain — are absorbed in one place.
 *
 * ## Two DreamDEX mechanics this module exists to hide
 *
 * **One book, two sides.** A binary market has a single YES order book. NO is
 * the same book inverted: `noBid = one − yesAsk`, quantities carry over. A
 * complete set is `1 collateral = 1 YES + 1 NO`, mintable and burnable at will,
 * which is what keeps the two sides arbitrage-tied. Anker's "Up" leg is a YES
 * buy; `downSymbol()` exists so the vocabulary maps cleanly, but there is only
 * ever one book underneath.
 *
 * **Markets die and respawn.** A settled market leaves the live list entirely.
 * Positions in it are still redeemable, so a portfolio that only reads live
 * markets silently loses every claimable position the moment it settles — hence
 * `scanSettled()`, which reads the *past* list. Pool addresses are recycled
 * across successive markets, so a market is keyed by `marketId` and never by
 * pool.
 */

import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  isBinaryMarket,
  ORDER_TYPE,
  type BinaryMarket,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import type { Address, PublicClient } from "viem";

import {
  MARKET_STATUS,
  type AnkerBinaryMarket,
  type AskState,
  type FillResult,
  type SettledMarket,
  type WriteGate,
} from "./types";
import { costOf, crossingPrice, makeReadClient, resolveScale, type Scale } from "./money";

export * from "./types";
export {
  applyBps,
  costOf,
  crossingPrice,
  formatRaw,
  makeReadClient,
  parseRaw,
  resolveScale,
  toUnifiedNumber,
  type Scale,
} from "./money";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DexConfig {
  readonly indexerUrl: string;
  readonly rpcUrl: string;
  readonly wsRpcUrl: string;
  /** Only set for writes (scripts/smoke.ts). The app signs through wagmi instead. */
  readonly privateKey?: `0x${string}`;
}

/**
 * Protocol singleton addresses come from the SDK's own per-chain constants, not
 * from a literal in this repo — that is what "never hard-code addresses" means
 * in practice. Market, pool, and outcome-token addresses are a different thing
 * entirely: they rotate, so they are resolved per market at runtime and cached
 * with a TTL (see `listBinaryMarkets` / `gateForWrite`).
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DexConfig {
  const indexerUrl = env.INDEXER_URL ?? env.NEXT_PUBLIC_INDEXER_URL;
  const rpcUrl = env.SOMNIA_RPC ?? env.NEXT_PUBLIC_SOMNIA_RPC;
  const wsRpcUrl = env.WS_RPC ?? env.NEXT_PUBLIC_WS_RPC;
  if (!indexerUrl) throw new Error("INDEXER_URL is not set (see .env.example).");
  if (!rpcUrl) throw new Error("SOMNIA_RPC is not set (see .env.example).");
  if (!wsRpcUrl) throw new Error("WS_RPC is not set (see .env.example).");

  const key = env.BURNER_PRIVATE_KEY?.trim();
  return {
    indexerUrl,
    rpcUrl,
    wsRpcUrl,
    ...(key ? { privateKey: (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Exchange handle
// ---------------------------------------------------------------------------

export interface Dex {
  readonly exchange: SomniaMarkets;
  readonly read: PublicClient;
  readonly config: DexConfig;
}

/**
 * Build an exchange bound to Shannon.
 *
 * `somniaShannon` is imported rather than hand-defined: the SDK's definition
 * already carries chainId 50312, STT, https://dream-rpc.somnia.network, the
 * Shannon block explorer, and multicall3. A hand-rolled chain literal would
 * drop the explorer and multicall the portfolio needs.
 */
export function createDex(config: DexConfig): Dex {
  const exchange = new SomniaMarkets({
    indexerUrl: config.indexerUrl,
    chain: somniaShannon,
    wsRpcUrl: config.wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    ...(config.privateKey ? { privateKey: config.privateKey } : {}),
  });
  return { exchange, read: makeReadClient(config.rpcUrl), config };
}

/** Collateral scale for a market, resolved from its own ERC-20 and cached. */
export function scaleFor(dex: Dex, market: AnkerBinaryMarket): Promise<Scale> {
  return resolveScale(dex.read, market.collateral);
}

// ---------------------------------------------------------------------------
// Symbols — "one book, two sides"
// ---------------------------------------------------------------------------

/** The YES tradable. Anker's "Up" leg buys this. */
export const upSymbol = (market: AnkerBinaryMarket): string => `${market.symbol}#YES`;

/** The NO tradable — the same book, quoted inverted. */
export const downSymbol = (market: AnkerBinaryMarket): string => `${market.symbol}#NO`;

// ---------------------------------------------------------------------------
// Market discovery, cached with a TTL
// ---------------------------------------------------------------------------

const MARKETS_TTL_MS = 15_000;

interface CacheEntry {
  readonly at: number;
  readonly markets: readonly AnkerBinaryMarket[];
}
let liveCache: CacheEntry | undefined;

function toAnker(row: BinaryMarket): AnkerBinaryMarket {
  return {
    marketId: row.marketId,
    symbol: `${row.asset}-${row.strike}-${row.expiry}/${row.collateral.slice(0, 6)}`,
    asset: row.asset,
    strikeRaw: row.strike,
    mode: row.mode === "reference" ? "reference" : "fixed",
    tradingStartSec: Number(row.tradingStart),
    expirySec: Number(row.expiry),
    collateral: row.collateral as Address,
    indexedStatus: String(row.status),
  };
}

/**
 * Every live binary market, TTL-cached.
 *
 * `loadMarkets(true)` forces a reload rather than early-returning the cached
 * registry — required because market discovery is exactly the thing that goes
 * stale on a venue that respawns markets on a 60-second cadence.
 */
export async function listBinaryMarkets(dex: Dex, opts: { force?: boolean } = {}): Promise<readonly AnkerBinaryMarket[]> {
  const now = Date.now();
  if (!opts.force && liveCache && now - liveCache.at < MARKETS_TTL_MS) return liveCache.markets;

  await dex.exchange.loadMarkets(true);
  const rows = await dex.exchange.client.listBinaryMarkets({ limit: 500 });
  const markets = rows.filter(isBinaryMarket).map(toAnker);
  liveCache = { at: now, markets };
  return markets;
}

/**
 * Markets sharing one expiry, which is the shape Anker's ladder needs.
 *
 * Returned newest-expiry-last so a settlement-date picker can render it
 * directly. Reference-mode (strike 0) markets are excluded: a Buy Low ladder
 * needs fixed thresholds it can order along the price axis.
 */
export function groupByExpiry(
  markets: readonly AnkerBinaryMarket[],
  asset: string,
): ReadonlyMap<number, readonly AnkerBinaryMarket[]> {
  const out = new Map<number, AnkerBinaryMarket[]>();
  for (const m of markets) {
    if (m.asset !== asset || m.mode !== "fixed") continue;
    const bucket = out.get(m.expirySec);
    if (bucket) bucket.push(m);
    else out.set(m.expirySec, [m]);
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => (BigInt(a.strikeRaw) < BigInt(b.strikeRaw) ? -1 : 1));
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

// ---------------------------------------------------------------------------
// Order book — bigint-exact
// ---------------------------------------------------------------------------

/**
 * Best YES ask, in raw collateral units, or an explicit no-liquidity state.
 *
 * Read from the chain tier (`getBinaryOrderBook`) rather than the unified tier
 * so the level stays a bigint end to end. An empty book is a first-class state,
 * never a zero price — quoting a leg at 0 would render as an infinite APR.
 */
export async function bestAsk(dex: Dex, market: AnkerBinaryMarket, depth = 5): Promise<AskState> {
  const gate = await gateForWrite(dex, market);
  if (!gate.ok) return { kind: "no-liquidity" };

  const book = await dex.exchange.client.getBinaryOrderBook(gate.pool, { depth });
  const best = book.yesAsks[0];
  if (!best) return { kind: "no-liquidity" };
  return { kind: "ask", priceRaw: BigInt(best.price), sizeRaw: BigInt(best.quantity) };
}

// ---------------------------------------------------------------------------
// Write gate — live on-chain status, every time
// ---------------------------------------------------------------------------

const onchainCache = new Map<string, { at: number; pool: Address; status: number }>();
const ONCHAIN_TTL_MS = 3_000;

/**
 * Refuse any write against a market that is not live on-chain RIGHT NOW.
 *
 * The indexed `status` lags the chain and the timestamp-implicit
 * Listed→Trading→Settling transitions emit no events at all, so the indexer
 * cannot be trusted for this. Only `status === 1` (Trading) may be written to.
 * The TTL is deliberately short — on a 60-second market a 15-second-old status
 * read is a quarter of the market's entire life.
 */
export async function gateForWrite(dex: Dex, market: AnkerBinaryMarket): Promise<WriteGate> {
  const now = Date.now();
  const cached = onchainCache.get(market.marketId);
  if (cached && now - cached.at < ONCHAIN_TTL_MS) {
    return cached.status === MARKET_STATUS.Trading
      ? { ok: true, pool: cached.pool }
      : { ok: false, reason: "not-trading", status: cached.status };
  }

  let onchain;
  try {
    onchain = await dex.exchange.client.getMarketOnchain(market.marketId);
  } catch {
    return { ok: false, reason: "unknown-market" };
  }
  onchainCache.set(market.marketId, { at: now, pool: onchain.pool, status: onchain.status });

  if (onchain.status !== MARKET_STATUS.Trading) {
    return { ok: false, reason: "not-trading", status: onchain.status };
  }
  if (market.expirySec * 1000 <= now) return { ok: false, reason: "expired" };
  return { ok: true, pool: onchain.pool };
}

// ---------------------------------------------------------------------------
// Orders — IOC only
// ---------------------------------------------------------------------------

/** Buffer over best ask, in bps of one whole outcome token (200 bps = 0.02). */
export const DEFAULT_CROSS_BUFFER_BPS = 200;

/**
 * Buy `qtyRaw` YES tokens, immediate-or-cancel.
 *
 * IOC is not a preference. A resting order on a market whose entire life is 60
 * seconds is a stranded position: it cannot be cancelled faster than the market
 * settles, and the pool caps every order's expiry at the market's own expiry
 * anyway. Either the leg crosses now at a price the quote already showed the
 * user, or it does not happen and the subscription fails cleanly as `FAILED`.
 *
 * Goes through the bigint-exact `trader.placeOrder` rather than the unified
 * `createOrder(…, amount: number, price: number)` so no money value is ever a
 * float on the write path.
 */
export async function buyUpIOC(
  dex: Dex,
  market: AnkerBinaryMarket,
  qtyRaw: bigint,
  opts: { bufferBps?: number } = {},
): Promise<FillResult> {
  if (qtyRaw <= 0n) {
    return { outcome: "FAILED", filledRaw: 0n, avgPriceRaw: 0n, reason: "quantity must be positive" };
  }

  const gate = await gateForWrite(dex, market);
  if (!gate.ok) {
    return { outcome: "FAILED", filledRaw: 0n, avgPriceRaw: 0n, reason: `market not tradable: ${gate.reason}` };
  }

  const ask = await bestAsk(dex, market);
  if (ask.kind === "no-liquidity") {
    return { outcome: "FAILED", filledRaw: 0n, avgPriceRaw: 0n, reason: "no resting ask" };
  }

  const scale = await scaleFor(dex, market);
  const limitRaw = crossingPrice(ask.priceRaw, scale, opts.bufferBps ?? DEFAULT_CROSS_BUFFER_BPS);

  const trader = dex.exchange.trader;
  if (!trader) {
    return { outcome: "FAILED", filledRaw: 0n, avgPriceRaw: 0n, reason: "no signer configured" };
  }

  try {
    const res = await trader.placeOrder({
      pool: gate.pool,
      side: "BUY_YES",
      price: limitRaw,
      quantity: qtyRaw,
      orderType: ORDER_TYPE.MARKET, // 2 = ImmediateOrCancel — see the doc comment above.
    });
    const filledRaw = res.fills.reduce((sum, f) => sum + f.quantityFilled, 0n);
    const spentRaw = res.fills.reduce((sum, f) => sum + costOf(f.quantityFilled, f.fillPrice, scale), 0n);
    const avgPriceRaw = filledRaw > 0n ? (spentRaw * scale.one) / filledRaw : 0n;

    if (filledRaw === 0n) {
      return {
        outcome: "FAILED",
        transactionHash: res.hash,
        filledRaw: 0n,
        avgPriceRaw: 0n,
        reason: "IOC cancelled unfilled",
      };
    }
    return { outcome: "PENDING", transactionHash: res.hash, filledRaw, avgPriceRaw };
  } catch (error) {
    return {
      outcome: "FAILED",
      filledRaw: 0n,
      avgPriceRaw: 0n,
      reason: error instanceof Error ? error.message : "placeOrder reverted",
    };
  }
}

// ---------------------------------------------------------------------------
// Settlement — "markets die and respawn"
// ---------------------------------------------------------------------------

/**
 * Recently settled markets, for the redeem path.
 *
 * A settled market is gone from the live list, so the portfolio has to look
 * somewhere else or every position becomes invisible at exactly the moment it
 * becomes claimable. The payout vector is mapped to an Outcome rather than a
 * boolean: a uniform vector is a VOID (stake returned), which is not a loss.
 */
export async function scanSettled(dex: Dex, opts: { limit?: number } = {}): Promise<readonly SettledMarket[]> {
  // `listPastBinaryMarkets` is the dedicated past tier. Filtering the LIVE list
  // by status returns nothing, because a settled market has already left it —
  // that is the whole respawn mechanic, and it is why this function exists.
  const rows = await dex.exchange.client.listPastBinaryMarkets({ limit: opts.limit ?? 200 });

  return rows.filter(isBinaryMarket).map((row): SettledMarket => {
    const anker = toAnker(row);
    const numerators = row.payoutNumerators ?? null;
    const resolvedAt = row.resolvedAtTimestamp ? Number(row.resolvedAtTimestamp) : undefined;

    // A one-hot vector has a winner; a uniform vector is a void.
    let outcome: SettledMarket["outcome"] = "PENDING";
    let yesWon: boolean | undefined;
    if (numerators && numerators.length >= 2) {
      const yes = BigInt(numerators[0] ?? "0");
      const no = BigInt(numerators[1] ?? "0");
      if (yes === no) outcome = "VOID";
      else {
        yesWon = yes > no;
        outcome = "WON"; // Per-market; per-POSITION win/loss is derived against the side held.
      }
    } else if (row.winningOutcome !== null && row.winningOutcome !== undefined) {
      yesWon = row.winningOutcome === 0;
      outcome = "WON";
    }

    return {
      marketId: anker.marketId,
      symbol: anker.symbol,
      outcome,
      ...(yesWon === undefined ? {} : { yesWon }),
      ...(resolvedAt === undefined ? {} : { resolvedAtSec: resolvedAt }),
    };
  });
}

/**
 * Resolve one Position's Outcome from the market result and the side held.
 *
 * Kept pure and separate from the fetch so portfolio scores are recomputable
 * from raw settlements — never read back from a cached score field.
 */
export function outcomeForPosition(settled: SettledMarket, heldYes: boolean): SettledMarket["outcome"] {
  if (settled.outcome === "VOID") return "VOID";
  if (settled.yesWon === undefined) return "PENDING";
  return settled.yesWon === heldYes ? "WON" : "LOST";
}
