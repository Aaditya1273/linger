import { describe, expect, it } from 'vitest';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import type { ExpiryMarketSummary } from './predictAdapter';
import {
  expiryMarketToListItem,
  filterProductExpiryOracles,
  parsePredictPricingState,
  selectNearestTradableOracle,
  type PredictOracleListItem,
} from './predictServer';

function listItem(
  input: Partial<PredictOracleListItem> & { oracle_id: string; expiry: number },
): PredictOracleListItem {
  return {
    predict_id: 'pool-vault',
    oracle_id: input.oracle_id,
    underlying_asset: 'BTC',
    expiry: input.expiry,
    min_strike: 1,
    tick_size: 0.01,
    admission_tick_size: 1,
    status: 'active',
    cadence: '1h',
    group: 'hourly',
  };
}

function marketSummary(input: {
  id: string;
  expiryMs: number;
  maxExpiryAllocation: string;
  initialExpiryCash: string;
}): ExpiryMarketSummary {
  return {
    expiryMarketId: input.id,
    expiryMs: input.expiryMs,
    tickSize: 0.01,
    admissionTickSize: 1,
    maxExpiryAllocation: input.maxExpiryAllocation,
    initialExpiryCash: input.initialExpiryCash,
    packageId: DEEPBOOK_PREDICT.packageId,
    poolVaultId: DEEPBOOK_PREDICT.poolVaultId,
    propbookUnderlyingId: 1,
    baseFee: 0.02,
    minFee: 0.005,
    minEntryProbability: 0.01,
    maxEntryProbability: 0.99,
  };
}

describe('expiryMarketToListItem', () => {
  it('labels cadence by the market fingerprint, not the shelf it sells on', () => {
    const trueHourly = marketSummary({
      id: '0x1h',
      expiryMs: 1_700_000_000_000,
      maxExpiryAllocation: DEEPBOOK_PREDICT.turboCadence.maxExpiryAllocation,
      initialExpiryCash: DEEPBOOK_PREDICT.turboCadence.initialExpiryCash,
    });
    // A decayed day market sells on the hourly shelf (ADR-0007) but is not
    // a 1h-cadence market; claiming '1h' would misstate its schedule.
    const decayedDay = marketSummary({
      id: '0xdecayed-day',
      expiryMs: 1_700_000_000_000,
      maxExpiryAllocation: '999000000000',
      initialExpiryCash: '999000000000',
    });

    expect(expiryMarketToListItem(trueHourly, 'hourly').cadence).toBe('1h');
    expect(expiryMarketToListItem(decayedDay, 'hourly').cadence).toBeUndefined();
    expect(expiryMarketToListItem(decayedDay, 'day').cadence).toBeUndefined();
  });
});

describe('predictServer parsers', () => {
  it('parses Predict vault utilization pricing state', () => {
    expect(
      parsePredictPricingState({
        vault_balance: '1000000000',
        total_mtm: '250000000',
        utilization: '0.25',
      }),
    ).toEqual({
      baseSpread: 0.02,
      minSpread: 0.005,
      baseFee: 0.02,
      minFee: 0.005,
      utilizationMultiplier: 2,
      minAskPrice: 0.01,
      maxAskPrice: 0.99,
      vaultBalance: 1000,
      vaultTotalMtm: 250,
      vaultUtilization: 0.25,
      ewmaPenaltyRate: 0,
      expiryFeeWindowMs: undefined,
      expiryFeeMaxMultiplier: undefined,
    });
  });

  it('skips active markets that are too close to expiry', () => {
    const now = 1_000;
    const selected = selectNearestTradableOracle(
      [
        listItem({ oracle_id: 'near', expiry: now + 60_000 }),
        listItem({ oracle_id: 'tradable', expiry: now + 10 * 60_000 }),
      ],
      now,
    );

    expect(selected?.oracle_id).toBe('tradable');
  });

  it('filters selector options by remaining time to expiry', () => {
    const now = 1_000;
    const options = filterProductExpiryOracles(
      [
        listItem({ oracle_id: 'one-hour', expiry: now + 1 * 60 * 60_000 }),
        listItem({ oracle_id: 'two-hour', expiry: now + 2 * 60 * 60_000 }),
        listItem({ oracle_id: 'three-hour', expiry: now + 3 * 60 * 60_000 }),
      ],
      now,
      90 * 60_000,
    );

    expect(options.map((oracle) => oracle.oracle_id)).toEqual(['two-hour', 'three-hour']);
  });
});
