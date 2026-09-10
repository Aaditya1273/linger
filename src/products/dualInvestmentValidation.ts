import type { DualInvestmentInput, OracleMarket, StructuredProductQuote } from './types';
import { estimateMinQuotableStrike } from './predictPricing';

const MAX_TARGET_LEG_COUNT = 32;
const EPSILON = 0.000001;

/**
 * Coarse fallback bound for markets whose SVI cannot price the quotable band.
 * Live markets expose minStrike = admissionTickSize (~$1), so without any
 * spot-relative bound a target like 10 vs spot ~63,960 passes every strike
 * check and the pricer's ask clamp manufactures a fake positive coupon.
 */
export const MAX_TARGET_BELOW_SPOT_RATIO = 0.3;

function admissionStep(oracle: OracleMarket) {
  return oracle.admissionTickSize && oracle.admissionTickSize > 0
    ? oracle.admissionTickSize
    : oracle.tickSize;
}

/**
 * Lowest Buy Low target the market can actually fill: one admission step above
 * the deepest strike whose ask fits inside the Predict max-ask clamp. Falls
 * back to the coarse spot band when SVI is unavailable.
 */
export function minQuotableTargetPrice(oracle: OracleMarket, nowMs?: number) {
  const minQuotableStrike = estimateMinQuotableStrike({ market: oracle, nowMs });
  if (minQuotableStrike !== null) return minQuotableStrike + admissionStep(oracle);
  return oracle.spot * (1 - MAX_TARGET_BELOW_SPOT_RATIO);
}

export type DualInvestmentValidationCode =
  | 'input-shape'
  | 'principal'
  | 'target-price'
  | 'target-spot-band'
  | 'target-quotable-band'
  | 'floor-quotable-band'
  | 'floor-price'
  | 'price-order'
  | 'step-size'
  | 'leg-count'
  | 'oracle-grid'
  | 'oracle-expiry'
  | 'oracle-strike-range'
  | 'leg-quantity'
  | 'coupon'
  | 'cost-budget'
  | 'payoff-backing';

export interface DomainValidationError {
  code: DualInvestmentValidationCode;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly DomainValidationError[] };

export class DualInvestmentValidationError extends Error {
  readonly errors: readonly DomainValidationError[];

  constructor(errors: readonly DomainValidationError[]) {
    super(errors.map((error) => error.message).join(' '));
    this.name = 'DualInvestmentValidationError';
    this.errors = errors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readNumber(record: Record<string, unknown>, key: keyof DualInvestmentInput) {
  const value = record[key];
  return finiteNumber(value) ? value : null;
}

export function validateDualInvestmentInput(
  input: unknown,
  options: { oracle?: OracleMarket; nowMs?: number } = {},
): ValidationResult<DualInvestmentInput> {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ code: 'input-shape', message: 'Dual Investment input must be an object.' }] };
  }

  const errors: DomainValidationError[] = [];
  const principal = readNumber(input, 'principal');
  const targetPrice = readNumber(input, 'targetPrice');
  const floorPrice = readNumber(input, 'floorPrice');
  const stepSize = input.stepSize === undefined ? undefined : readNumber(input, 'stepSize');
  const targetLegCount =
    input.targetLegCount === undefined ? undefined : readNumber(input, 'targetLegCount');

  if (principal === null || principal <= 0) {
    errors.push({ code: 'principal', message: 'Principal must be greater than zero.' });
  }
  if (targetPrice === null || targetPrice <= 0) {
    errors.push({ code: 'target-price', message: 'Target price must be greater than zero.' });
  }
  if (floorPrice === null || floorPrice <= 0) {
    errors.push({ code: 'floor-price', message: 'Floor price must be greater than zero.' });
  }
  if (targetPrice !== null && floorPrice !== null && floorPrice >= targetPrice) {
    errors.push({ code: 'price-order', message: 'Floor price must be below target price.' });
  }
  if (stepSize !== undefined && (stepSize === null || stepSize <= 0)) {
    errors.push({ code: 'step-size', message: 'Strike step size must be greater than zero.' });
  }
  if (
    targetLegCount !== undefined &&
    (targetLegCount === null ||
      targetLegCount < 1 ||
      targetLegCount > MAX_TARGET_LEG_COUNT ||
      Math.floor(targetLegCount) !== targetLegCount)
  ) {
    errors.push({
      code: 'leg-count',
      message: `Target leg count must be an integer between 1 and ${MAX_TARGET_LEG_COUNT}.`,
    });
  }

  if (options.oracle) {
    if (!Number.isFinite(options.oracle.tickSize) || options.oracle.tickSize <= 0) {
      errors.push({ code: 'oracle-grid', message: 'Oracle tick size must be greater than zero.' });
    }
    const nowMs = options.nowMs ?? Date.now();
    if (!Number.isFinite(options.oracle.expiryMs) || options.oracle.expiryMs <= nowMs) {
      errors.push({ code: 'oracle-expiry', message: 'Oracle expiry must be in the future.' });
    }
    if (
      floorPrice !== null &&
      Number.isFinite(options.oracle.minStrike) &&
      floorPrice < options.oracle.minStrike
    ) {
      errors.push({ code: 'oracle-strike-range', message: 'Floor price must be on or above the oracle strike range.' });
    }
    const minQuotableStrike = estimateMinQuotableStrike({
      market: options.oracle,
      nowMs: options.nowMs,
    });
    if (minQuotableStrike !== null) {
      const step = admissionStep(options.oracle);
      if (targetPrice !== null && targetPrice < minQuotableStrike + step) {
        errors.push({
          code: 'target-quotable-band',
          message: `Target price must be at least ${(minQuotableStrike + step).toLocaleString('en-US')} — deeper legs cannot fill within Predict ask limits.`,
        });
      }
      // One-step tolerance: the auto floor rounds to the nearest admission grid point.
      if (floorPrice !== null && floorPrice < minQuotableStrike - step) {
        errors.push({
          code: 'floor-quotable-band',
          message: `Floor price must be at least ${minQuotableStrike.toLocaleString('en-US')} — deeper legs cannot fill within Predict ask limits.`,
        });
      }
    } else if (
      targetPrice !== null &&
      Number.isFinite(options.oracle.spot) &&
      options.oracle.spot > 0 &&
      targetPrice < options.oracle.spot * (1 - MAX_TARGET_BELOW_SPOT_RATIO)
    ) {
      errors.push({
        code: 'target-spot-band',
        message: `Target price must be within ${MAX_TARGET_BELOW_SPOT_RATIO * 100}% of the current price.`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      principal: principal as number,
      targetPrice: targetPrice as number,
      floorPrice: floorPrice as number,
      ...(stepSize === undefined ? {} : { stepSize: stepSize as number }),
      ...(targetLegCount === undefined ? {} : { targetLegCount: targetLegCount as number }),
    },
  };
}

export function assertValidDualInvestmentInput(
  input: unknown,
  options: { oracle?: OracleMarket; nowMs?: number } = {},
): DualInvestmentInput {
  const result = validateDualInvestmentInput(input, options);
  if (!result.ok) throw new DualInvestmentValidationError(result.errors);
  return result.value;
}

export function validateDualInvestmentQuote(quote: StructuredProductQuote): ValidationResult<StructuredProductQuote> {
  const errors: DomainValidationError[] = [];

  if (quote.productType !== 'dual-investment') {
    errors.push({ code: 'input-shape', message: 'Expected a Dual Investment quote.' });
  }
  if (quote.legs.some((leg) => !Number.isFinite(leg.quantity) || leg.quantity <= 0)) {
    errors.push({ code: 'leg-quantity', message: 'Every quote leg must have a positive finite quantity.' });
  }
  if (!Number.isFinite(quote.coupon) || quote.coupon < 0) {
    errors.push({ code: 'coupon', message: 'Coupon must be non-negative.' });
  }
  if (quote.totalLegCost > quote.principal - quote.reserve + EPSILON) {
    errors.push({ code: 'cost-budget', message: 'Quoted leg cost cannot exceed principal minus reserve.' });
  }

  const maxLegPayout = quote.legs.reduce((sum, leg) => sum + leg.quantity, 0);
  if (Math.abs(quote.reserve + maxLegPayout - quote.principal) > EPSILON) {
    errors.push({
      code: 'payoff-backing',
      message: 'Reserve plus maximum leg payout must equal principal.',
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: quote };
}

export function assertValidDualInvestmentQuote(quote: StructuredProductQuote): StructuredProductQuote {
  const result = validateDualInvestmentQuote(quote);
  if (!result.ok) throw new DualInvestmentValidationError(result.errors);
  return result.value;
}
