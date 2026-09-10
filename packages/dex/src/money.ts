/**
 * Money is bigint. Always.
 *
 * Every value in this package that represents collateral, a price, or a
 * quantity is a bigint in RAW units — collateral units scaled by the token's
 * own `decimals()`. Nothing here takes or returns a float, and the guardrail in
 * scripts/quality-gates.mjs fails the build if a float literal appears in this
 * package's money paths.
 *
 * ## Why decimals are read from the chain, not hard-coded
 *
 * The port brief specified "USDso, 18 decimals". The collateral DreamDEX
 * actually settles in on Shannon is `tUSDC` at
 * 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E, which reports `decimals() = 6`.
 * Hard-coding either number is a 10^12 error that no test catches until a real
 * order is placed, so the scale is resolved once from the ERC-20 and cached.
 */

import { createPublicClient, http, erc20Abi, type Address, type PublicClient } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

/** Binary outcome prices live on [0, 1]; ONE is "one whole outcome token". */
export interface Scale {
  readonly decimals: number;
  /** 10^decimals — a probability of 1.00 in raw price units. */
  readonly one: bigint;
}

const scaleCache = new Map<Address, Scale>();

export function makeReadClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: somniaShannon, transport: http(rpcUrl) });
}

/** Resolve (and cache) a collateral token's raw-unit scale. */
export async function resolveScale(client: PublicClient, collateral: Address): Promise<Scale> {
  const key = collateral.toLowerCase() as Address;
  const hit = scaleCache.get(key);
  if (hit) return hit;

  const decimals = await client.readContract({
    address: collateral,
    abi: erc20Abi,
    functionName: "decimals",
  });
  const scale: Scale = { decimals, one: 10n ** BigInt(decimals) };
  scaleCache.set(key, scale);
  return scale;
}

/** Basis-point multiply, floor-rounded. `bps` is an integer count of 1/10000. */
export function applyBps(value: bigint, bps: number): bigint {
  if (!Number.isInteger(bps)) throw new Error("bps must be an integer");
  return (value * BigInt(bps)) / 10_000n;
}

/**
 * Price to cross with: best ask plus a buffer, clamped to `one`.
 *
 * A binary price can never exceed 1 whole collateral unit per outcome token, so
 * an unclamped "ask + buffer" is rejected by the pool rather than crossing.
 */
export function crossingPrice(askRaw: bigint, scale: Scale, bufferBps: number): bigint {
  const buffered = askRaw + applyBps(scale.one, bufferBps);
  return buffered > scale.one ? scale.one : buffered;
}

/** Cost of `qtyRaw` outcome tokens at `priceRaw`, floor-rounded to raw collateral. */
export function costOf(qtyRaw: bigint, priceRaw: bigint, scale: Scale): bigint {
  return (qtyRaw * priceRaw) / scale.one;
}

/**
 * Raw → decimal string, for the display edge ONLY.
 *
 * Returns a string, never a number: handing a float back would reintroduce
 * exactly the precision loss the bigint discipline exists to prevent.
 */
export function formatRaw(value: bigint, scale: Scale, maxFractionDigits = 4): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / scale.one;
  const frac = abs % scale.one;
  const fracStr = frac.toString().padStart(scale.decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${body}` : body;
}

/**
 * Decimal string → raw. The ONLY entry point for user-typed amounts.
 *
 * Takes a string rather than a number so a UI input can never smuggle a float
 * through; extra fractional digits below the token's precision are truncated,
 * not rounded, so a quote can never claim more than the user actually has.
 */
export function parseRaw(input: string, scale: Scale): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Not a positive decimal amount: "${input}"`);
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = frac.padEnd(scale.decimals, "0").slice(0, scale.decimals);
  return BigInt(whole) * scale.one + BigInt(padded === "" ? "0" : padded);
}

/**
 * The SDK's *unified* tier (`exchange.createOrder`) speaks human numbers, so a
 * bigint has to become one to cross that boundary. Anker never uses it for
 * writes — writes go through `trader.placeOrder`, which is bigint-exact — but
 * read helpers that quote against the unified book need it.
 *
 * Kept as a single named, documented choke point so the conversion is greppable
 * rather than sprinkled through call sites.
 */
export function toUnifiedNumber(value: bigint, scale: Scale): number {
  return Number(value) / Number(scale.one);
}
