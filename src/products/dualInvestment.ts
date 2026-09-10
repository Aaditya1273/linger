import type {
  DualInvestmentInput,
  LegIntent,
  LegQuote,
  OracleMarket,
  StructuredProductQuote,
} from './types';
import { aprFromCoupon, daysBetween } from './units';
import { alignToGrid, buildStrikeLadder } from './strikeGrid';
import {
  MIN_LEG_PREMIUM_USD,
  ORDER_QUANTITY_LOT_SIZE,
  estimateBinaryUpPremiumUsd,
  floorQuantityToOrderLot,
} from './predictPricing';
import { simulatePayoff } from './payoff';
import { assertValidDualInvestmentInput, assertValidDualInvestmentQuote } from './dualInvestmentValidation';
import { legIdentityKey } from './legIdentity';
import { isOracleFeedPaused, ORACLE_PAUSED_WARNING } from './oracleHealth';

interface LadderInterval {
  strike: number;
  width: number;
}

function buildLadderIntervals(input: DualInvestmentInput, oracle: OracleMarket): LadderInterval[] {
  if (input.targetPrice <= input.floorPrice) return [];

  // Upstream strike_exposure::assert_admitted_mint_ticks only admits strikes on
  // the absolute admission grid (tick % (admission_tick_size / tick_size) == 0),
  // so leg strikes align to admissionTickSize — not the finer price tick grid.
  const alignStep =
    oracle.admissionTickSize && oracle.admissionTickSize > 0 ? oracle.admissionTickSize : oracle.tickSize;

  let rawStrikes: number[];
  if (input.targetLegCount !== undefined) {
    const targetLegCount = Math.max(1, Math.floor(input.targetLegCount));
    const rawWidth = (input.targetPrice - input.floorPrice) / targetLegCount;
    rawStrikes = Array.from({ length: targetLegCount }, (_, index) => input.floorPrice + rawWidth * index);
  } else {
    rawStrikes = buildStrikeLadder({
      floor: input.floorPrice,
      target: input.targetPrice,
      step: input.stepSize ?? input.targetPrice - input.floorPrice,
    });
  }

  const strikes: number[] = [];
  for (const rawStrike of rawStrikes) {
    const strike = alignToGrid(rawStrike, 0, alignStep).aligned;
    if (strike >= input.floorPrice && strike < input.targetPrice && !strikes.includes(strike)) {
      strikes.push(strike);
    }
  }

  return strikes.map((strike, index) => {
    const nextStrike = strikes[index + 1] ?? input.targetPrice;
    return {
      strike,
      width: Math.max(0, nextStrike - strike),
    };
  });
}

/** Headroom over the chain's 1 dUSDC floor: local SVI pricing drifts vs the chain pricer. */
const PREMIUM_FLOOR_HEADROOM = 1.1;

function evaluateLegPremiumFloor(
  legs: readonly LegQuote[],
  oracle: OracleMarket,
  principal: number,
  probeMinPrincipal: number | null,
): { belowFloor: boolean; warning?: string; minPrincipal?: number } {
  const premiums = legs.map((leg) =>
    typeof leg.strike === 'number'
      ? estimateBinaryUpPremiumUsd({ market: oracle, strike: leg.strike, quantity: leg.quantity })
      : null,
  );
  if (legs.length === 0 || premiums.some((premium) => premium === null)) {
    return { belowFloor: false };
  }

  const floorUsd = MIN_LEG_PREMIUM_USD * PREMIUM_FLOOR_HEADROOM;
  const minPremium = Math.min(...(premiums as number[]));
  if (minPremium >= floorUsd) return { belowFloor: false };

  if (minPremium <= 0) {
    return {
      belowFloor: true,
      warning:
        `Predict requires a premium of at least ${MIN_LEG_PREMIUM_USD} dUSDC per leg; ` +
        'reduce the leg count or move the target closer to the current price.',
    };
  }

  // Prefer the probe-derived minimum: scaling up from a small principal
  // overstates it (lot flooring shrinks small-quantity premiums), and every
  // surface quoting "the minimum" must name the same number.
  const minPrincipal = probeMinPrincipal ?? Math.ceil((principal * floorUsd) / minPremium);
  return {
    belowFloor: true,
    minPrincipal,
    warning:
      `Predict requires a premium of at least ${MIN_LEG_PREMIUM_USD} dUSDC per leg; ` +
      `subscribe about ${minPrincipal.toLocaleString('en-US')} dUSDC or more for ${legs.length} legs, ` +
      'or reduce the leg count.',
  };
}

/** Grid the UI rounds suggested minimum amounts up to — whole hundreds of dUSDC. */
export const MIN_PRINCIPAL_ROUNDING = 100;

/** A displayable/autofillable minimum amount: the raw floor rounded up to hundreds. */
export function suggestedMinPrincipal(minPrincipal: number) {
  return Math.max(MIN_PRINCIPAL_ROUNDING, Math.ceil(minPrincipal / MIN_PRINCIPAL_ROUNDING) * MIN_PRINCIPAL_ROUNDING);
}

/**
 * Reference principal for probing the premium floor independent of the user's
 * amount: large enough that lot flooring cannot zero a leg quantity, so the
 * linear scale-back from its premiums stays sound.
 */
const PREMIUM_PROBE_PRINCIPAL = 100_000;

/**
 * Smallest principal (dUSDC) whose thinnest leg clears Predict's per-mint
 * premium minimum, for the ladder described by `input` (its `principal` is
 * ignored). Same 1.1 headroom as the quote's executable gate. Null when no
 * finite principal helps (a leg prices at ~0 — the target is too deep) or the
 * market cannot price the ladder at all.
 */
export function minViableDualInvestmentPrincipal(
  input: DualInvestmentInput,
  oracle: OracleMarket,
  options: { nowMs?: number } = {},
): number | null {
  try {
    const intents = buildDualInvestmentLegIntents(
      { ...input, principal: PREMIUM_PROBE_PRINCIPAL },
      oracle,
      options,
    );
    if (intents.length === 0) return null;
    const floorUsd = MIN_LEG_PREMIUM_USD * PREMIUM_FLOOR_HEADROOM;
    let minPrincipal = 0;
    for (const intent of intents) {
      if (typeof intent.strike !== 'number' || intent.quantity <= 0) return null;
      const premium = estimateBinaryUpPremiumUsd({
        market: oracle,
        strike: intent.strike,
        quantity: intent.quantity,
      });
      if (premium === null || premium <= 0) return null;
      const legPrice = premium / intent.quantity;
      // Linear scaling alone understates the minimum: quantities floor to the
      // 0.01 order lot, so a marginal principal loses premium to the flooring
      // and stays under the gate. Instead find the smallest lot-aligned
      // quantity whose premium clears the floor, and map it back to the
      // principal that produces it (quantity scales linearly with principal).
      const neededQuantity =
        Math.ceil(floorUsd / legPrice / ORDER_QUANTITY_LOT_SIZE) * ORDER_QUANTITY_LOT_SIZE;
      minPrincipal = Math.max(
        minPrincipal,
        (neededQuantity / intent.quantity) * PREMIUM_PROBE_PRINCIPAL,
      );
    }
    return Math.ceil(minPrincipal);
  } catch {
    return null;
  }
}

function hasLegIdentity(leg: Partial<LegQuote>): leg is LegQuote {
  return (
    typeof leg.instrumentType === 'string' &&
    typeof leg.oracleId === 'string' &&
    typeof leg.expiryMs === 'number' &&
    typeof leg.quantity === 'number'
  );
}

export function buildDualInvestmentLegIntents(
  input: DualInvestmentInput,
  oracle: OracleMarket,
  options: { nowMs?: number } = {},
): LegIntent[] {
  const validInput = assertValidDualInvestmentInput(input, { oracle, nowMs: options.nowMs });
  const targetBtcAmount = validInput.principal / validInput.targetPrice;
  return buildLadderIntervals(validInput, oracle).map(({ strike, width }) => ({
    id: `up-${strike}`,
    instrumentType: 'binary-up',
    oracleId: oracle.oracleId,
    expiryMs: oracle.expiryMs,
    strike,
    isUp: true,
    // Floored to the mintable lot grid here, at the source: downstream layers
    // (pricing, reserve, tx building, settlement) must all see the same
    // quantity, or the quoted payout drifts from what the note actually pays.
    quantity: floorQuantityToOrderLot(targetBtcAmount * width),
    description: `UP ${strike.toLocaleString('en-US')}`,
  }));
}

export function compileDualInvestment(input: {
  input: DualInvestmentInput;
  oracle: OracleMarket;
  quotedLegs: Partial<LegQuote>[];
  nowMs?: number;
}): StructuredProductQuote {
  const validInput = assertValidDualInvestmentInput(input.input, {
    oracle: input.oracle,
    nowMs: input.nowMs,
  });
  const legIntents = buildDualInvestmentLegIntents(validInput, input.oracle, { nowMs: input.nowMs });
  const quotedByIdentity = new Map(
    input.quotedLegs
      .filter(hasLegIdentity)
      .map((quotedLeg) => [legIdentityKey(quotedLeg), quotedLeg]),
  );
  const quotedById = new Map(
    input.quotedLegs
      .filter((quotedLeg): quotedLeg is Partial<LegQuote> & { id: string } => typeof quotedLeg.id === 'string')
      .map((quotedLeg) => [quotedLeg.id, quotedLeg]),
  );
  const legs = legIntents.map((intent) => {
    const quotedLeg = quotedByIdentity.get(legIdentityKey(intent)) ?? quotedById.get(intent.id);
    return {
      ...intent,
      askPrice: quotedLeg?.askPrice ?? 0,
      askCost: quotedLeg?.askCost ?? 0,
      redeemPreview: quotedLeg?.redeemPreview ?? 0,
      quoteTimestampMs: quotedLeg?.quoteTimestampMs ?? Date.now(),
      executable: quotedLeg?.executable ?? false,
      error: quotedLeg?.error,
    };
  });
  // The reserve backs the payoff identity, not the floor formula: with lot-
  // floored quantities, `principal − Σ quantity` keeps `reserve + max ladder
  // payout = principal` exact, so an above-target settle pays precisely
  // deposit + coupon (the lot dust stays in cash instead of leaking).
  const maxLegPayout = legs.reduce((sum, leg) => sum + leg.quantity, 0);
  const reserve = validInput.principal - maxLegPayout;
  const totalLegCost = legs.reduce((sum, leg) => sum + leg.askCost, 0);
  const coupon = input.input.principal - reserve - totalLegCost;
  const days = daysBetween(input.nowMs ?? Date.now(), input.oracle.expiryMs);
  const premiumFloor = evaluateLegPremiumFloor(
    legs,
    input.oracle,
    validInput.principal,
    minViableDualInvestmentPrincipal(validInput, input.oracle, { nowMs: input.nowMs }),
  );
  // A paused upstream push means every on-chain mint aborts stale, whatever the
  // local pricing says — quotes stay browsable as indicative, never subscribable.
  const oraclePaused = isOracleFeedPaused(input.oracle, input.nowMs ?? Date.now());
  const executable =
    !oraclePaused && coupon > 0 && legs.every((leg) => leg.executable) && !premiumFloor.belowFloor;
  const legWarning = legs.find((leg) => !leg.executable && leg.error)?.error;
  // Marker only when the premium-floor warning is the one the quote shows —
  // paused feeds and non-positive coupons outrank it (and more principal
  // cannot fix a coupon that scales linearly with principal).
  const premiumFloorActive = !oraclePaused && coupon > 0 && premiumFloor.belowFloor;

  const quote: StructuredProductQuote = {
    id: `dual-${input.oracle.oracleId}-${validInput.targetPrice}-${validInput.floorPrice}`,
    productType: 'dual-investment',
    title: `Target Buy BTC at ${validInput.targetPrice.toLocaleString('en-US')}`,
    principal: validInput.principal,
    oracle: input.oracle,
    legs,
    totalLegCost,
    reserve,
    coupon,
    targetPrice: validInput.targetPrice,
    floorPrice: validInput.floorPrice,
    apr: aprFromCoupon(coupon, validInput.principal, days),
    executable,
    warning: oraclePaused
      ? ORACLE_PAUSED_WARNING
      : coupon <= 0
        ? 'Current leg costs leave no positive coupon.'
        : premiumFloor.warning ?? legWarning,
    warningCode: oraclePaused ? 'oracle-paused' : premiumFloorActive ? 'premium-floor' : undefined,
    minViablePrincipal: premiumFloorActive ? premiumFloor.minPrincipal : undefined,
    scenarios: [],
  };
  return assertValidDualInvestmentQuote({ ...quote, scenarios: simulatePayoff(quote) });
}
