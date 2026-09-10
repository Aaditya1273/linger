import { describe, expect, it } from 'vitest';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import type { ExpiryMarketSummary } from '../deepbook/predictAdapter';
import { DAY_MS, filterMarketsForTenorGroup } from './tenorMarkets';

const HOUR_ALLOC = DEEPBOOK_PREDICT.turboCadence.maxExpiryAllocation;
const HOUR_CASH = DEEPBOOK_PREDICT.turboCadence.initialExpiryCash;
const MINUTE_ALLOC = '50000000000';
const MINUTE_CASH = '10000000000';
const HOUR_MS = 3_600_000;

function market(input: {
  id: string;
  expiryMs: number;
  maxExpiryAllocation?: string;
  initialExpiryCash?: string;
}): ExpiryMarketSummary {
  return {
    expiryMarketId: input.id,
    expiryMs: input.expiryMs,
    tickSize: 0.01,
    admissionTickSize: 1,
    maxExpiryAllocation: input.maxExpiryAllocation ?? HOUR_ALLOC,
    initialExpiryCash: input.initialExpiryCash ?? HOUR_CASH,
    packageId: DEEPBOOK_PREDICT.packageId,
    poolVaultId: DEEPBOOK_PREDICT.poolVaultId,
    propbookUnderlyingId: 1,
    baseFee: 0.02,
    minFee: 0.005,
    minEntryProbability: 0.01,
    maxEntryProbability: 0.99,
  };
}

describe('filterMarketsForTenorGroup', () => {
  const nowMs = 1_700_000_000_000;

  it('never shelves minute-cadence markets, and keeps day-remaining rows off the hourly shelf', () => {
    const markets = [
      market({
        id: '0x1m',
        expiryMs: nowMs + 60_000,
        maxExpiryAllocation: MINUTE_ALLOC,
        initialExpiryCash: MINUTE_CASH,
      }),
      market({
        id: '0x5m',
        expiryMs: nowMs + 5 * 60_000,
        maxExpiryAllocation: MINUTE_ALLOC,
        initialExpiryCash: MINUTE_CASH,
      }),
      market({ id: '0x1h', expiryMs: nowMs + 3 * HOUR_MS }),
      market({ id: '0x3d-1h-fingerprint', expiryMs: nowMs + 3 * DAY_MS }),
    ];

    expect(filterMarketsForTenorGroup(markets, 'hourly', { nowMs }).map((row) => row.expiryMarketId)).toEqual([
      '0x1h',
    ]);
    expect(filterMarketsForTenorGroup(markets, 'day', { nowMs }).map((row) => row.expiryMarketId)).toEqual([
      '0x3d-1h-fingerprint',
    ]);
  });

  it('moves a decayed day market (9.5h remaining) onto the hourly shelf (ADR-0007 regression)', () => {
    // Live case: born 29.6h before expiry, 9.5h remaining — an intraday trade,
    // sold beside the other per-period rows. Day-scale fingerprint on purpose:
    // the hourly predicate is exclusion-based, not 1h-fingerprint inclusion.
    const expiryMs = nowMs + 9.5 * HOUR_MS;
    const markets = [
      market({
        id: '0xdecayed-day',
        expiryMs,
        maxExpiryAllocation: '999000000000',
        initialExpiryCash: '999000000000',
      }),
      market({
        id: '0xtrue-hourly',
        expiryMs: nowMs + 3 * HOUR_MS,
      }),
    ];

    expect(filterMarketsForTenorGroup(markets, 'hourly', { nowMs }).map((row) => row.expiryMarketId)).toEqual([
      '0xtrue-hourly',
      '0xdecayed-day',
    ]);
    expect(filterMarketsForTenorGroup(markets, 'day', { nowMs })).toEqual([]);
  });

  it('lists only markets with at least one day remaining on the day shelf; the 24h line is exact', () => {
    const dayScale = { maxExpiryAllocation: '999000000000', initialExpiryCash: '999000000000' };
    const markets = [
      market({ id: '0x1h', expiryMs: nowMs + HOUR_MS }),
      market({ id: '0xjust-under-1d', expiryMs: nowMs + DAY_MS - 1, ...dayScale }),
      market({ id: '0x1d', expiryMs: nowMs + DAY_MS, ...dayScale }),
      market({ id: '0x7d', expiryMs: nowMs + 7 * DAY_MS, ...dayScale }),
    ];

    expect(filterMarketsForTenorGroup(markets, 'day', { nowMs }).map((row) => row.expiryMarketId)).toEqual([
      '0x1d',
      '0x7d',
    ]);
    expect(filterMarketsForTenorGroup(markets, 'hourly', { nowMs }).map((row) => row.expiryMarketId)).toEqual([
      '0x1h',
      '0xjust-under-1d',
    ]);
  });

  it('sorts an hourly shelf spanning 1-23h by expiry and drops expired rows', () => {
    const dayScale = { maxExpiryAllocation: '999000000000', initialExpiryCash: '999000000000' };
    const markets = [
      market({ id: '0x23h', expiryMs: nowMs + 23 * HOUR_MS, ...dayScale }),
      market({ id: '0x1h', expiryMs: nowMs + HOUR_MS }),
      market({ id: '0xexpired', expiryMs: nowMs - HOUR_MS, ...dayScale }),
      market({ id: '0x9h', expiryMs: nowMs + 9.5 * HOUR_MS, ...dayScale }),
      market({ id: '0x4h', expiryMs: nowMs + 4 * HOUR_MS, ...dayScale }),
    ];

    expect(filterMarketsForTenorGroup(markets, 'hourly', { nowMs }).map((row) => row.expiryMarketId)).toEqual([
      '0x1h',
      '0x4h',
      '0x9h',
      '0x23h',
    ]);
  });
});
