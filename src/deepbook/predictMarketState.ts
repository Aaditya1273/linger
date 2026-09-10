import { fromChainPrice } from '../products/units';
import { fetchExpiryMarketState } from './predictOnchain';

/**
 * Settlement view of one Expiry Market, read from the ExpiryMarket shared
 * object (the 6-24-era indexer `/markets/{id}/state` no longer serves this
 * deployment). `settlementPriceBaseUnits` null means not yet settled.
 */
export interface PredictMarketState {
  expiryMarketId: string;
  expiryMs: number;
  settlementPrice: number | null;
  settlementPriceBaseUnits: bigint | null;
}

/** JSON-safe wire shape served by `/api/markets/{id}/state` (bigint as string). */
export interface PredictMarketStateWire {
  expiryMarketId: string;
  expiryMs: number;
  settlementPriceBaseUnits: string | null;
}

export function toPredictMarketStateWire(state: PredictMarketState): PredictMarketStateWire {
  return {
    expiryMarketId: state.expiryMarketId,
    expiryMs: state.expiryMs,
    settlementPriceBaseUnits: state.settlementPriceBaseUnits?.toString() ?? null,
  };
}

export function parsePredictMarketStateWire(payload: unknown): PredictMarketState {
  const wire = payload as Partial<PredictMarketStateWire> | null;
  if (
    !wire ||
    typeof wire.expiryMarketId !== 'string' ||
    typeof wire.expiryMs !== 'number' ||
    !Number.isSafeInteger(wire.expiryMs)
  ) {
    throw new Error('Predict market state response is invalid.');
  }
  const baseUnits =
    typeof wire.settlementPriceBaseUnits === 'string' &&
    /^(0|[1-9]\d*)$/.test(wire.settlementPriceBaseUnits)
      ? BigInt(wire.settlementPriceBaseUnits)
      : null;
  return {
    expiryMarketId: wire.expiryMarketId,
    expiryMs: wire.expiryMs,
    settlementPrice: baseUnits !== null ? fromChainPrice(baseUnits.toString()) : null,
    settlementPriceBaseUnits: baseUnits,
  };
}

export async function fetchPredictMarketStateServer(
  expiryMarketId: string,
): Promise<PredictMarketState> {
  const state = await fetchExpiryMarketState(expiryMarketId);
  const baseUnits = state.settlementPriceBaseUnits;
  return {
    expiryMarketId: state.expiryMarketId,
    expiryMs: state.expiryMs,
    settlementPrice: baseUnits !== null ? fromChainPrice(baseUnits.toString()) : null,
    settlementPriceBaseUnits: baseUnits,
  };
}

export async function fetchPredictMarketState(expiryMarketId: string): Promise<PredictMarketState> {
  if (typeof window !== 'undefined') {
    const response = await fetch(`/api/markets/${expiryMarketId}/state`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Predict market state request failed: ${response.status} ${response.statusText}`);
    }
    return parsePredictMarketStateWire(await response.json());
  }
  return fetchPredictMarketStateServer(expiryMarketId);
}
