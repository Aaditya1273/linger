import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { isDeterministicE2E } from '../config/runtimeModes';
import { estimateBinaryUpAskPrice, DEFAULT_MAX_PREDICT_ASK, DEFAULT_MIN_PREDICT_ASK } from '../products/predictPricing';
import type { LegIntent, LegQuote, OracleMarket } from '../products/types';

const QUOTE_ASSET_SCALE = 10 ** DEEPBOOK_PREDICT.quoteAssetDecimals;

export interface QuoteProvider {
  quoteLegs(legs: LegIntent[]): Promise<LegQuote[]>;
}

export interface PredictMintBounds {
  minAskPrice: number;
  maxAskPrice: number;
}

export const DEFAULT_PREDICT_MINT_BOUNDS: PredictMintBounds = {
  minAskPrice: DEEPBOOK_PREDICT.minAskPrice,
  maxAskPrice: DEEPBOOK_PREDICT.maxAskPrice,
};

export function normalizePreviewResult(input: { mintCost: string | number; redeemPayout: string | number }) {
  return {
    askCost: Number(input.mintCost),
    redeemPreview: Number(input.redeemPayout),
  };
}

export function applyPredictMintBounds(
  leg: LegIntent,
  amounts: { askCost: number; redeemPreview: number },
  quoteTimestampMs = Date.now(),
  bounds: PredictMintBounds = DEFAULT_PREDICT_MINT_BOUNDS,
): LegQuote {
  const askPrice = leg.quantity === 0 ? 0 : amounts.askCost / leg.quantity;
  const mintable = leg.quantity > 0 && askPrice >= bounds.minAskPrice && askPrice <= bounds.maxAskPrice;

  return {
    ...leg,
    askPrice,
    askCost: amounts.askCost,
    redeemPreview: amounts.redeemPreview,
    quoteTimestampMs,
    executable: mintable,
    error: mintable
      ? undefined
      : `Ask price ${askPrice.toFixed(4)} is outside Predict mint bounds ${bounds.minAskPrice}-${bounds.maxAskPrice}.`,
  };
}

export function toPreviewQuantityBaseUnits(value: number): bigint {
  if (!Number.isFinite(value)) {
    throw new Error('Preview quantity must be a finite number.');
  }
  if (value <= 0) {
    throw new Error('Preview quantity must be greater than zero.');
  }

  const rounded = Math.round(value * QUOTE_ASSET_SCALE);
  if (rounded <= 0) {
    throw new Error('Preview quantity rounds to zero base units.');
  }
  if (!Number.isSafeInteger(rounded)) {
    throw new Error('Preview quantity exceeds safe integer range.');
  }

  return BigInt(rounded);
}

function clampAsk(market: OracleMarket, value: number) {
  const minAskPrice = Math.max(DEFAULT_MIN_PREDICT_ASK, market.predictPricing?.minAskPrice ?? DEFAULT_MIN_PREDICT_ASK);
  const maxAskPrice = market.predictPricing?.maxAskPrice ?? DEFAULT_MAX_PREDICT_ASK;
  return Math.min(maxAskPrice, Math.max(minAskPrice, value));
}

function fallbackAskPrice(market: OracleMarket, leg: LegIntent) {
  if (leg.strike === undefined || market.forward <= 0) return 0.5;
  const distance = Math.abs(leg.strike - market.forward) / market.forward;
  return leg.instrumentType === 'binary-down'
    ? 0.5 + distance * 4
    : 0.5 - ((leg.strike - market.forward) / market.forward) * 4;
}

/** D6 layer-1 browse quotes: local SVI fair + base_fee/min_fee/EWMA stack. */
export class SviBrowseQuoteProvider implements QuoteProvider {
  constructor(private readonly market: OracleMarket) {}

  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    const now = Date.now();
    return legs.map((leg) => {
      const sviAsk =
        leg.instrumentType === 'binary-up' && leg.strike !== undefined
          ? estimateBinaryUpAskPrice({ market: this.market, strike: leg.strike, nowMs: now })
          : null;
      const askPrice = clampAsk(this.market, sviAsk ?? fallbackAskPrice(this.market, leg));
      const askCost = askPrice * leg.quantity;
      const mintable =
        Boolean(this.market.svi) &&
        sviAsk !== null &&
        askPrice >= (this.market.predictPricing?.minAskPrice ?? DEFAULT_MIN_PREDICT_ASK) &&
        askPrice <= (this.market.predictPricing?.maxAskPrice ?? DEFAULT_MAX_PREDICT_ASK);

      return {
        ...leg,
        askPrice,
        askCost,
        redeemPreview: askCost,
        quoteTimestampMs: now,
        executable: mintable,
        error: mintable
          ? undefined
          : this.market.svi
            ? 'Ask outside Predict mint bounds.'
            : 'SVI surface unavailable for browse quote.',
      };
    });
  }
}

/**
 * Browse quotes use off-chain SVI + fee stack (D6 layer 1).
 * Pre-sign simulateTransaction (D6 layer 2) lands in #5.
 * No SVI surface means no quotable market — callers surface the error state.
 */
export class LivePreviewQuoteProvider implements QuoteProvider {
  constructor(private readonly market?: OracleMarket) {}

  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    if (!this.market?.svi) {
      throw new Error('SVI surface unavailable — live quotes cannot be built for this market.');
    }
    return new SviBrowseQuoteProvider(this.market).quoteLegs(legs);
  }
}

export class BatchedLivePreviewQuoteProvider implements QuoteProvider {
  constructor(private readonly market?: OracleMarket) {}

  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    return new LivePreviewQuoteProvider(this.market).quoteLegs(legs);
  }
}

export function createDefaultQuoteProvider(market?: OracleMarket): QuoteProvider {
  // Deterministic browser tests can supply a local SVI market and exercise the
  // real executable-quote UI without touching a chain or changing production.
  if (isDeterministicE2E() && market) return new SviBrowseQuoteProvider(market);
  return new BatchedLivePreviewQuoteProvider(market);
}
