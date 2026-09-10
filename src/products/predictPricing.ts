import { DEEPBOOK_PREDICT } from '../config/deepbook';
import type { OracleMarket } from './types';

export const DEFAULT_MIN_PREDICT_ASK = 0.02;
export const DEFAULT_MAX_PREDICT_ASK = DEEPBOOK_PREDICT.maxAskPrice;
/**
 * Upstream `strike_exposure_config::assert_mint_admission` (abort 4): each mint's
 * net premium — range_price × quantity at 1x leverage, fee-exclusive — must be
 * at least 1_000_000 base units (1 DUSDC). Hardcoded in the 6-24 bytecode.
 */
export const MIN_LEG_PREMIUM_USD = 1;
/**
 * Predict's order book stores quantity in fixed 0.01-dUSDC lots (mirror of
 * `order::assert_valid_quantity`; base-unit twin lives in
 * `sui/ankerTransactionPrimitives.ts`). Quotes floor every leg to this grid up
 * front so the ladder geometry, the reserve, and the minted note all share the
 * same numbers — keeping `reserve + Σ quantity = principal` true on-chain, not
 * just in the quote.
 */
export const ORDER_QUANTITY_LOT_SIZE = 0.01;
const LOTS_PER_UNIT = Math.round(1 / ORDER_QUANTITY_LOT_SIZE);

export function floorQuantityToOrderLot(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  // The epsilon absorbs float noise on exact lot boundaries (0.29 * 100 → 28.999…).
  return Math.floor(quantity * LOTS_PER_UNIT + 1e-6) / LOTS_PER_UNIT;
}
export const DEFAULT_PREDICT_BASE_SPREAD = DEEPBOOK_PREDICT.baseSpread;
export const DEFAULT_PREDICT_MIN_SPREAD = DEEPBOOK_PREDICT.minSpread;
export const DEFAULT_PREDICT_UTILIZATION_MULTIPLIER = DEEPBOOK_PREDICT.utilizationMultiplier;
const DEFAULT_BOUND_BUFFER = 0.005;
const MAX_LOCAL_SOLVE_STEPS = 32;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

function alignUpToGrid(input: number, minStrike: number, tickSize: number) {
  return minStrike + Math.ceil((input - minStrike) / tickSize) * tickSize;
}

function alignDownToGrid(input: number, minStrike: number, tickSize: number) {
  return minStrike + Math.floor((input - minStrike) / tickSize) * tickSize;
}

export function estimateBinaryUpFairPrice(input: { market: OracleMarket; strike: number }) {
  const { market, strike } = input;
  if (!market.svi || strike <= 0 || market.forward <= 0) return null;

  const logMoneyness = Math.log(strike / market.forward);
  const x = logMoneyness - market.svi.m;
  const totalVariance =
    market.svi.a + market.svi.b * (market.svi.rho * x + Math.sqrt(x * x + market.svi.sigma * market.svi.sigma));

  if (!Number.isFinite(totalVariance) || totalVariance < 0) return null;
  if (totalVariance === 0) return strike < market.forward ? 1 : 0;

  const totalVolatility = Math.sqrt(totalVariance);
  const d2 = Math.log(market.forward / strike) / totalVolatility - totalVolatility / 2;
  return clamp(normalCdf(d2), 0, 1);
}

/**
 * Estimated on-chain mint premium for a binary-up leg: fair price × quantity.
 * Mirrors the value `assert_mint_admission` compares against MIN_LEG_PREMIUM_USD
 * (the chain uses its own pricer; fees are charged separately and excluded here).
 * Null when the market has no SVI parameters to price from.
 */
export function estimateBinaryUpPremiumUsd(input: {
  market: OracleMarket;
  strike: number;
  quantity: number;
}): number | null {
  const fairPrice = estimateBinaryUpFairPrice({ market: input.market, strike: input.strike });
  return fairPrice === null ? null : fairPrice * input.quantity;
}

/**
 * 6-24 trading fee on top of fair probability p (fees-and-rebates.md):
 *   base_fee_rate = max(base_fee * sqrt(p*(1-p)), min_fee)
 *   ramped       = base_fee_rate * expiry_fee_multiplier(tte)
 *   + EWMA congestion penalty (0 unless gas is a high outlier; browse default 0)
 */
export function estimatePredictTradingFeeFromFairPrice(input: {
  fairPrice: number;
  baseFee?: number;
  minFee?: number;
  ewmaPenaltyRate?: number;
  timeToExpiryMs?: number;
  expiryFeeWindowMs?: number;
  expiryFeeMaxMultiplier?: number;
}) {
  const fairPrice = clamp(input.fairPrice, 0, 1);
  if (fairPrice <= 0 || fairPrice >= 1) return 0;

  const baseFee = input.baseFee ?? DEFAULT_PREDICT_BASE_SPREAD;
  const minFee = input.minFee ?? DEFAULT_PREDICT_MIN_SPREAD;
  const bernoulli = baseFee * Math.sqrt(fairPrice * (1 - fairPrice));
  const baseFeeRate = Math.max(bernoulli, minFee);

  const windowMs = input.expiryFeeWindowMs ?? 0;
  const maxMultiplier = input.expiryFeeMaxMultiplier ?? 1;
  const timeToExpiryMs = input.timeToExpiryMs;
  let multiplier = 1;
  if (windowMs > 0 && maxMultiplier > 1 && timeToExpiryMs !== undefined) {
    if (timeToExpiryMs <= 0) {
      multiplier = maxMultiplier;
    } else if (timeToExpiryMs < windowMs) {
      const phase = (windowMs - timeToExpiryMs) / windowMs;
      multiplier = 1 + (maxMultiplier - 1) * phase;
    }
  }

  const ewmaPenalty = Math.max(0, input.ewmaPenaltyRate ?? 0);
  return baseFeeRate * multiplier + ewmaPenalty;
}

/** @deprecated Prefer estimatePredictTradingFeeFromFairPrice — kept for call-site compatibility during migration. */
export function estimatePredictSpreadFromFairPrice(input: {
  fairPrice: number;
  baseSpread?: number;
  minSpread?: number;
  utilization?: number;
  utilizationMultiplier?: number;
  ewmaPenaltyRate?: number;
  timeToExpiryMs?: number;
  expiryFeeWindowMs?: number;
  expiryFeeMaxMultiplier?: number;
}) {
  return estimatePredictTradingFeeFromFairPrice({
    fairPrice: input.fairPrice,
    baseFee: input.baseSpread,
    minFee: input.minSpread,
    ewmaPenaltyRate: input.ewmaPenaltyRate,
    timeToExpiryMs: input.timeToExpiryMs,
    expiryFeeWindowMs: input.expiryFeeWindowMs,
    expiryFeeMaxMultiplier: input.expiryFeeMaxMultiplier,
  });
}

export function estimateBinaryUpAskPrice(input: {
  market: OracleMarket;
  strike: number;
  nowMs?: number;
}) {
  const fairPrice = estimateBinaryUpFairPrice(input);
  if (fairPrice === null) return null;
  const pricing = input.market.predictPricing;
  const nowMs = input.nowMs ?? Date.now();
  const fee = estimatePredictTradingFeeFromFairPrice({
    fairPrice,
    baseFee: pricing?.baseFee ?? pricing?.baseSpread,
    minFee: pricing?.minFee ?? pricing?.minSpread,
    ewmaPenaltyRate: pricing?.ewmaPenaltyRate ?? 0,
    timeToExpiryMs: input.market.expiryMs - nowMs,
    expiryFeeWindowMs: pricing?.expiryFeeWindowMs,
    expiryFeeMaxMultiplier: pricing?.expiryFeeMaxMultiplier,
  });
  return clamp(fairPrice + fee, 0, 1);
}

/**
 * Deepest strike the market can genuinely quote: below it, the binary-up ask
 * crosses the Predict max-ask clamp (maxAskPrice − buffer), so a mint at that
 * strike could never fill at a meaningful price. Null when SVI is unavailable
 * — callers must fall back to a coarser policy bound.
 */
export function estimateMinQuotableStrike(input: {
  market: OracleMarket;
  nowMs?: number;
  maxAskPrice?: number;
  boundBuffer?: number;
}): number | null {
  const { market } = input;
  if (!market.svi || market.tickSize <= 0 || market.forward <= 0 || market.minStrike <= 0) {
    return null;
  }

  const configuredMaxAsk =
    input.maxAskPrice ?? market.predictPricing?.maxAskPrice ?? DEFAULT_MAX_PREDICT_ASK;
  const upperAskBound = configuredMaxAsk - (input.boundBuffer ?? DEFAULT_BOUND_BUFFER);
  const askAt = (strike: number) =>
    estimateBinaryUpAskPrice({ market, strike, nowMs: input.nowMs });

  const minStrikeAsk = askAt(market.minStrike);
  if (minStrikeAsk === null) return null;
  if (minStrikeAsk <= upperAskBound) return market.minStrike;

  const atForwardAsk = askAt(market.forward);
  if (atForwardAsk === null) return null;
  if (atForwardAsk > upperAskBound) return market.forward;

  let low = market.minStrike;
  let high = market.forward;
  for (let index = 0; index < MAX_LOCAL_SOLVE_STEPS; index += 1) {
    const mid = (low + high) / 2;
    const ask = askAt(mid);
    if (ask === null) return null;
    if (ask > upperAskBound) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return alignUpToGrid(high, market.minStrike, market.tickSize);
}

export function estimateTargetBuyFloorPrice(input: {
  market: OracleMarket;
  targetPrice: number;
  fallbackFloorDistance?: number;
  minAskPrice?: number;
  maxAskPrice?: number;
  boundBuffer?: number;
}) {
  const fallbackFloorDistance = input.fallbackFloorDistance ?? 5_000;
  const fallback = alignDownToGrid(
    Math.max(input.market.minStrike, input.targetPrice - fallbackFloorDistance),
    input.market.minStrike,
    input.market.tickSize,
  );
  if (!input.market.svi || input.targetPrice <= input.market.minStrike || input.market.tickSize <= 0) {
    return fallback;
  }

  const minFloor = input.market.minStrike;
  const maxFloor = alignDownToGrid(input.targetPrice - input.market.tickSize, input.market.minStrike, input.market.tickSize);
  if (maxFloor <= minFloor) return fallback;

  const configuredMinAsk = Math.max(
    input.minAskPrice ?? DEFAULT_MIN_PREDICT_ASK,
    input.market.predictPricing?.minAskPrice ?? DEFAULT_MIN_PREDICT_ASK,
  );
  const configuredMaxAsk = input.maxAskPrice ?? input.market.predictPricing?.maxAskPrice ?? DEFAULT_MAX_PREDICT_ASK;
  const lowerAskBound = configuredMinAsk + (input.boundBuffer ?? DEFAULT_BOUND_BUFFER);
  const upperAskBound = configuredMaxAsk - (input.boundBuffer ?? DEFAULT_BOUND_BUFFER);
  const minFloorAsk = estimateBinaryUpAskPrice({ market: input.market, strike: minFloor });
  const maxFloorAsk = estimateBinaryUpAskPrice({ market: input.market, strike: maxFloor });
  if (minFloorAsk === null || maxFloorAsk === null) return fallback;

  if (minFloorAsk >= lowerAskBound && minFloorAsk <= upperAskBound) {
    return minFloor;
  }

  if (minFloorAsk > upperAskBound) {
    if (maxFloorAsk > upperAskBound) return maxFloor;

    let low = minFloor;
    let high = maxFloor;
    for (let index = 0; index < MAX_LOCAL_SOLVE_STEPS; index += 1) {
      const mid = (low + high) / 2;
      const ask = estimateBinaryUpAskPrice({ market: input.market, strike: mid });
      if (ask === null) return fallback;
      if (ask > upperAskBound) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return Math.min(maxFloor, Math.max(minFloor, alignUpToGrid(high, input.market.minStrike, input.market.tickSize)));
  }

  if (minFloorAsk < lowerAskBound) {
    return fallback;
  }

  return fallback;
}
