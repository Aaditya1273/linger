import { describe, expect, it } from 'vitest';
import type { CuratedOracleListItem } from '../server/curatedOracles';
import { defaultOracleSelection } from './useMarketData';

function dayOracle(id: string, expiry: number): CuratedOracleListItem {
  return {
    predict_id: id,
    oracle_id: id,
    underlying_asset: 'BTC',
    expiry,
    min_strike: 1_000,
    tick_size: 1_000,
    admission_tick_size: 1_000,
    status: 'active',
    group: 'day',
    stateReady: true,
    quoteReady: true,
    productReady: true,
    timeToExpiryMs: expiry - 1_700_000_000_000,
  };
}

function hourlyOracle(id: string, expiry: number): CuratedOracleListItem {
  return {
    ...dayOracle(id, expiry),
    group: 'hourly',
    cadence: '1h',
  };
}

describe('defaultOracleSelection', () => {
  const nowMs = 1_700_000_000_000;

  it('defaults to the furthest day row when the day ladder is present', () => {
    const oracles = [
      dayOracle('day-near', nowMs + 2 * 86_400_000),
      dayOracle('day-mid', nowMs + 20 * 86_400_000),
      dayOracle('day-far', nowMs + 48 * 86_400_000),
      hourlyOracle('hour-1', nowMs + 3_600_000),
    ];

    expect(defaultOracleSelection(oracles, nowMs)?.oracle_id).toBe('day-far');
  });

  it('falls back to the nearest tradable hourly row when no day rows exist', () => {
    const oracles = [
      hourlyOracle('hour-later', nowMs + 6 * 3_600_000),
      hourlyOracle('hour-near', nowMs + 2 * 3_600_000),
    ];

    expect(defaultOracleSelection(oracles, nowMs)?.oracle_id).toBe('hour-near');
  });
});
