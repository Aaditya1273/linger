import { describe, expect, it } from 'vitest';
import type { PredictOracleListItem } from '../deepbook/predictServer';
import { curateBtcOracles, type OracleReadiness } from './curatedOracles';

function oracle(
  input: Partial<PredictOracleListItem> & { oracle_id: string; expiry: number },
): PredictOracleListItem {
  return {
    predict_id: 'pool-vault',
    oracle_id: input.oracle_id,
    underlying_asset: input.underlying_asset ?? 'BTC',
    expiry: input.expiry,
    min_strike: input.min_strike ?? 1,
    tick_size: input.tick_size ?? 0.01,
    admission_tick_size: input.admission_tick_size ?? 1,
    status: input.status ?? 'active',
    cadence: '1h',
    group: 'hourly',
  };
}

describe('curateBtcOracles', () => {
  it('keeps Turbo 1h markets that are state-ready even when quotes are incomplete', () => {
    const now = 1_000;
    const readiness = new Map<string, OracleReadiness>([
      ['one-hour', { stateReady: true, quoteReady: false, reason: 'SVI pending' }],
      ['two-hour', { stateReady: true, quoteReady: true }],
      ['not-ready', { stateReady: false, quoteReady: false, reason: 'spot missing' }],
    ]);

    const curated = curateBtcOracles(
      [
        oracle({ oracle_id: 'one-hour', expiry: now + 1 * 60 * 60_000 }),
        oracle({ oracle_id: 'two-hour', expiry: now + 2 * 60 * 60_000 }),
        oracle({ oracle_id: 'not-ready', expiry: now + 3 * 60 * 60_000 }),
      ],
      readiness,
      now,
    );

    expect(curated.map((item) => item.oracle_id)).toEqual(['one-hour', 'two-hour']);
    expect(curated[0]).toMatchObject({
      oracle_id: 'one-hour',
      productReady: true,
      quoteReady: false,
      stateReady: true,
      reason: 'SVI pending',
    });
  });

  it('deduplicates markets with the same expiry and strike grid', () => {
    const now = 1_000;
    const expiry = now + 3_600_000;
    const readiness = new Map<string, OracleReadiness>([
      ['stale-duplicate', { stateReady: true, quoteReady: false, reason: 'no live quote' }],
      ['ready-duplicate', { stateReady: true, quoteReady: true }],
      ['next-expiry', { stateReady: true, quoteReady: true }],
    ]);

    const curated = curateBtcOracles(
      [
        oracle({ oracle_id: 'stale-duplicate', expiry }),
        oracle({ oracle_id: 'ready-duplicate', expiry }),
        oracle({ oracle_id: 'next-expiry', expiry: expiry + 3_600_000 }),
      ],
      readiness,
      now,
    );

    expect(curated.map((item) => item.oracle_id)).toEqual(['ready-duplicate', 'next-expiry']);
  });

  it('keeps a product expiry when every duplicate has a non-mintable representative quote', () => {
    const now = 1_000;
    const expiry = now + 3_600_000;
    const readiness = new Map<string, OracleReadiness>([
      ['unready-a', { stateReady: true, quoteReady: false, reason: 'ask outside bounds' }],
      ['unready-b', { stateReady: true, quoteReady: false, reason: 'ask outside bounds' }],
    ]);

    const curated = curateBtcOracles(
      [
        oracle({ oracle_id: 'unready-a', expiry }),
        oracle({ oracle_id: 'unready-b', expiry }),
      ],
      readiness,
      now,
    );

    expect(curated).toHaveLength(1);
    expect(curated[0]?.productReady).toBe(true);
    expect(curated[0]?.quoteReady).toBe(false);
  });
});
