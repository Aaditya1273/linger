import { describe, expect, it } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { createPredictAdapter, type ExpiryMarketSummary } from './predictAdapter';

const HOUR_ALLOC = DEEPBOOK_PREDICT.turboCadence.maxExpiryAllocation;
const HOUR_CASH = DEEPBOOK_PREDICT.turboCadence.initialExpiryCash;
const MINUTE_ALLOC = '50000000000';
const MINUTE_CASH = '10000000000';
const DAY_ALLOC = '999000000000';
const DAY_CASH = '999000000000';

function marketSummary(input: {
  id: string;
  expiry: number;
  maxExpiryAllocation: string;
  initialExpiryCash: string;
}): ExpiryMarketSummary {
  return {
    expiryMarketId: input.id,
    expiryMs: input.expiry,
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

describe('PredictAdapter market discovery', () => {
  it('shelves discovery by remaining tenor: hourly keeps decayed day rows, drops minute rows', async () => {
    const nowMs = 1_700_000_000_000;
    const dayMs = 86_400_000;
    const payload = [
      marketSummary({
        id: '0x1m',
        expiry: nowMs + 60_000,
        maxExpiryAllocation: MINUTE_ALLOC,
        initialExpiryCash: MINUTE_CASH,
      }),
      marketSummary({
        id: '0x1h-past',
        expiry: nowMs - 1,
        maxExpiryAllocation: HOUR_ALLOC,
        initialExpiryCash: HOUR_CASH,
      }),
      marketSummary({
        id: '0xdecayed-day',
        expiry: nowMs + 9 * 3_600_000,
        maxExpiryAllocation: DAY_ALLOC,
        initialExpiryCash: DAY_CASH,
      }),
      marketSummary({
        id: '0x1h-a',
        expiry: nowMs + 3_600_000,
        maxExpiryAllocation: HOUR_ALLOC,
        initialExpiryCash: HOUR_CASH,
      }),
      marketSummary({
        id: '0x3d',
        expiry: nowMs + 3 * dayMs,
        maxExpiryAllocation: DAY_ALLOC,
        initialExpiryCash: DAY_CASH,
      }),
    ];
    const fetchMarkets = async () => payload;

    const hourly = await createPredictAdapter({ fetchMarkets }).discoverMarkets({ nowMs });
    expect(hourly.map((market) => market.expiryMarketId)).toEqual(['0x1h-a', '0xdecayed-day']);

    const day = await createPredictAdapter({ fetchMarkets, group: 'day' }).discoverMarkets({ nowMs });
    expect(day.map((market) => market.expiryMarketId)).toEqual(['0x3d']);
  });
});

describe('PredictAdapter settled leg redemption', () => {
  it('adds one permissionless settled redemption command per Note order id', async () => {
    const tx = new Transaction();
    const calls = createPredictAdapter().redeemLegs({
      tx,
      expiryMarketId: `0x${'1'.repeat(64)}`,
      wrapperId: `0x${'2'.repeat(64)}`,
      legs: [
        { orderId: 11n, quantityBaseUnits: 40_000n },
        { orderId: 22n, quantityBaseUnits: 60_000n },
      ],
      config: {
        predictPackageId: `0x${'3'.repeat(64)}`,
        accountRegistryId: `0x${'4'.repeat(64)}`,
        protocolConfigId: `0x${'5'.repeat(64)}`,
        accumulatorRoot: `0x${'8'.repeat(64)}`,
      },
    });

    expect(calls).toEqual([
      `${`0x${'3'.repeat(64)}`}::expiry_market::redeem_settled_permissionless`,
      `${`0x${'3'.repeat(64)}`}::expiry_market::redeem_settled_permissionless`,
    ]);
    expect(await tx.toJSON()).toContain('redeem_settled_permissionless');
  });
});
