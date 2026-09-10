import {
  fetchBinanceDualInvestmentProducts,
  type BinanceDualInvestmentProduct,
} from '../deepbook/binanceDualInvestment';
import { fetchOracleMarket } from '../deepbook/predictServer';
import type { OracleMarket } from '../products/types';
import { buildCuratedBtcOracleResponse } from '../server/curatedOracles';

export interface RecorderInputs {
  markets: OracleMarket[];
  binanceProducts: BinanceDualInvestmentProduct[];
  spot: number;
  /** Clock passed into the quote + matcher path. */
  nowMs: number;
  upstreamFailed: boolean;
}

/**
 * Load the same day-shelf composition the product page uses
 * (`buildCuratedBtcOracleResponse` day rows), then resolve full OracleMarkets.
 */
export async function loadRecorderInputs(wallClockMs: number): Promise<RecorderInputs> {
  let response;
  try {
    response = await buildCuratedBtcOracleResponse(wallClockMs);
  } catch {
    return {
      markets: [],
      binanceProducts: [],
      spot: 0,
      nowMs: wallClockMs,
      upstreamFailed: true,
    };
  }

  const dayRows = response.oracles.filter((oracle) => oracle.group === 'day');
  if (dayRows.length === 0) {
    return {
      markets: [],
      binanceProducts: [],
      spot: 0,
      nowMs: wallClockMs,
      upstreamFailed: true,
    };
  }

  const markets = (
    await Promise.all(
      dayRows.map(async (row) => {
        try {
          return await fetchOracleMarket(row.oracle_id);
        } catch {
          return null;
        }
      }),
    )
  ).filter((market): market is OracleMarket => market !== null);

  if (markets.length === 0) {
    return {
      markets: [],
      binanceProducts: [],
      spot: 0,
      nowMs: wallClockMs,
      upstreamFailed: true,
    };
  }

  let binanceProducts: BinanceDualInvestmentProduct[];
  try {
    binanceProducts = await fetchBinanceDualInvestmentProducts();
  } catch {
    return {
      markets: [],
      binanceProducts: [],
      spot: markets[0]!.spot,
      nowMs: wallClockMs,
      upstreamFailed: true,
    };
  }

  return {
    markets,
    binanceProducts,
    spot: markets[0]!.spot,
    nowMs: wallClockMs,
    upstreamFailed: false,
  };
}
