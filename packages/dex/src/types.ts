/**
 * Public vocabulary of the DreamDEX boundary.
 *
 * Nothing here knows about React, Next, or Anker's product compiler — this is
 * the shape the rest of the app is allowed to see. Every field that carries
 * money is a bigint in the collateral's raw units; see `money.ts`.
 */

/**
 * Terminal state of one leg or one Position.
 *
 * Deliberately an enum and never a boolean: `VOID` (market voided, stake
 * returned) is not a loss, and `FAILED` (our order never filled / the write
 * reverted) is not a market outcome at all. Collapsing either into `false`
 * is what makes a leaderboard lie.
 */
export type Outcome = "WON" | "LOST" | "VOID" | "FAILED" | "PENDING";

/** MarketStatus enum as the BinaryMarket contract reports it. */
export const MARKET_STATUS = {
  Listed: 0,
  Trading: 1,
  Locked: 2,
  Settling: 3,
  Resolved: 4,
  Voided: 5,
} as const;

/** The only status a write may target. */
export const TRADABLE_STATUS: number = MARKET_STATUS.Trading;

/**
 * One DreamDEX binary Event Contract, reduced to what Anker needs.
 *
 * `strikeRaw` is in the oracle's own price scale (NOT the collateral scale) and
 * is 0 for `mode: "reference"` up/down markets, where the threshold is another
 * question's answer rather than a fixed number.
 */
export interface AnkerBinaryMarket {
  /** bytes32 market id — the stable key. Never key a market by pool address. */
  readonly marketId: `0x${string}`;
  /** Canonical market symbol without outcome suffix, e.g. "BTC-7713585-10SEP26-1659/tUSDC". */
  readonly symbol: string;
  /** Underlying asset code, e.g. "BTC". */
  readonly asset: string;
  /** Threshold in the oracle's price scale; "0" on reference markets. */
  readonly strikeRaw: string;
  /** How the threshold is established. */
  readonly mode: "fixed" | "reference";
  /** Unix seconds. */
  readonly tradingStartSec: number;
  /** Unix seconds. */
  readonly expirySec: number;
  /** Collateral ERC-20 backing this market. */
  readonly collateral: `0x${string}`;
  /** Indexer-derived lifecycle string; advisory only — gate writes on-chain. */
  readonly indexedStatus: string;
}

/** The YES-side ask, or an explicit statement that there is none. */
export type AskState =
  | { readonly kind: "ask"; readonly priceRaw: bigint; readonly sizeRaw: bigint }
  | { readonly kind: "no-liquidity" };

/** Why a market was refused for a write. */
export type WriteGate =
  | { readonly ok: true; readonly pool: `0x${string}` }
  | { readonly ok: false; readonly reason: "not-trading" | "expired" | "unknown-market"; readonly status?: number };

/** Result of one IOC buy attempt. */
export interface FillResult {
  readonly outcome: Outcome;
  readonly transactionHash?: `0x${string}`;
  readonly filledRaw: bigint;
  readonly avgPriceRaw: bigint;
  readonly reason?: string;
}

/** A settled market with the payout vector resolved into an Outcome. */
export interface SettledMarket {
  readonly marketId: `0x${string}`;
  readonly symbol: string;
  readonly outcome: Outcome;
  /** True when the market resolved YES. Undefined on VOID/PENDING. */
  readonly yesWon?: boolean;
  readonly resolvedAtSec?: number;
}
