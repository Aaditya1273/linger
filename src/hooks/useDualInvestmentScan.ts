import { useQuery } from '@tanstack/react-query';
import { createDefaultQuoteProvider, type QuoteProvider } from '../deepbook/quoteProvider';
import { buildDualInvestmentLegIntents, compileDualInvestment } from '../products/dualInvestment';
import {
  buildDualInvestmentScanInputs,
  filterMeaningfulScanRows,
  MAX_REFERENCE_SCAN_ROWS,
  type DualInvestmentScanRow,
} from '../products/dualInvestmentScan';
import { DEFAULT_MAX_PREDICT_ASK, DEFAULT_MIN_PREDICT_ASK, estimateBinaryUpAskPrice } from '../products/predictPricing';
import type { DualInvestmentInput, LegIntent, LegQuote, OracleMarket } from '../products/types';

function errorMessage(error: unknown, fallback = 'Quote preview failed.') {
  return error instanceof Error ? error.message : fallback;
}

export async function buildVerifiedDualInvestmentQuote(input: {
  oracle: OracleMarket;
  productInput: DualInvestmentInput;
  quoteProvider?: QuoteProvider;
}) {
  const provider = input.quoteProvider ?? createDefaultQuoteProvider(input.oracle);
  const intents = buildDualInvestmentLegIntents(input.productInput, input.oracle);
  const quotedLegs = await provider.quoteLegs(intents);
  return compileDualInvestment({
    input: input.productInput,
    oracle: input.oracle,
    quotedLegs,
  });
}

function fallbackIndicativeAskPrice(market: OracleMarket, leg: LegIntent) {
  if (leg.strike === undefined || market.forward <= 0) return 0.5;
  const distance = Math.abs(leg.strike - market.forward) / market.forward;
  const directionalPrice =
    leg.instrumentType === 'binary-down' ? 0.5 + distance * 4 : 0.5 - (leg.strike - market.forward) / market.forward * 4;
  return directionalPrice;
}

function clampIndicativeAskPrice(market: OracleMarket, value: number) {
  const minAskPrice = Math.max(DEFAULT_MIN_PREDICT_ASK, market.predictPricing?.minAskPrice ?? DEFAULT_MIN_PREDICT_ASK);
  const maxAskPrice = market.predictPricing?.maxAskPrice ?? DEFAULT_MAX_PREDICT_ASK;
  return Math.min(maxAskPrice, Math.max(minAskPrice, value));
}

function buildIndicativeLegQuote(market: OracleMarket, leg: LegIntent, nowMs?: number): LegQuote {
  const sviAskPrice =
    leg.instrumentType === 'binary-up' && leg.strike !== undefined
      ? estimateBinaryUpAskPrice({ market, strike: leg.strike })
      : null;
  const askPrice = clampIndicativeAskPrice(market, sviAskPrice ?? fallbackIndicativeAskPrice(market, leg));
  const askCost = askPrice * leg.quantity;
  return {
    ...leg,
    askPrice,
    askCost,
    redeemPreview: askCost,
    quoteTimestampMs: nowMs ?? Date.now(),
    executable: Boolean(market.svi) && sviAskPrice !== null,
  };
}

/** `nowMs` overrides the quote clock — tests pass a fixed instant for determinism. */
export function buildIndicativeDualInvestmentQuote(input: {
  market: OracleMarket;
  productInput: DualInvestmentInput;
  nowMs?: number;
}) {
  const intents = buildDualInvestmentLegIntents(input.productInput, input.market, { nowMs: input.nowMs });
  const quotedLegs = intents.map((intent) => buildIndicativeLegQuote(input.market, intent, input.nowMs));
  return compileDualInvestment({
    input: input.productInput,
    oracle: input.market,
    quotedLegs,
    nowMs: input.nowMs,
  });
}

export async function buildDualInvestmentScan(input: {
  market: OracleMarket;
  principal: number;
  nowMs?: number;
}): Promise<DualInvestmentScanRow[]> {
  const scanInputs = buildDualInvestmentScanInputs({
    market: input.market,
    principal: input.principal,
    nowMs: input.nowMs,
  });

  const preparedRows = scanInputs.map((productInput) => {
    try {
      return {
        input: productInput,
        intents: buildDualInvestmentLegIntents(productInput, input.market, { nowMs: input.nowMs }),
      };
    } catch (error) {
      return {
        input: productInput,
        intents: null,
        error: errorMessage(error),
      };
    }
  });

  const rows = preparedRows.map((row) => {
    if (!row.intents) {
      return {
        input: row.input,
        quote: null,
        error: row.error,
      };
    }

    try {
      const quotedLegs = row.intents.map((intent) => buildIndicativeLegQuote(input.market, intent, input.nowMs));
      const quote = compileDualInvestment({
        input: row.input,
        oracle: input.market,
        quotedLegs,
        nowMs: input.nowMs,
      });
      return {
        input: row.input,
        quote,
      };
    } catch (error) {
      return {
        input: row.input,
        quote: null,
        error: errorMessage(error),
      };
    }
  });

  return filterMeaningfulScanRows(rows, { nowMs: input.nowMs }).slice(0, MAX_REFERENCE_SCAN_ROWS);
}

export function useDualInvestmentScan(input: {
  market?: OracleMarket;
  principal: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'dual-investment-scan',
      input.market?.oracleId,
      input.market?.spotTimestampMs,
      input.market?.sviTimestampMs,
      input.market?.predictPricing?.baseFee,
      input.market?.predictPricing?.minFee,
      input.market?.predictPricing?.baseSpread,
      input.market?.predictPricing?.minSpread,
      input.market?.predictPricing?.ewmaPenaltyRate,
      input.principal,
    ],
    enabled: Boolean(input.market) && (input.enabled ?? true),
    queryFn: () =>
      buildDualInvestmentScan({
        market: input.market as OracleMarket,
        principal: input.principal,
      }),
    retry: 0,
    placeholderData: (previous) => previous,
  });
}
