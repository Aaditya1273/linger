import type { StructuredProductQuote } from './types';
import { DEFAULT_QUOTE_ENVELOPE_SLIPPAGE_BPS, DEFAULT_QUOTE_ENVELOPE_TTL_MS } from './quoteEnvelope';

export interface DualInvestmentRiskMetrics {
  minimumPayout: number;
  maximumPayout: number;
  maximumLoss: number;
  optionBudget: number;
  holdingPeriodReturn: number;
  quoteTtlSeconds: number;
  maxCostSlippage: number;
  liquidityStatus: 'verified' | 'unavailable';
}

function clampTiny(value: number) {
  if (Math.abs(value) < 0.0000000001) return 0;
  return Number(value.toFixed(12));
}

export function riskMetricsForDualInvestmentQuote(quote: StructuredProductQuote): DualInvestmentRiskMetrics {
  const minimumPayout = quote.reserve + quote.coupon;
  const maximumPayout = quote.principal + quote.coupon;
  return {
    minimumPayout: clampTiny(minimumPayout),
    maximumPayout: clampTiny(maximumPayout),
    maximumLoss: clampTiny(Math.max(0, quote.principal - minimumPayout)),
    optionBudget: quote.totalLegCost,
    holdingPeriodReturn: clampTiny(quote.principal > 0 ? quote.coupon / quote.principal : 0),
    quoteTtlSeconds: DEFAULT_QUOTE_ENVELOPE_TTL_MS / 1_000,
    maxCostSlippage: DEFAULT_QUOTE_ENVELOPE_SLIPPAGE_BPS / 10_000,
    liquidityStatus: quote.executable && quote.legs.every((leg) => leg.executable) ? 'verified' : 'unavailable',
  };
}
