import { fetchAllExpiryMarketSummaries } from '../deepbook/predictAdapter';
import {
  expiryMarketToListItem,
  fetchActiveBtcOracles,
  fetchOracleMarket,
  type PredictOracleListItem,
} from '../deepbook/predictServer';
import { filterMarketsForTenorGroup } from '../products/tenorMarkets';
import type { OracleMarket } from '../products/types';

const CURATED_ORACLE_CACHE_MS = 15_000;

export interface OracleReadiness {
  stateReady: boolean;
  quoteReady: boolean;
  reason?: string;
}

export interface CuratedOracleListItem extends PredictOracleListItem {
  stateReady: boolean;
  quoteReady: boolean;
  productReady: boolean;
  timeToExpiryMs: number;
  reason?: string;
  /** Embedded browse market for rows the 6-24 indexer cannot serve (E2E fixtures). */
  market?: OracleMarket;
}

export interface CuratedOracleMarketResponse {
  generatedAt: number;
  /** Day rows first (primary product), then hourly rows; expiry-sorted within each group. */
  oracles: CuratedOracleListItem[];
}

const cache: {
  at: number;
  response: CuratedOracleMarketResponse | null;
  inFlight: Promise<CuratedOracleMarketResponse> | null;
} = { at: 0, response: null, inFlight: null };

function dedupeKey(oracle: PredictOracleListItem) {
  return `${oracle.underlying_asset}-${oracle.expiry}-${oracle.min_strike}-${oracle.tick_size}`;
}

export function curateBtcOracles(
  oracles: PredictOracleListItem[],
  readinessByOracleId: Map<string, OracleReadiness>,
  nowMs = Date.now(),
): CuratedOracleListItem[] {
  const bestByKey = new Map<string, CuratedOracleListItem>();

  oracles
    .filter((oracle) => oracle.underlying_asset === 'BTC')
    .filter((oracle) => oracle.status === 'active')
    .filter((oracle) => oracle.expiry > nowMs)
    .forEach((oracle) => {
      const readiness = readinessByOracleId.get(oracle.oracle_id);
      const timeToExpiryMs = oracle.expiry - nowMs;
      const stateReady = Boolean(readiness?.stateReady);
      const quoteReady = Boolean(readiness?.quoteReady);
      // Live rows are product-ready once discovered and state-readable (ADR-0002).
      const productReady = stateReady;
      const item: CuratedOracleListItem = {
        ...oracle,
        stateReady,
        quoteReady,
        productReady,
        timeToExpiryMs,
        reason: readiness?.reason,
      };

      if (!item.productReady) return;

      const key = dedupeKey(item);
      const current = bestByKey.get(key);
      if (!current || Number(item.quoteReady) > Number(current.quoteReady)) {
        bestByKey.set(key, item);
      }
    });

  return [...bestByKey.values()].sort((a, b) => a.expiry - b.expiry);
}

async function getOracleReadiness(input: {
  oracle: PredictOracleListItem;
}): Promise<OracleReadiness> {
  try {
    const market = await fetchOracleMarket(input.oracle.oracle_id);
    const stateReady =
      Number.isFinite(market.spot) &&
      market.spot > 0 &&
      Number.isFinite(market.forward) &&
      market.forward > 0 &&
      Boolean(market.spotTimestampMs);

    if (!stateReady) {
      return { stateReady: false, quoteReady: false, reason: 'Expiry market state is incomplete.' };
    }

    // Full SVI quote path: quote-ready when SVI params are present for browse pricing.
    return { stateReady: true, quoteReady: Boolean(market.svi) };
  } catch (error) {
    return {
      stateReady: false,
      quoteReady: false,
      reason: error instanceof Error ? error.message : 'Oracle readiness check failed.',
    };
  }
}

async function curateWithReadiness(candidateOracles: PredictOracleListItem[], nowMs: number) {
  const readinessEntries = await Promise.all(
    candidateOracles.map(
      async (oracle) => [oracle.oracle_id, await getOracleReadiness({ oracle })] as const,
    ),
  );
  return curateBtcOracles(candidateOracles, new Map(readinessEntries), nowMs);
}

async function computeHourlyRows(nowMs: number): Promise<CuratedOracleListItem[]> {
  const candidateOracles = await fetchActiveBtcOracles('hourly');
  return curateWithReadiness(candidateOracles, nowMs);
}

/**
 * Day ladder: live 6-24 day-scale Expiry Markets only. Discovery errors
 * propagate to the route's error response — no day rows means the day group
 * is absent, never backfilled with stand-in data.
 */
async function computeDayRows(nowMs: number): Promise<CuratedOracleListItem[]> {
  const discovered = await fetchAllExpiryMarketSummaries();
  const dayMarkets = filterMarketsForTenorGroup(discovered, 'day', { nowMs });
  if (dayMarkets.length === 0) return [];
  return curateWithReadiness(
    dayMarkets.map((market) => expiryMarketToListItem(market, 'day')),
    nowMs,
  );
}

async function computeMergedResponse(nowMs: number): Promise<CuratedOracleMarketResponse> {
  const [day, hourly] = await Promise.all([
    computeDayRows(nowMs),
    // Hourly discovery failure must not blank the day group; the client refetches on its 15s cycle.
    computeHourlyRows(nowMs).catch(() => [] as CuratedOracleListItem[]),
  ]);

  return {
    generatedAt: nowMs,
    oracles: [...day, ...hourly],
  };
}

export async function buildCuratedBtcOracleResponse(
  nowMs = Date.now(),
): Promise<CuratedOracleMarketResponse> {
  if (cache.response && nowMs >= cache.at && nowMs - cache.at < CURATED_ORACLE_CACHE_MS) {
    return cache.response;
  }

  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = computeMergedResponse(nowMs)
    .then((response) => {
      cache.at = nowMs;
      cache.response = response;
      return response;
    })
    .finally(() => {
      cache.inFlight = null;
    });
  return cache.inFlight;
}
