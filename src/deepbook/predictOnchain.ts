import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { DEEPBOOK_PREDICT, SUI_GRPC_URL, SUI_NETWORK } from '../config/deepbook';
import { fromChainPrice } from '../products/units';
import type { ExpiryMarketSummary } from './predictAdapter';
import type { PropbookForwardRead, PropbookSpotRead, PropbookSviRead } from './propbookOracle';

/**
 * 8-04 on-chain data plane. The predict/propbook indexers only serve the dead
 * 6-24 deployment, so market discovery, market state, and oracle reads all come
 * straight from the fullnode:
 *  - discovery: devInspect `plp::active_expiry_markets(vault)` — O(active), no
 *    event-window pagination, works unchanged when day-scale cadences activate;
 *  - market state: the ExpiryMarket shared object (fees, ticks, settlement);
 *  - oracles: devInspect the propbook store getters `pyth_feed::normalized_spot`
 *    / `block_scholes_store::{spot,forward,svi}` — clients pass only expiry_ms
 *    and never derive the provider-defined u256 series ids.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const FLOAT_SCALE = 1_000_000_000;

let sharedClient: SuiGrpcClient | null = null;

function grpcClient() {
  if (!sharedClient) {
    sharedClient = new SuiGrpcClient({
      network: SUI_NETWORK,
      baseUrl: SUI_GRPC_URL,
      // Next.js patches global fetch with a data cache in route handlers;
      // a cached gRPC-web POST would freeze oracle reads at their first value.
      fetchInit: { cache: 'no-store' },
    });
  }
  return sharedClient;
}

async function readObjectJson(objectId: string): Promise<UnknownRecord | null> {
  const { object } = await grpcClient().core.getObject({
    objectId,
    include: { json: true, content: true },
  });
  const json = object.json ? await object.json : null;
  return isRecord(json) ? json : null;
}

/**
 * Run a read-only PTB through gRPC `simulateTransaction` (the devInspect
 * replacement) and return each command's BCS return values. `checksEnabled:
 * false` allows calling non-entry public funs; the zero address stands in as
 * sender for pure reads.
 */
async function inspectReturns(tx: Transaction): Promise<Uint8Array[][]> {
  tx.setSender(normalizeSuiAddress('0x0'));
  const result = await grpcClient().simulateTransaction({
    transaction: tx,
    checksEnabled: false,
    include: { commandResults: true },
  });
  if (result.$kind === 'FailedTransaction') {
    const status = (result.FailedTransaction as { status?: { error?: { message?: string } } })
      ?.status;
    throw new Error(status?.error?.message ?? 'simulateTransaction aborted (FailedTransaction)');
  }
  const commands = (result as { commandResults?: { returnValues: { bcs: Uint8Array }[] }[] })
    .commandResults;
  if (!commands) throw new Error('simulateTransaction returned no commandResults');
  return commands.map((command) => command.returnValues.map((value) => value.bcs));
}

// ---------------------------------------------------------------------------
// Oracle reads (propbook stores)
// ---------------------------------------------------------------------------

/** `propbook::oracle_lane::OracleRead<u64>` (pyth_feed::normalized_spot). */
const OracleReadU64 = bcs.struct('OracleRead', {
  sourceTimestampMs: bcs.u64(),
  updateTimestampMs: bcs.u64(),
  writerDigest: bcs.vector(bcs.u8()),
  value: bcs.u64(),
});

/** `propbook::block_scholes_store::BsRead<u128>` (spot / forward values). */
const BsReadValue = bcs.struct('BsReadValue', {
  modelTimestampMs: bcs.u64(),
  publishedAtMs: bcs.u64(),
  recordedAtMs: bcs.u64(),
  writerDigest: bcs.vector(bcs.u8()),
  value: bcs.u128(),
});

const SviParamsBcs = bcs.struct('SVIParams', {
  aMagnitude: bcs.u128(),
  aIsNegative: bcs.bool(),
  b: bcs.u128(),
  sigma: bcs.u128(),
  rhoMagnitude: bcs.u128(),
  rhoIsNegative: bcs.bool(),
  mMagnitude: bcs.u128(),
  mIsNegative: bcs.bool(),
});

/** `propbook::block_scholes_store::BsRead<SVIParams>`. */
const BsReadSvi = bcs.struct('BsReadSvi', {
  modelTimestampMs: bcs.u64(),
  publishedAtMs: bcs.u64(),
  recordedAtMs: bcs.u64(),
  writerDigest: bcs.vector(bcs.u8()),
  value: SviParamsBcs,
});

function signedChainPrice(magnitude: string, isNegative: boolean): number {
  const value = fromChainPrice(magnitude);
  return isNegative ? -value : value;
}

export interface PropbookOracleReads {
  /** Pyth spot re-anchor (also the settlement price source). */
  pyth: PropbookSpotRead | null;
  bsSpot: PropbookSpotRead | null;
  bsForward: PropbookForwardRead | null;
  bsSvi: PropbookSviRead | null;
}

/**
 * One devInspect round trip for all four oracle lanes of a market's expiry.
 * Block Scholes freshness runs on `model_timestamp_ms` (the provider clock the
 * on-chain pricer asserts on), which maps onto `sourceTimestampMs` here.
 */
export async function fetchPropbookOracleReads(expiryMs: number): Promise<PropbookOracleReads> {
  const propbook = DEEPBOOK_PREDICT.propbookPackageId;
  const valueStore = DEEPBOOK_PREDICT.blockScholesValueStoreId;
  const sviStore = DEEPBOOK_PREDICT.blockScholesSviStoreId;
  const tx = new Transaction();
  tx.moveCall({
    target: `${propbook}::pyth_feed::normalized_spot`,
    arguments: [tx.object(DEEPBOOK_PREDICT.pythFeedId)],
  });
  tx.moveCall({ target: `${propbook}::block_scholes_store::spot`, arguments: [tx.object(valueStore)] });
  tx.moveCall({
    target: `${propbook}::block_scholes_store::forward`,
    arguments: [tx.object(valueStore), tx.pure.u64(expiryMs)],
  });
  tx.moveCall({
    target: `${propbook}::block_scholes_store::svi`,
    arguments: [tx.object(sviStore), tx.pure.u64(expiryMs)],
  });

  const [pythBytes, spotBytes, forwardBytes, sviBytes] = await inspectReturns(tx);

  const pythRead = bcs.option(OracleReadU64).parse(pythBytes[0]);
  const spotRead = bcs.option(BsReadValue).parse(spotBytes[0]);
  const forwardRead = bcs.option(BsReadValue).parse(forwardBytes[0]);
  const sviRead = bcs.option(BsReadSvi).parse(sviBytes[0]);

  const pythSpot = pythRead ? fromChainPrice(pythRead.value) : 0;
  const bsSpotValue = spotRead ? fromChainPrice(spotRead.value) : 0;
  const bsForwardValue = forwardRead ? fromChainPrice(forwardRead.value) : 0;

  return {
    pyth:
      pythRead && pythSpot > 0
        ? {
            spot: pythSpot,
            sourceTimestampMs: Number(pythRead.sourceTimestampMs),
            updateTimestampMs: Number(pythRead.updateTimestampMs),
          }
        : null,
    bsSpot:
      spotRead && bsSpotValue > 0
        ? {
            spot: bsSpotValue,
            sourceTimestampMs: Number(spotRead.modelTimestampMs),
            updateTimestampMs: Number(spotRead.recordedAtMs),
          }
        : null,
    bsForward:
      forwardRead && bsForwardValue > 0
        ? {
            forward: bsForwardValue,
            expiryMs,
            sourceTimestampMs: Number(forwardRead.modelTimestampMs),
            updateTimestampMs: Number(forwardRead.recordedAtMs),
          }
        : null,
    bsSvi: sviRead
      ? {
          expiryMs,
          sourceTimestampMs: Number(sviRead.modelTimestampMs),
          updateTimestampMs: Number(sviRead.recordedAtMs),
          svi: {
            a: signedChainPrice(sviRead.value.aMagnitude, sviRead.value.aIsNegative),
            b: fromChainPrice(sviRead.value.b),
            sigma: fromChainPrice(sviRead.value.sigma),
            rho: signedChainPrice(sviRead.value.rhoMagnitude, sviRead.value.rhoIsNegative),
            m: signedChainPrice(sviRead.value.mMagnitude, sviRead.value.mIsNegative),
          },
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Expiry market state (the ExpiryMarket shared object)
// ---------------------------------------------------------------------------

export interface OnchainExpiryMarketState {
  expiryMarketId: string;
  expiryMs: number;
  /** Chain-scaled (1e9) tick sizes, matching the on-chain object. */
  tickSizeRaw: number;
  admissionTickSizeRaw: number;
  propbookUnderlyingId: number;
  /** 1e9-scaled probabilities/rates, converted by callers via `/ 1e9`. */
  baseFeeRaw: number;
  minFeeRaw: number;
  minEntryProbabilityRaw: number;
  maxEntryProbabilityRaw: number;
  expiryFeeWindowMs: number;
  expiryFeeMaxMultiplierRaw: number;
  mintPaused: boolean;
  settlementPriceBaseUnits: bigint | null;
}

export function parseExpiryMarketObject(json: unknown): OnchainExpiryMarketState | null {
  if (!isRecord(json)) return null;
  const expiryMarketId = typeof json.id === 'string' ? json.id : null;
  const expiryMs = finiteNumber(json.expiry);
  const strikeExposure = isRecord(json.strike_exposure) ? json.strike_exposure : null;
  const config = strikeExposure && isRecord(strikeExposure.config) ? strikeExposure.config : null;
  if (!expiryMarketId || expiryMs === null || !strikeExposure || !config) return null;

  const tickSizeRaw = finiteNumber(strikeExposure.tick_size);
  const admissionTickSizeRaw = finiteNumber(strikeExposure.admission_tick_size);
  const propbookUnderlyingId = finiteNumber(json.propbook_underlying_id);
  const baseFeeRaw = finiteNumber(config.base_fee);
  const minFeeRaw = finiteNumber(config.min_fee);
  const minEntryProbabilityRaw = finiteNumber(config.min_entry_probability);
  const maxEntryProbabilityRaw = finiteNumber(config.max_entry_probability);
  const expiryFeeWindowMs = finiteNumber(config.expiry_fee_window_ms);
  const expiryFeeMaxMultiplierRaw = finiteNumber(config.expiry_fee_max_multiplier);
  if (
    tickSizeRaw === null ||
    admissionTickSizeRaw === null ||
    propbookUnderlyingId === null ||
    baseFeeRaw === null ||
    minFeeRaw === null ||
    minEntryProbabilityRaw === null ||
    maxEntryProbabilityRaw === null ||
    expiryFeeWindowMs === null ||
    expiryFeeMaxMultiplierRaw === null
  ) {
    return null;
  }

  const settlementRaw = strikeExposure.settlement_price;
  const settlementPriceBaseUnits =
    typeof settlementRaw === 'string' && /^(0|[1-9]\d*)$/.test(settlementRaw)
      ? BigInt(settlementRaw)
      : null;

  return {
    expiryMarketId,
    expiryMs,
    tickSizeRaw,
    admissionTickSizeRaw,
    propbookUnderlyingId,
    baseFeeRaw,
    minFeeRaw,
    minEntryProbabilityRaw,
    maxEntryProbabilityRaw,
    expiryFeeWindowMs,
    expiryFeeMaxMultiplierRaw,
    mintPaused: Boolean(json.mint_paused),
    settlementPriceBaseUnits,
  };
}

export async function fetchExpiryMarketState(
  expiryMarketId: string,
): Promise<OnchainExpiryMarketState> {
  const json = await readObjectJson(expiryMarketId);
  const state = parseExpiryMarketObject(json);
  if (!state) {
    throw new Error(`Expiry market object is unreadable for ${expiryMarketId}`);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Market discovery (active set + cadence fingerprints)
// ---------------------------------------------------------------------------

const VectorOfIds = bcs.vector(bcs.Address);

/** Pool-active, not-yet-settled markets — `plp::active_expiry_markets(vault)`. */
export async function fetchActiveExpiryMarketIds(): Promise<string[]> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PREDICT.packageId}::plp::active_expiry_markets`,
    arguments: [tx.object(DEEPBOOK_PREDICT.poolVaultId)],
  });
  const [command] = await inspectReturns(tx);
  return VectorOfIds.parse(command[0]).map((id) => normalizeSuiAddress(id));
}

let registeredExpiriesTableId: string | null = null;

/** The vault's `expiry_accounting.registered_expiries` table UID (stable per deployment). */
async function fetchRegisteredExpiriesTableId(): Promise<string | null> {
  if (registeredExpiriesTableId) return registeredExpiriesTableId;
  const vault = await readObjectJson(DEEPBOOK_PREDICT.poolVaultId);
  const accounting = vault && isRecord(vault.expiry_accounting) ? vault.expiry_accounting : null;
  const table = accounting && isRecord(accounting.registered_expiries) ? accounting.registered_expiries : null;
  registeredExpiriesTableId = table && typeof table.id === 'string' ? table.id : null;
  return registeredExpiriesTableId;
}

interface RegisteredExpiryFingerprint {
  maxExpiryAllocation: string;
  initialExpiryCash: string;
}

/**
 * The pool's per-market funding record. Its allocation/cash pair is the cadence
 * fingerprint `tenorMarkets.matchesCadenceFingerprint` keys on.
 */
async function fetchRegisteredExpiry(
  expiryMarketId: string,
): Promise<RegisteredExpiryFingerprint | null> {
  const tableId = await fetchRegisteredExpiriesTableId();
  if (!tableId) return null;
  try {
    const { dynamicField } = await grpcClient().core.getDynamicField({
      parentId: tableId,
      name: {
        type: '0x2::object::ID',
        bcs: bcs.Address.serialize(expiryMarketId).toBytes(),
      },
    });
    const { object } = await grpcClient().core.getObject({
      objectId: dynamicField.fieldId,
      include: { json: true },
    });
    const json = object.json ? await object.json : null;
    const value = isRecord(json) && isRecord(json.value) ? json.value : null;
    if (!value) return null;
    const maxExpiryAllocation =
      typeof value.max_expiry_allocation === 'string' ? value.max_expiry_allocation : null;
    const initialExpiryCash =
      typeof value.initial_expiry_cash === 'string' ? value.initial_expiry_cash : null;
    if (!maxExpiryAllocation || !initialExpiryCash) return null;
    return { maxExpiryAllocation, initialExpiryCash };
  } catch {
    return null;
  }
}

/**
 * On-chain replacement for the retired indexer `/markets?active=true` row set.
 * Markets whose funding record cannot be read are dropped (their cadence would
 * be unknowable) — same silent-drop contract the row parser had.
 */
export async function fetchActiveExpiryMarketSummariesOnchain(): Promise<ExpiryMarketSummary[]> {
  const ids = await fetchActiveExpiryMarketIds();
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [state, registered] = await Promise.all([
        fetchExpiryMarketState(id).catch(() => null),
        fetchRegisteredExpiry(id),
      ]);
      if (!state || !registered || state.settlementPriceBaseUnits !== null) return null;
      return {
        expiryMarketId: state.expiryMarketId,
        expiryMs: state.expiryMs,
        tickSize: fromChainPrice(state.tickSizeRaw),
        admissionTickSize: fromChainPrice(state.admissionTickSizeRaw),
        maxExpiryAllocation: registered.maxExpiryAllocation,
        initialExpiryCash: registered.initialExpiryCash,
        packageId: DEEPBOOK_PREDICT.packageId,
        poolVaultId: DEEPBOOK_PREDICT.poolVaultId,
        propbookUnderlyingId: state.propbookUnderlyingId,
        baseFee: state.baseFeeRaw / FLOAT_SCALE,
        minFee: state.minFeeRaw / FLOAT_SCALE,
        minEntryProbability: state.minEntryProbabilityRaw / FLOAT_SCALE,
        maxEntryProbability: state.maxEntryProbabilityRaw / FLOAT_SCALE,
      } satisfies ExpiryMarketSummary;
    }),
  );
  return rows.filter((row): row is ExpiryMarketSummary => row !== null);
}
