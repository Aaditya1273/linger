import { DEEPBOOK_PREDICT } from '../config/deepbook';
import type { ExpiryMarketSummary } from './predictAdapter';
import type { OracleMarket } from '../products/types';
import { DAY_MS } from '../products/tenorMarkets';

const DAY_SCALE_ALLOC = '999000000000';
const DAY_SCALE_CASH = '999000000000';

/** Stable fixture ids for deterministic E2E day rows — never a production data source. */
export const DAY_SCALE_FIXTURE_IDS = {
  d1: '0xday000000000000000000000000000000000000000000000000000000000001',
  d3: '0xday000000000000000000000000000000000000000000000000000000000003',
  d7: '0xday000000000000000000000000000000000000000000000000000000000007',
} as const;

function dayScaleSummary(input: { id: string; expiryMs: number }): ExpiryMarketSummary {
  return {
    expiryMarketId: input.id,
    expiryMs: input.expiryMs,
    tickSize: 0.01,
    admissionTickSize: 1,
    maxExpiryAllocation: DAY_SCALE_ALLOC,
    initialExpiryCash: DAY_SCALE_CASH,
    packageId: DEEPBOOK_PREDICT.packageId,
    poolVaultId: DEEPBOOK_PREDICT.poolVaultId,
    propbookUnderlyingId: DEEPBOOK_PREDICT.oracle.propbookUnderlyingId,
    baseFee: 0.02,
    minFee: 0.005,
    minEntryProbability: 0.01,
    maxEntryProbability: 0.99,
  };
}

/** Day-scale Expiry Market summaries used when upstream has no day-scale markets. */
export function dayScaleFixtureMarkets(nowMs = Date.now()): ExpiryMarketSummary[] {
  return [
    dayScaleSummary({ id: DAY_SCALE_FIXTURE_IDS.d1, expiryMs: nowMs + 1 * DAY_MS }),
    dayScaleSummary({ id: DAY_SCALE_FIXTURE_IDS.d3, expiryMs: nowMs + 3 * DAY_MS }),
    dayScaleSummary({ id: DAY_SCALE_FIXTURE_IDS.d7, expiryMs: nowMs + 7 * DAY_MS }),
  ];
}

/** Browse OracleMarket snapshot for day-scale fixture tenors (SVI omitted — indicative only). */
export function dayScaleMarketSnapshot(input?: {
  nowMs?: number;
  expiryMarketId?: string;
}): OracleMarket {
  const nowMs = input?.nowMs ?? Date.now();
  const fixtures = dayScaleFixtureMarkets(nowMs);
  const selected =
    fixtures.find((market) => market.expiryMarketId === input?.expiryMarketId) ?? fixtures[2] ?? fixtures[0];

  return {
    predictId: DEEPBOOK_PREDICT.poolVaultId,
    oracleId: selected.expiryMarketId,
    underlyingAsset: 'BTC',
    expiryMs: selected.expiryMs,
    minStrike: selected.admissionTickSize,
    tickSize: selected.tickSize,
    admissionTickSize: selected.admissionTickSize,
    status: 'active',
    spot: 63_960.99160736,
    forward: 63_960.99160736,
    spotTimestampMs: nowMs - 60_000,
    sviTimestampMs: nowMs - 60_000,
    serverLagSeconds: 1,
  };
}
