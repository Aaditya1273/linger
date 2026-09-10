/**
 * Buy Low — the single-leg Anker product on DreamDEX.
 *
 * ## Why one leg
 *
 * The Sui original compiled a 3/6/9-rung ladder of fixed strikes sharing one
 * expiry. Measured against DreamDEX Shannon, the whole indexed universe offers
 * at most ONE fixed strike per (asset, expiry) and a ~2.7h maximum tenor, so a
 * ladder cannot be built. The compiler below keeps the ported identity exactly
 * and collapses the ladder to its single rung.
 *
 * ## The identity, unchanged from the Sui version
 *
 *   quantity  Q   = principal / targetPrice   (the BTC amount principal buys at target)
 *   reserve       = principal − Q             (bookkeeping split, not cash)
 *   legCost       = Q × ask                   (live, from the order book)
 *   coupon        = Q − legCost
 *
 * Settlement, stated as both branches rather than one headline number:
 *   above target (YES) → cash + Q      = principal + coupon
 *   below target (NO)  → cash          = principal − legCost
 * where cash = principal − legCost is what is actually left after buying.
 *
 * ## Yield, not APR
 *
 * A coupon earned over a 60s–2.7h tenor annualizes to five and six figures.
 * ADR-0002 already settled this for the Sui hourly shelf: lead with per-period
 * yield and keep the annualized number muted and clearly labelled. `netApr` is
 * still computed because the Benchmark schema stores it — it is not the headline.
 */

import type { Scale } from '@anker/dex';

/** Everything money is raw collateral units. Prices are raw too (1.00 = scale.one). */
export interface BuyLowQuote {
  readonly principalRaw: bigint;
  readonly quantityRaw: bigint;
  readonly reserveRaw: bigint;
  readonly legCostRaw: bigint;
  readonly couponRaw: bigint;
  /** Cash actually left after buying the leg. */
  readonly cashRaw: bigint;
  /** Payout if the market settles at or above target. */
  readonly aboveTargetRaw: bigint;
  /** Payout if it settles below target. */
  readonly belowTargetRaw: bigint;
  /** coupon / principal, in bps. The headline number. */
  readonly periodYieldBps: number;
  /** Annualized, after fee. Muted in the UI — see the module note. */
  readonly netAprBps: number;
  readonly secondsToExpiry: number;
  readonly executable: boolean;
  readonly warning?: string;
}

export interface BuyLowInput {
  readonly principalRaw: bigint;
  /** Best YES ask, raw. */
  readonly askRaw: bigint;
  /** Market strike in the oracle's price scale. */
  readonly strikeRaw: bigint;
  /** Oracle price scale divisor (strike 7713585 at scale 1e2 == $77,135.85). */
  readonly oracleScale: bigint;
  readonly expirySec: number;
  readonly nowSec: number;
  readonly feeBps: number;
  readonly scale: Scale;
}

const BPS = 10_000n;
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

export function compileBuyLow(input: BuyLowInput): BuyLowQuote {
  const { principalRaw, askRaw, strikeRaw, oracleScale, scale } = input;
  const secondsToExpiry = Math.max(0, input.expirySec - input.nowSec);

  const zero: Omit<BuyLowQuote, 'executable' | 'warning'> = {
    principalRaw,
    quantityRaw: 0n,
    reserveRaw: 0n,
    legCostRaw: 0n,
    couponRaw: 0n,
    cashRaw: principalRaw,
    aboveTargetRaw: principalRaw,
    belowTargetRaw: principalRaw,
    periodYieldBps: 0,
    netAprBps: 0,
    secondsToExpiry,
  };

  if (principalRaw <= 0n) return { ...zero, executable: false, warning: 'Enter an amount.' };
  if (askRaw <= 0n) return { ...zero, executable: false, warning: 'No resting ask — this market has no liquidity.' };
  if (askRaw >= scale.one) {
    return { ...zero, executable: false, warning: 'Ask is at ceiling; the leg cannot produce a coupon.' };
  }
  if (strikeRaw <= 0n) {
    return { ...zero, executable: false, warning: 'Reference market has no fixed strike.' };
  }
  if (secondsToExpiry <= 0) return { ...zero, executable: false, warning: 'This market has expired.' };

  // Q = principal / targetPrice, carried through the oracle's own scale so the
  // division never leaves bigint.
  const quantityRaw = (principalRaw * oracleScale) / strikeRaw;
  const legCostRaw = (quantityRaw * askRaw) / scale.one;
  const couponRaw = quantityRaw - legCostRaw;
  const reserveRaw = principalRaw > quantityRaw ? principalRaw - quantityRaw : 0n;
  const cashRaw = principalRaw > legCostRaw ? principalRaw - legCostRaw : 0n;

  const quote = {
    ...zero,
    quantityRaw,
    reserveRaw,
    legCostRaw,
    couponRaw,
    cashRaw,
    aboveTargetRaw: cashRaw + quantityRaw,
    belowTargetRaw: cashRaw,
    periodYieldBps: Number((couponRaw * BPS) / principalRaw),
    netAprBps: aprBpsAfterFee(couponRaw, principalRaw, secondsToExpiry, input.feeBps),
    secondsToExpiry,
  };

  if (legCostRaw > principalRaw) {
    return { ...quote, executable: false, warning: 'Leg cost exceeds the amount — reduce the target price.' };
  }
  if (couponRaw <= 0n) {
    return { ...quote, executable: false, warning: 'Current ask leaves no positive coupon.' };
  }
  return { ...quote, executable: true };
}

function aprBpsAfterFee(couponRaw: bigint, principalRaw: bigint, secondsToExpiry: number, feeBps: number): number {
  if (principalRaw <= 0n || secondsToExpiry <= 0) return 0;
  const grossBps = (couponRaw * BPS * SECONDS_PER_YEAR) / (principalRaw * BigInt(secondsToExpiry));
  const netBps = (grossBps * (BPS - BigInt(feeBps))) / BPS;
  // An annualized number this large is display-only; clamp so it cannot overflow a label.
  return netBps > 100_000_000n ? 100_000_000 : Number(netBps);
}

/** Performance fee on coupon actually earned. No coupon, no fee. */
export function feeOnCoupon(couponRaw: bigint, feeBps: number): bigint {
  return couponRaw <= 0n ? 0n : (couponRaw * BigInt(feeBps)) / BPS;
}
