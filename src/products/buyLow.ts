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
 * ## Sizing the leg: a bounded option budget
 *
 * A DreamDEX outcome token pays ONE COLLATERAL UNIT if it wins — it is not a
 * unit of BTC. The Sui ladder sized each rung as `(principal / targetPrice) ×
 * width`, where the USD width cancelled the BTC denominator and left a
 * collateral amount. Collapsed to a single rung there is no width, so
 * `principal / targetPrice` alone is dimensionally wrong: on a $77k strike it
 * sizes the leg at ~0.0013 of the principal and the coupon rounds to zero.
 *
 * Instead the leg is sized by an explicit OPTION BUDGET — the slice of
 * principal at risk — which is how a structured note is actually built:
 *
 *   budget    = principal × optionBudgetBps   (the most the user can lose)
 *   quantity Q= budget / ask                  (payout bought with that budget)
 *   legCost   = budget
 *   coupon    = Q − budget
 *   reserve   = principal − Q                 (bookkeeping split, not cash)
 *
 * Settlement, stated as both branches rather than one headline number:
 *   above target (YES) → cash + Q = principal + coupon
 *   below target (NO)  → cash     = principal − budget
 * where cash = principal − budget is what is actually left after buying.
 *
 * The budget is the whole risk story: downside is capped at it by construction,
 * and a cheaper (less likely) YES buys more payout with the same budget, so the
 * coupon rises exactly as the probability of keeping it falls.
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
  /**
   * Oracle price scale divisor (strike 7713585 at scale 1e2 == $77,135.85).
   * Carried for display and for the note's on-chain record; the leg is sized
   * from the option budget, not from the strike.
   */
  readonly oracleScale: bigint;
  readonly expirySec: number;
  readonly nowSec: number;
  readonly feeBps: number;
  /** Slice of principal spent on the leg — the maximum loss. Default 2%. */
  readonly optionBudgetBps?: number;
  readonly scale: Scale;
}

/** Default option budget: 2% of principal at risk. */
export const DEFAULT_OPTION_BUDGET_BPS = 200;

const BPS = 10_000n;
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

export function compileBuyLow(input: BuyLowInput): BuyLowQuote {
  const { principalRaw, askRaw, strikeRaw, scale } = input;
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

  // Budget first, then the payout that budget buys. All bigint, all collateral
  // units — no BTC-denominated intermediate to get the dimensions wrong.
  const budgetBps = input.optionBudgetBps ?? DEFAULT_OPTION_BUDGET_BPS;
  const legCostRaw = (principalRaw * BigInt(budgetBps)) / BPS;
  const quantityRaw = (legCostRaw * scale.one) / askRaw;
  const couponRaw = quantityRaw > legCostRaw ? quantityRaw - legCostRaw : 0n;
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
    return { ...quote, executable: false, warning: 'Option budget exceeds the amount.' };
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
