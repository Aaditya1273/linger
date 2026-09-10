import { DEEPBOOK_PREDICT } from '../config/deepbook';
import type { OracleMarket, PredictPricingState } from '../products/types';
import { fromChainPrice } from '../products/units';
import {
  createPredictAdapter,
  predictAdapter,
  type ExpiryMarketSummary,
} from './predictAdapter';
import { matchesCadenceFingerprint, type TenorGroup } from '../products/tenorMarkets';
import {
  fetchExpiryMarketState,
  fetchPropbookOracleReads,
  type OnchainExpiryMarketState,
} from './predictOnchain';
import { isOracleTimestampFresh, resolveLiveForward } from './propbookOracle';

/** List-row shape kept for curated API / UI compatibility across deployments. */
export interface PredictOracleListItem {
  predict_id: string;
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  admission_tick_size: number;
  status: string;
  /** Predict schedule name when known (CONTEXT: Cadence — 1m / 5m / 1h). */
  cadence?: '1h' | '5m' | '1m';
  /** Tenor group this row belongs to on the single Dual Investment page. */
  group: TenorGroup;
}


const MIN_TRADABLE_TIME_MS = 5 * 60_000;
const QUOTE_ASSET_SCALE = 10 ** DEEPBOOK_PREDICT.quoteAssetDecimals;
/** Pyth freshness window for re-anchoring forward (matches typical Predict defaults). */
const PYTH_SPOT_FRESHNESS_MS = 60_000;
const FLOAT_SCALE = 1_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function scaledProbability(value: unknown): number | null {
  const raw = finiteNumber(value);
  if (raw === null) return null;
  return raw / FLOAT_SCALE;
}

export function expiryMarketToListItem(
  market: ExpiryMarketSummary,
  group: TenorGroup = 'hourly',
): PredictOracleListItem {
  return {
    predict_id: market.poolVaultId,
    oracle_id: market.expiryMarketId,
    underlying_asset: DEEPBOOK_PREDICT.underlyingAsset,
    expiry: market.expiryMs,
    min_strike: market.admissionTickSize,
    tick_size: market.tickSize,
    admission_tick_size: market.admissionTickSize,
    status: 'active',
    // The hourly shelf also carries decayed day markets (ADR-0007), so the
    // schedule name comes from the market's cadence fingerprint, not the shelf.
    cadence: matchesCadenceFingerprint(market, DEEPBOOK_PREDICT.turboCadence) ? '1h' : undefined,
    group,
  };
}

export function parsePredictPricingState(payload: unknown): PredictPricingState | null {
  if (!isRecord(payload)) return null;
  const vaultBalanceBaseUnits = finiteNumber(payload.vault_balance);
  const vaultTotalMtmBaseUnits = finiteNumber(payload.total_mtm);
  if (vaultBalanceBaseUnits === null || vaultTotalMtmBaseUnits === null) return null;

  const utilization = finiteNumber(payload.utilization);
  const vaultUtilization =
    utilization === null
      ? vaultBalanceBaseUnits <= 0 || vaultTotalMtmBaseUnits <= 0
        ? 0
        : Math.min(1, vaultTotalMtmBaseUnits / vaultBalanceBaseUnits)
      : Math.min(1, Math.max(0, utilization));

  const baseFee = scaledProbability(payload.base_fee) ?? DEEPBOOK_PREDICT.baseSpread;
  const minFee = scaledProbability(payload.min_fee) ?? DEEPBOOK_PREDICT.minSpread;

  return {
    baseSpread: baseFee,
    minSpread: minFee,
    baseFee,
    minFee,
    utilizationMultiplier: DEEPBOOK_PREDICT.utilizationMultiplier,
    minAskPrice: DEEPBOOK_PREDICT.minAskPrice,
    maxAskPrice: DEEPBOOK_PREDICT.maxAskPrice,
    vaultBalance: vaultBalanceBaseUnits / QUOTE_ASSET_SCALE,
    vaultTotalMtm: vaultTotalMtmBaseUnits / QUOTE_ASSET_SCALE,
    vaultUtilization,
    ewmaPenaltyRate: 0,
    expiryFeeWindowMs: finiteNumber(payload.expiry_fee_window_ms) ?? undefined,
    expiryFeeMaxMultiplier: scaledProbability(payload.expiry_fee_max_multiplier) ?? undefined,
  };
}

export async function fetchActiveBtcOracles(
  group: TenorGroup = 'hourly',
): Promise<PredictOracleListItem[]> {
  const adapter = group === 'hourly' ? predictAdapter : createPredictAdapter({ group });
  const markets = await adapter.discoverMarkets();
  return markets.map((market) => expiryMarketToListItem(market, group));
}

export function selectNearestTradableOracle<T extends Pick<PredictOracleListItem, 'expiry'>>(
  oracles: T[],
  nowMs = Date.now(),
  minTimeToExpiryMs = MIN_TRADABLE_TIME_MS,
) {
  const sorted = [...oracles].sort((a, b) => a.expiry - b.expiry);
  return sorted.find((oracle) => oracle.expiry - nowMs > minTimeToExpiryMs) ?? sorted[0];
}

export function filterProductExpiryOracles(
  oracles: PredictOracleListItem[],
  nowMs = Date.now(),
  minTimeToExpiryMs = 0,
) {
  return [...oracles]
    .filter((oracle) => oracle.expiry - nowMs >= minTimeToExpiryMs)
    .sort((a, b) => a.expiry - b.expiry);
}

function defaultPredictPricing(fees: {
  baseFee: number;
  minFee: number;
  expiryFeeWindowMs: number;
  expiryFeeMaxMultiplier: number;
}): PredictPricingState {
  return {
    baseSpread: fees.baseFee,
    minSpread: fees.minFee,
    baseFee: fees.baseFee,
    minFee: fees.minFee,
    utilizationMultiplier: DEEPBOOK_PREDICT.utilizationMultiplier,
    minAskPrice: DEEPBOOK_PREDICT.minAskPrice,
    maxAskPrice: DEEPBOOK_PREDICT.maxAskPrice,
    vaultBalance: 0,
    vaultTotalMtm: 0,
    vaultUtilization: 0,
    ewmaPenaltyRate: 0,
    expiryFeeWindowMs: fees.expiryFeeWindowMs,
    expiryFeeMaxMultiplier: fees.expiryFeeMaxMultiplier,
  };
}

function marketFees(market: OnchainExpiryMarketState) {
  return {
    baseFee: market.baseFeeRaw / FLOAT_SCALE,
    minFee: market.minFeeRaw / FLOAT_SCALE,
    expiryFeeWindowMs: market.expiryFeeWindowMs,
    expiryFeeMaxMultiplier: market.expiryFeeMaxMultiplierRaw / FLOAT_SCALE,
  };
}

/**
 * Server-side assembly for browse quotes. Everything is read on-chain: the
 * ExpiryMarket object for market state and the propbook stores for pricing
 * inputs — the 6-24-era predict/propbook indexers do not serve this deployment.
 */
export async function fetchOracleMarketServer(
  expiryMarketId: string,
  input: { serverLagSeconds?: number; nowMs?: number } = {},
): Promise<OracleMarket> {
  const nowMs = input.nowMs ?? Date.now();
  const market = await fetchExpiryMarketState(expiryMarketId);
  const { pyth, bsSpot, bsForward, bsSvi } = await fetchPropbookOracleReads(market.expiryMs);

  if (!pyth) {
    throw new Error('Pyth spot is unavailable on-chain.');
  }

  const pythFresh = isOracleTimestampFresh({
    sourceTimestampMs: pyth.sourceTimestampMs,
    nowMs,
    freshnessMs: PYTH_SPOT_FRESHNESS_MS,
  });

  const forward =
    bsSpot && bsForward
      ? resolveLiveForward({
          pythSpot: pyth.spot,
          pythFresh,
          bsSpot: bsSpot.spot,
          bsForward: bsForward.forward,
        })
      : (bsForward?.forward ?? pyth.spot);

  const fees = marketFees(market);

  return {
    predictId: DEEPBOOK_PREDICT.poolVaultId,
    oracleId: market.expiryMarketId,
    underlyingAsset: 'BTC',
    expiryMs: market.expiryMs,
    minStrike: fromChainPrice(market.admissionTickSizeRaw),
    tickSize: fromChainPrice(market.tickSizeRaw),
    admissionTickSize: fromChainPrice(market.admissionTickSizeRaw),
    status: 'active',
    spot: pyth.spot,
    forward,
    spotTimestampMs: pyth.sourceTimestampMs,
    sviTimestampMs: bsSvi?.sourceTimestampMs ?? pyth.sourceTimestampMs,
    // Honest Block Scholes source timestamps (no pyth fallback): the pause gate
    // must see the real age of the inputs the on-chain pricer will assert on.
    bsPriceTimestampMs:
      bsSpot && bsForward
        ? Math.min(bsSpot.sourceTimestampMs, bsForward.sourceTimestampMs)
        : null,
    bsSviTimestampMs: bsSvi?.sourceTimestampMs ?? null,
    serverLagSeconds: input.serverLagSeconds ?? 0,
    svi: bsSvi?.svi,
    predictPricing: defaultPredictPricing(fees),
  };
}

export async function fetchOracleMarket(
  expiryMarketId: string,
  input: { serverLagSeconds?: number } = {},
): Promise<OracleMarket> {
  if (typeof window !== 'undefined') {
    const lag = input.serverLagSeconds ?? 0;
    const response = await fetch(
      `/api/oracles/${expiryMarketId}/market?lag=${encodeURIComponent(String(lag))}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      throw new Error(`Oracle market request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<OracleMarket>;
  }
  return fetchOracleMarketServer(expiryMarketId, input);
}

/** Vault summary endpoint was removed in 6-24; keep a no-op for callers until PLP wiring lands. */
export async function fetchPredictPricingState(): Promise<PredictPricingState> {
  return {
    baseSpread: DEEPBOOK_PREDICT.baseSpread,
    minSpread: DEEPBOOK_PREDICT.minSpread,
    baseFee: DEEPBOOK_PREDICT.baseSpread,
    minFee: DEEPBOOK_PREDICT.minSpread,
    utilizationMultiplier: DEEPBOOK_PREDICT.utilizationMultiplier,
    minAskPrice: DEEPBOOK_PREDICT.minAskPrice,
    maxAskPrice: DEEPBOOK_PREDICT.maxAskPrice,
    vaultBalance: 0,
    vaultTotalMtm: 0,
    vaultUtilization: 0,
    ewmaPenaltyRate: 0,
  };
}
