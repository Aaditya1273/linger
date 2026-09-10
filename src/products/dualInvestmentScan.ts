import type { DualInvestmentInput, OracleMarket, StructuredProductQuote } from './types';
import { alignToGrid } from './strikeGrid';
import { estimateTargetBuyFloorPrice } from './predictPricing';
import { minQuotableTargetPrice } from './dualInvestmentValidation';
import { netAprAfterCouponFee, netCouponAfterFee } from './feePolicy';

/** Browse/UI target ladder for Turbo — not the on-chain admission grid (~$1). */
export const TURBO_DISPLAY_TARGET_STEP = 50;
/** How many $50 rungs to scan before filtering by min bps (~$800 below spot). */
export const TURBO_DISPLAY_TARGET_ROWS = 16;
/** Day-tenor browse step (classic $500 Dual Investment ladder). */
export const DEFAULT_DISPLAY_TARGET_STEP = 500;
/** Hide Turbo browse rows whose per-period yield is below this (1 bp = 0.01%). */
export const TURBO_MIN_PERIOD_RETURN_BPS = 1;
/** Hard cap on reference-table rows after filtering — every tenor shows at most
    this many, so the side column stays near the Return Overview's height. */
export const MAX_REFERENCE_SCAN_ROWS = 8;

export interface DualInvestmentScanRow {
  input: DualInvestmentInput;
  quote: StructuredProductQuote | null;
  error?: string;
}

function admissionAlignStep(market: OracleMarket) {
  return market.admissionTickSize && market.admissionTickSize > 0
    ? market.admissionTickSize
    : market.tickSize;
}

// Admission alignment uses origin 0: the chain admits absolute tick indexes
// (tick % ratio == 0), not offsets from minStrike.
export function alignTargetToAdmissionGrid(market: OracleMarket, targetPrice: number) {
  return alignToGrid(targetPrice, 0, admissionAlignStep(market)).aligned;
}

export function buildAutoFloorDualInvestmentInput(input: {
  market: OracleMarket;
  principal: number;
  targetPrice: number;
  targetLegCount?: number;
  floorDistance?: number;
}): DualInvestmentInput {
  const floorDistance = input.floorDistance ?? 5_000;
  const targetPrice = alignTargetToAdmissionGrid(input.market, input.targetPrice);
  // The floor is the first leg's strike, so it must sit on the admission grid too.
  const step = admissionAlignStep(input.market);
  const floorPrice = Math.min(
    targetPrice - step,
    Math.max(
      input.market.minStrike,
      alignToGrid(
        estimateTargetBuyFloorPrice({
          market: input.market,
          targetPrice,
          fallbackFloorDistance: floorDistance,
        }),
        0,
        step,
      ).aligned,
    ),
  );

  return {
    principal: input.principal,
    targetPrice,
    floorPrice,
    targetLegCount: input.targetLegCount ?? 6,
  };
}

function isTurboBrowseMarket(
  market: Pick<OracleMarket, 'admissionTickSize' | 'expiryMs'>,
  nowMs = Date.now(),
) {
  // Hourly Turbo markets expose admissionTickSize (~$1) and are sub-day.
  // Day-scale Expiry Markets (6-24) also expose admissionTickSize for the
  // on-chain admission grid, but browse UX stays on the classic $500 ladder.
  return typeof market.admissionTickSize === 'number' && isSubDayTenor(market.expiryMs, nowMs);
}

export function displayTargetStepForMarket(
  market: Pick<OracleMarket, 'admissionTickSize' | 'expiryMs'>,
  nowMs = Date.now(),
) {
  return isTurboBrowseMarket(market, nowMs) ? TURBO_DISPLAY_TARGET_STEP : DEFAULT_DISPLAY_TARGET_STEP;
}

export function displayTargetRowsForMarket(
  market: Pick<OracleMarket, 'admissionTickSize' | 'expiryMs'>,
  nowMs = Date.now(),
) {
  return isTurboBrowseMarket(market, nowMs) ? TURBO_DISPLAY_TARGET_ROWS : 8;
}

export function periodReturnToBps(periodReturn: number) {
  return periodReturn * 10_000;
}

export function isMeaningfulTurboPeriodReturn(periodReturn: number, minBps = TURBO_MIN_PERIOD_RETURN_BPS) {
  return periodReturnToBps(periodReturn) >= minBps;
}

export function buildDualInvestmentScanInputs(input: {
  market: OracleMarket;
  principal: number;
  targetLegCount?: number;
  targetRows?: number;
  targetStep?: number;
  floorDistance?: number;
  /** Overrides the scan clock — tests pass a fixed instant for determinism. */
  nowMs?: number;
}): DualInvestmentInput[] {
  const targetRows = input.targetRows ?? displayTargetRowsForMarket(input.market, input.nowMs);
  const targetStep = input.targetStep ?? displayTargetStepForMarket(input.market, input.nowMs);
  const floorDistance = input.floorDistance ?? 5_000;
  const targetLegCount = input.targetLegCount ?? 6;
  const roundedDownTarget = Math.floor(input.market.spot / targetStep) * targetStep;
  const startTarget =
    roundedDownTarget >= input.market.spot ? roundedDownTarget - targetStep : roundedDownTarget;
  // Never offer rows whose legs could not fill within Predict ask limits.
  const minQuotableTarget = minQuotableTargetPrice(input.market, input.nowMs);

  return Array.from({ length: targetRows }, (_, index) => startTarget - targetStep * index)
    .filter(
      (targetPrice) =>
        targetPrice > input.market.minStrike &&
        targetPrice < input.market.spot &&
        targetPrice >= minQuotableTarget,
    )
    .map((targetPrice) =>
      buildAutoFloorDualInvestmentInput({
        market: input.market,
        principal: input.principal,
        targetPrice,
        targetLegCount,
        floorDistance,
      }),
    );
}

/** ADR-0002: tenor < 1 day — primary display is per-period yield (not APR). */
export function isSubDayTenor(expiryMs: number, nowMs = Date.now()) {
  return expiryMs - nowMs < 86_400_000;
}

export function scanQuoteDisplayMetrics(input: {
  quote: Pick<StructuredProductQuote, 'coupon' | 'apr' | 'totalLegCost' | 'principal' | 'oracle'> | null;
  nowMs?: number;
}) {
  if (!input.quote || input.quote.coupon <= 0) {
    return {
      coupon: 0,
      couponAfterFee: 0,
      apr: null as number | null,
      referenceApr: null as number | null,
      periodReturn: null as number | null,
      periodReturnBps: null as number | null,
      totalLegCost: null as number | null,
      showApr: false,
    };
  }

  // Every display metric is net of the protocol fee — same basis as the APR,
  // so a row's yield, reward, and APR always describe the same money.
  const couponAfterFee = netCouponAfterFee(input.quote.coupon);
  const periodReturn = input.quote.principal > 0 ? couponAfterFee / input.quote.principal : 0;
  const netApr = netAprAfterCouponFee(input.quote.apr);
  const showApr = !isSubDayTenor(input.quote.oracle.expiryMs, input.nowMs);

  return {
    coupon: input.quote.coupon,
    couponAfterFee,
    apr: showApr ? netApr : null,
    // Secondary magnitude cue for Turbo; never the primary column (ADR-0002).
    referenceApr: netApr,
    periodReturn,
    periodReturnBps: periodReturnToBps(periodReturn),
    totalLegCost: input.quote.totalLegCost,
    showApr,
  };
}

/** Drop Turbo browse rows whose per-period yield is too thin to be useful. */
export function filterMeaningfulScanRows(
  rows: DualInvestmentScanRow[],
  input: { nowMs?: number; minPeriodReturnBps?: number } = {},
): DualInvestmentScanRow[] {
  const minBps = input.minPeriodReturnBps ?? TURBO_MIN_PERIOD_RETURN_BPS;
  return rows.filter((row) => {
    if (!row.quote) return true;
    if (!isSubDayTenor(row.quote.oracle.expiryMs, input.nowMs)) return true;
    if (row.quote.coupon <= 0 || row.quote.principal <= 0) return false;
    // Net basis, matching the displayed per-period yield — a row must not pass
    // the filter on a gross figure the UI never shows.
    const periodReturn = netCouponAfterFee(row.quote.coupon) / row.quote.principal;
    return isMeaningfulTurboPeriodReturn(periodReturn, minBps);
  });
}
