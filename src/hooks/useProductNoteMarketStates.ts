'use client';

import { useQueries } from '@tanstack/react-query';
import { fetchPredictMarketState, type PredictMarketState } from '../deepbook/predictMarketState';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';

export function predictMarketStateQueryKey(expiryMarketId: string) {
  return ['predict-market-state', expiryMarketId] as const;
}

export function useProductNoteMarketStates(notes: readonly Pick<AnkerProductNoteRecord, 'oracleId' | 'expiryMs'>[]) {
  const markets = [...new Map(notes.map((note) => [note.oracleId, note])).values()];
  const queries = useQueries({
    queries: markets.map((market) => ({
      queryKey: predictMarketStateQueryKey(market.oracleId),
      queryFn: () => fetchPredictMarketState(market.oracleId),
      retry: 2,
      refetchInterval: (query: { state: { data?: PredictMarketState } }) => {
        if (query.state.data?.settlementPriceBaseUnits != null) return false;
        return Date.now() >= market.expiryMs ? 2_000 : 15_000;
      },
    })),
  });

  return {
    byMarketId: Object.fromEntries(
      markets.map((market, index) => [market.oracleId.toLowerCase(), queries[index]?.data]),
    ) as Record<string, PredictMarketState | undefined>,
  };
}
