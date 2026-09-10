import { useQuery } from '@tanstack/react-query';
import {
  fetchOracleMarket,
  fetchPredictPricingState,
  selectNearestTradableOracle,
} from '../deepbook/predictServer';
import type { OracleMarket } from '../products/types';
import type {
  CuratedOracleListItem,
  CuratedOracleMarketResponse,
} from '../server/curatedOracles';

async function fetchCuratedBtcOracles(): Promise<CuratedOracleMarketResponse> {
  const response = await fetch('/api/markets/btc-oracles');
  if (!response.ok) {
    throw new Error(`Curated oracle request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<CuratedOracleMarketResponse>;
}

/**
 * Landing default: furthest day row (primary product), else nearest tradable
 * hourly row. Near-term day tenors often have no Binance match; the long end
 * of the ladder (e.g. ~48d) is the better first paint.
 */
export function defaultOracleSelection(
  oracles: CuratedOracleListItem[],
  nowMs = Date.now(),
): CuratedOracleListItem | undefined {
  const dayRows = oracles.filter((oracle) => oracle.group === 'day');
  if (dayRows.length > 0) return dayRows[dayRows.length - 1];
  return selectNearestTradableOracle(oracles, nowMs, 0);
}

export interface MarketDataResult {
  market: OracleMarket | undefined;
  productOracles: CuratedOracleListItem[];
  selectedOracleId: string | undefined;
}

export const MARKET_REFETCH_INTERVAL_MS = 15_000;

export function useMarketData(selectedOracleId?: string) {
  return useQuery({
    queryKey: ['deepbook-market', selectedOracleId],
    queryFn: async (): Promise<MarketDataResult> => {
      const curated = await fetchCuratedBtcOracles();
      const productOracles = curated.oracles;
      const selected =
        productOracles.find((oracle) => oracle.oracle_id === selectedOracleId) ??
        defaultOracleSelection(productOracles);

      if (!selected) {
        return {
          market: undefined,
          productOracles: [],
          selectedOracleId: undefined,
        };
      }

      // E2E fixture rows embed their browse market — live discovery can't serve them.
      if (selected.market) {
        return {
          market: selected.market,
          productOracles,
          selectedOracleId: selected.oracle_id,
        };
      }

      const predictPricing = await fetchPredictPricingState().catch(() => undefined);
      const market = await fetchOracleMarket(selected.oracle_id);
      return {
        market: predictPricing ? { ...market, predictPricing } : market,
        productOracles,
        selectedOracleId: selected.oracle_id,
      };
    },
    refetchInterval: MARKET_REFETCH_INTERVAL_MS,
    retry: 1,
  });
}
